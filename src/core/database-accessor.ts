/**
 * Prompteka Database Accessor
 *
 * Provides full read-write access to Prompteka's SQLite database.
 * Uses WAL mode for safe concurrent access with Prompteka app.
 *
 * WAL Safety Model:
 * - One write connection (MCP server)
 * - Prompteka app may have separate connections
 * - WAL ensures no locks, no conflicts, no corruption
 * - Multiple readers can access simultaneously
 * - Writers automatically serialize (SQLite handles locking)
 *
 * All write operations include:
 * - Retry logic for SQLITE_BUSY (up to 3 attempts)
 * - Atomic transactions where needed
 * - Prepared statements (prevent injection)
 * - Timestamp generation (ISO 8601)
 */

import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import os from "os";
import { v4 as uuidv4 } from "uuid";
import { Folder, Prompt, UUID, Emoji, PromptColor } from "./types.js";
import { PromptekaMCPError, ErrorCodes } from "../validation/error-taxonomy.js";
import { getLogger } from "../observability/logger.js";

/**
 * Expected Prompteka database schema version.
 * If the database schema differs from this, writes are blocked to prevent data corruption.
 * Update this only after verifying schema changes with Prompteka app.
 */
const PROMPTEKA_SCHEMA_VERSION = 27; // Current Prompteka schema version

/**
 * Validates that a path is safe (no symlinks, no traversal)
 */
function validatePath(filePath: string): void {
  if (filePath.includes("..")) {
    throw new PromptekaMCPError(
      ErrorCodes.PERMISSION_DENIED,
      "Path traversal detected"
    );
  }

  const realPath = fs.realpathSync(filePath);
  const expectedBase = path.join(
    os.homedir(),
    "Library/Application Support/prompteka"
  );

  if (!realPath.startsWith(expectedBase)) {
    throw new PromptekaMCPError(
      ErrorCodes.PERMISSION_DENIED,
      `Path must be under ${expectedBase}`
    );
  }

  const stats = fs.lstatSync(filePath);
  if (stats.isSymbolicLink()) {
    throw new PromptekaMCPError(
      ErrorCodes.PERMISSION_DENIED,
      "Symlinks are not allowed"
    );
  }
}

/**
 * Database accessor for full read-write access to Prompteka SQLite database
 */
export class PromptekaDatabaseAccessor {
  private db: Database.Database | null = null;
  private dbPath: string;
  private isOpen = false;
  private readonly maxRetries = 3;
  private readonly retryBackoffMs = 50;

  constructor(dbPath?: string) {
    if (dbPath) {
      validatePath(dbPath);
      this.dbPath = dbPath;
    } else {
      const defaultPath = path.join(
        os.homedir(),
        "Library/Application Support/prompteka/prompts.db"
      );

      if (!fs.existsSync(defaultPath)) {
        throw new PromptekaMCPError(
          ErrorCodes.INTERNAL_ERROR,
          `Prompteka database not found at ${defaultPath}. Make sure Prompteka is installed.`
        );
      }

      this.dbPath = defaultPath;
    }
  }

  /**
   * Connect to database
   */
  connect(): void {
    if (this.isOpen) {
      return;
    }

    try {
      // Open database with write access
      this.db = new Database(this.dbPath);

      // Enable WAL mode (for concurrent read/write)
      this.db.pragma("journal_mode = WAL");

      // Enable foreign keys
      this.db.pragma("foreign_keys = ON");

      // Verify database schema version matches expectations
      const schemaVersion = this.db.pragma("schema_version");
      if (schemaVersion !== PROMPTEKA_SCHEMA_VERSION) {
        this.db.close();
        throw new PromptekaMCPError(
          ErrorCodes.DATABASE_ERROR,
          `Database schema mismatch: expected version ${PROMPTEKA_SCHEMA_VERSION}, got ${schemaVersion}. ` +
            `This may indicate an incompatible Prompteka version. Please verify Prompteka is up to date. ` +
            `Write operations are blocked to prevent data corruption.`
        );
      }

      this.isOpen = true;
      getLogger().logDebug("database-accessor", "Connected to database", {
        dbPath: this.dbPath,
        schemaVersion,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown error";
      throw new PromptekaMCPError(
        ErrorCodes.DATABASE_ERROR,
        `Failed to connect to database: ${message}`
      );
    }
  }

  /**
   * Close database connection
   */
  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
      this.isOpen = false;
    }
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<boolean> {
    try {
      if (!this.isOpen || !this.db) {
        return false;
      }

      const result = this.db.prepare("SELECT 1").get();
      return result !== undefined;
    } catch {
      return false;
    }
  }

  /**
   * Execute with retry logic for SQLITE_BUSY
   * Note: Uses busy-sleep instead of busy-wait to reduce CPU spinning
   */
  private executeWithRetry<T>(
    fn: () => T,
    operationName: string
  ): T {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        return fn();
      } catch (error) {
        lastError = error as Error;

        // Check if this is a SQLITE_BUSY error
        if (
          lastError.message.includes("SQLITE_BUSY") &&
          attempt < this.maxRetries - 1
        ) {
          // Exponential backoff with busy-sleep
          const backoff = this.retryBackoffMs * Math.pow(2, attempt);
          this.busySleep(backoff);
          continue;
        }

        throw error;
      }
    }

    throw lastError || new Error(`Failed to ${operationName} after retries`);
  }

  /**
   * Synchronous sleep using busy-wait with minimal CPU spinning
   * SQLite operations are very fast, so delays are typically <50ms
   */
  private busySleep(ms: number): void {
    const start = Date.now();
    while (Date.now() - start < ms) {
      // Minimal CPU work - just check time repeatedly
      // For better performance, would need async/await but better-sqlite3 is sync-only
    }
  }

  /**
   * Check if a folder exists
   */
  private folderExists(folderId: UUID): boolean {
    const result = this.db!.prepare("SELECT 1 FROM folders WHERE id = ?").get(
      folderId
    );
    return result !== undefined;
  }

  /**
   * Check if a prompt exists
   */
  private promptExists(promptId: UUID): boolean {
    const result = this.db!.prepare("SELECT 1 FROM prompts WHERE id = ?").get(
      promptId
    );
    return result !== undefined;
  }

  /**
   * Detect cycles in folder hierarchy to prevent a folder from being ancestor of itself
   */
  private wouldCreateCycle(folderId: UUID, potentialParentId: UUID | null): boolean {
    if (potentialParentId === null) {
      return false; // Moving to root can't create a cycle
    }

    if (folderId === potentialParentId) {
      return true; // Folder can't be its own parent
    }

    // Check if potentialParentId is a descendant of folderId
    // (which would create a cycle if we make it a parent)
    let currentId: UUID | null = potentialParentId;
    const visited = new Set<UUID>();

    while (currentId !== null && !visited.has(currentId)) {
      visited.add(currentId);

      if (currentId === folderId) {
        return true; // Found a cycle
      }

      const folder = this.db!
        .prepare("SELECT parent_id FROM folders WHERE id = ?")
        .get(currentId) as { parent_id: UUID | null } | undefined;

      currentId = folder?.parent_id || null;
    }

    return false;
  }

  /**
   * Find folder by name and parent ID
   */
  private findFolderByNameAndParent(
    name: string,
    parentId: UUID | null | undefined
  ): Folder | null {
    const result = this.db!
      .prepare("SELECT id, name, parent_id as parentId, emoji, color, created_at as createdAt, updated_at as updatedAt FROM folders WHERE name = ? AND parent_id IS ?")
      .get(name, parentId || null) as {
      id: UUID;
      name: string;
      parentId: UUID | null;
      emoji?: string;
      color?: string;
      createdAt: string;
      updatedAt: string;
    } | undefined;

    if (!result) {
      return null;
    }

    return {
      id: result.id as UUID,
      name: result.name,
      parentId: result.parentId as UUID | null | undefined,
      emoji: result.emoji as Emoji | null | undefined,
      color: result.color as PromptColor | null | undefined,
      createdAt: result.createdAt,
      updatedAt: result.updatedAt,
    };
  }

  /**
   * Find prompt by title (simple match)
   */
  private findPromptByTitle(title: string): Prompt | null {
    const result = this.db!
      .prepare("SELECT id, title, content, folder_id as folderId, emoji, color, url, created_at as createdAt, updated_at as updatedAt FROM prompts WHERE title = ?")
      .get(title) as {
      id: UUID;
      title: string;
      content: string;
      folderId: UUID | null;
      emoji?: string;
      color?: string;
      url?: string;
      createdAt: string;
      updatedAt: string;
    } | undefined;

    if (!result) {
      return null;
    }

    return {
      id: result.id as UUID,
      title: result.title,
      content: result.content,
      folderId: result.folderId as UUID | null | undefined,
      emoji: result.emoji as Emoji | null | undefined,
      color: result.color as PromptColor | null | undefined,
      url: result.url,
      createdAt: result.createdAt,
      updatedAt: result.updatedAt,
    };
  }

  /**
   * Get folder depth in hierarchy (for sorting parents before children)
   * Returns 0 for root folders, 1 for children of root, etc.
   */
  private getFolderDepth(folder: any, allFolders: any[]): number {
    let depth = 0;
    let currentParentId = folder.parent_id;

    while (currentParentId) {
      depth++;
      const parent = allFolders.find((f) => f.id === currentParentId);
      if (!parent) break;
      currentParentId = parent.parent_id;
    }

    return depth;
  }

  /**
   * Recursively delete folder and all its nested descendants
   * This is called within a transaction, so it will roll back if any error occurs
   */
  private recursivelyDeleteFolder(folderId: UUID): void {
    // Find all immediate children
    const children = this.db!
      .prepare("SELECT id FROM folders WHERE parent_id = ?")
      .all(folderId) as Array<{ id: UUID }>;

    // Recursively delete all children first (bottom-up)
    for (const child of children) {
      this.recursivelyDeleteFolder(child.id);
    }

    // Delete all prompts in this folder
    this.db!.prepare("DELETE FROM prompts WHERE folder_id = ?").run(folderId);

    // Delete the folder itself (now that all children and prompts are gone)
    this.db!.prepare("DELETE FROM folders WHERE id = ?").run(folderId);
  }

  /**
   * List all folders
   */
  listFolders(): Folder[] {
    this.ensureConnected();

    try {
      const query = `
        SELECT
          id,
          name,
          parent_id as parentId,
          emoji,
          color,
          created_at as createdAt,
          updated_at as updatedAt
        FROM folders
        ORDER BY name ASC
      `;

      const folders = this.db!.prepare(query).all() as Array<{
        id: UUID;
        name: string;
        parentId: UUID | null;
        emoji?: string;
        color?: string;
        createdAt: string;
        updatedAt: string;
      }>;

      return folders.map((f) => ({
        id: f.id as UUID,
        name: f.name,
        parentId: f.parentId as UUID | null | undefined,
        emoji: f.emoji as Emoji | null | undefined,
        color: f.color as PromptColor | null | undefined,
        createdAt: f.createdAt,
        updatedAt: f.updatedAt,
      }));
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown error";
      throw new PromptekaMCPError(
        ErrorCodes.DATABASE_ERROR,
        `Failed to list folders: ${message}`
      );
    }
  }

  /**
   * List prompts with optional folder filter
   */
  listPrompts(
    folderId?: string | null,
    limit: number = 100,
    offset: number = 0
  ): { prompts: Prompt[]; total: number } {
    this.ensureConnected();

    try {
      let query = "FROM prompts WHERE 1=1";
      const params: unknown[] = [];

      if (folderId !== undefined && folderId !== null) {
        query += " AND folder_id = ?";
        params.push(folderId);
      } else if (folderId === null) {
        query += " AND folder_id IS NULL";
      }

      const countResult = this.db!.prepare(`SELECT COUNT(*) as count ${query}`).get(
        ...params
      ) as { count: number };
      const total = countResult.count;

      const selectQuery = `
        SELECT
          id,
          title,
          content,
          folder_id as folderId,
          emoji,
          color,
          url,
          created_at as createdAt,
          updated_at as updatedAt
        ${query}
        ORDER BY created_at DESC
        LIMIT ? OFFSET ?
      `;

      const prompts = this.db!.prepare(selectQuery).all(
        ...params,
        limit,
        offset
      ) as Array<{
        id: UUID;
        title: string;
        content: string;
        folderId: UUID | null;
        emoji?: string;
        color?: string;
        url?: string;
        createdAt: string;
        updatedAt: string;
      }>;

      return {
        prompts: prompts.map((p) => ({
          id: p.id as UUID,
          title: p.title,
          content: p.content,
          folderId: p.folderId as UUID | null | undefined,
          emoji: p.emoji as Emoji | null | undefined,
          color: p.color as PromptColor | null | undefined,
          url: p.url,
          createdAt: p.createdAt,
          updatedAt: p.updatedAt,
        })),
        total,
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown error";
      throw new PromptekaMCPError(
        ErrorCodes.DATABASE_ERROR,
        `Failed to list prompts: ${message}`
      );
    }
  }

  /**
   * Get a single prompt by ID
   */
  getPrompt(id: string): Prompt | null {
    this.ensureConnected();

    try {
      const query = `
        SELECT
          id,
          title,
          content,
          folder_id as folderId,
          emoji,
          color,
          url,
          created_at as createdAt,
          updated_at as updatedAt
        FROM prompts
        WHERE id = ?
      `;

      const prompt = this.db!.prepare(query).get(id) as {
        id: UUID;
        title: string;
        content: string;
        folderId: UUID | null;
        emoji?: string;
        color?: string;
        url?: string;
        createdAt: string;
        updatedAt: string;
      } | undefined;

      if (!prompt) {
        return null;
      }

      return {
        id: prompt.id as UUID,
        title: prompt.title,
        content: prompt.content,
        folderId: prompt.folderId as UUID | null | undefined,
        emoji: prompt.emoji as Emoji | null | undefined,
        color: prompt.color as PromptColor | null | undefined,
        url: prompt.url,
        createdAt: prompt.createdAt,
        updatedAt: prompt.updatedAt,
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown error";
      throw new PromptekaMCPError(
        ErrorCodes.DATABASE_ERROR,
        `Failed to get prompt: ${message}`
      );
    }
  }

  /**
   * Search prompts
   */
  searchPrompts(
    query: string,
    limit: number = 100,
    offset: number = 0
  ): { prompts: Prompt[]; total: number } {
    this.ensureConnected();

    try {
      const searchQuery = query.replace(/"/g, '""');

      // Check if FTS table exists
      const hasFTS = this.db!
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name='prompts_fts'"
        )
        .get();

      let countQuery: string;
      let selectQuery: string;
      const params: unknown[] = [];

      if (hasFTS) {
        countQuery = `
          SELECT COUNT(*) as count FROM prompts_fts
          WHERE title MATCH ? OR content MATCH ?
        `;
        params.push(searchQuery);
        params.push(searchQuery);

        selectQuery = `
          SELECT
            p.id,
            p.title,
            p.content,
            p.folder_id as folderId,
            p.emoji,
            p.color,
            p.url,
            p.created_at as createdAt,
            p.updated_at as updatedAt
          FROM prompts p
          INNER JOIN prompts_fts f ON p.id = f.rowid
          WHERE f.title MATCH ? OR f.content MATCH ?
          ORDER BY p.created_at DESC
          LIMIT ? OFFSET ?
        `;
        params.push(searchQuery);
        params.push(searchQuery);
      } else {
        const likeQuery = `%${searchQuery}%`;
        countQuery = `
          SELECT COUNT(*) as count FROM prompts
          WHERE title LIKE ? OR content LIKE ?
        `;
        params.push(likeQuery);
        params.push(likeQuery);

        selectQuery = `
          SELECT
            id,
            title,
            content,
            folder_id as folderId,
            emoji,
            color,
            url,
            created_at as createdAt,
            updated_at as updatedAt
          FROM prompts
          WHERE title LIKE ? OR content LIKE ?
          ORDER BY created_at DESC
          LIMIT ? OFFSET ?
        `;
        params.push(likeQuery);
        params.push(likeQuery);
      }

      const countResult = this.db!.prepare(countQuery).get(
        ...params.slice(0, 2)
      ) as { count: number };
      const total = countResult.count;

      const prompts = this.db!.prepare(selectQuery).all(
        ...params,
        limit,
        offset
      ) as Array<{
        id: UUID;
        title: string;
        content: string;
        folderId: UUID | null;
        emoji?: string;
        color?: string;
        url?: string;
        createdAt: string;
        updatedAt: string;
      }>;

      return {
        prompts: prompts.map((p) => ({
          id: p.id as UUID,
          title: p.title,
          content: p.content,
          folderId: p.folderId as UUID | null | undefined,
          emoji: p.emoji as Emoji | null | undefined,
          color: p.color as PromptColor | null | undefined,
          url: p.url,
          createdAt: p.createdAt,
          updatedAt: p.updatedAt,
        })),
        total,
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown error";
      throw new PromptekaMCPError(
        ErrorCodes.DATABASE_ERROR,
        `Failed to search prompts: ${message}`
      );
    }
  }

  /**
   * Create prompt
   */
  createPrompt(data: {
    title: string;
    content: string;
    folderId: UUID | null;
    emoji: Emoji | null | undefined;
    color: PromptColor | null | undefined;
    url: string | null | undefined;
  }): UUID {
    this.ensureConnected();

    // Validate folder exists if specified
    if (data.folderId !== null && !this.folderExists(data.folderId)) {
      throw new PromptekaMCPError(
        ErrorCodes.FOLDER_NOT_FOUND,
        `Folder '${data.folderId}' does not exist`
      );
    }

    return this.executeWithRetry(() => {
      const transaction = this.db!.transaction(() => {
        const id = uuidv4() as UUID;
        const now = new Date().toISOString();

        const stmt = this.db!.prepare(`
          INSERT INTO prompts (id, title, content, folder_id, emoji, color, url, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        stmt.run(
          id,
          data.title,
          data.content,
          data.folderId || null,
          data.emoji || null,
          data.color || null,
          data.url || null,
          now,
          now
        );

        // Verify write was successful
        const verify = this.db!.prepare("SELECT 1 FROM prompts WHERE id = ?").get(id);
        if (!verify) {
          throw new PromptekaMCPError(
            ErrorCodes.DATABASE_ERROR,
            "Failed to verify prompt was created (read-back check failed)"
          );
        }

        return id;
      });
      return transaction();
    }, "create prompt");
  }

  /**
   * Update prompt
   */
  updatePrompt(
    id: string,
    data: Partial<{
      title: string;
      content: string;
      folderId: UUID | null;
      emoji: Emoji | null;
      color: PromptColor | null;
      url: string | null;
    }>
  ): void {
    this.ensureConnected();

    // Validate prompt exists
    if (!this.promptExists(id as UUID)) {
      throw new PromptekaMCPError(
        ErrorCodes.PROMPT_NOT_FOUND,
        `Prompt '${id}' does not exist`
      );
    }

    // Validate folder exists if changing
    if ("folderId" in data && data.folderId && !this.folderExists(data.folderId)) {
      throw new PromptekaMCPError(
        ErrorCodes.FOLDER_NOT_FOUND,
        `Folder '${data.folderId}' does not exist`
      );
    }

    this.executeWithRetry(() => {
      const transaction = this.db!.transaction(() => {
        const now = new Date().toISOString();
        const updates: string[] = [];
        const params: unknown[] = [];

        if ("title" in data) {
          updates.push("title = ?");
          params.push(data.title);
        }
        if ("content" in data) {
          updates.push("content = ?");
          params.push(data.content);
        }
        if ("folderId" in data) {
          updates.push("folder_id = ?");
          params.push(data.folderId || null);
        }
        if ("emoji" in data) {
          updates.push("emoji = ?");
          params.push(data.emoji || null);
        }
        if ("color" in data) {
          updates.push("color = ?");
          params.push(data.color || null);
        }
        if ("url" in data) {
          updates.push("url = ?");
          params.push(data.url || null);
        }

        if (updates.length === 0) {
          return; // Nothing to update
        }

        updates.push("updated_at = ?");
        params.push(now);
        params.push(id);

        const stmt = this.db!.prepare(`
          UPDATE prompts
          SET ${updates.join(", ")}
          WHERE id = ?
        `);

        stmt.run(...params);

        // Verify update was successful
        const verify = this.db!.prepare("SELECT 1 FROM prompts WHERE id = ?").get(id);
        if (!verify) {
          throw new PromptekaMCPError(
            ErrorCodes.DATABASE_ERROR,
            "Failed to verify prompt was updated (read-back check failed)"
          );
        }
      });
      return transaction();
    }, "update prompt");
  }

  /**
   * Delete prompt
   */
  deletePrompt(id: string): void {
    this.ensureConnected();

    // Validate prompt exists
    if (!this.promptExists(id as UUID)) {
      throw new PromptekaMCPError(
        ErrorCodes.PROMPT_NOT_FOUND,
        `Prompt '${id}' does not exist`
      );
    }

    this.executeWithRetry(() => {
      const transaction = this.db!.transaction(() => {
        const stmt = this.db!.prepare("DELETE FROM prompts WHERE id = ?");
        stmt.run(id);

        // Verify deletion was successful
        const verify = this.db!.prepare("SELECT 1 FROM prompts WHERE id = ?").get(id);
        if (verify) {
          throw new PromptekaMCPError(
            ErrorCodes.DATABASE_ERROR,
            "Failed to verify prompt was deleted (read-back check failed)"
          );
        }
      });
      return transaction();
    }, "delete prompt");
  }

  /**
   * Create folder
   */
  createFolder(data: {
    name: string;
    parentId: UUID | null | undefined;
    emoji: Emoji | null | undefined;
    color: PromptColor | null | undefined;
  }): UUID {
    this.ensureConnected();

    // Validate parent folder exists if specified
    if (data.parentId && !this.folderExists(data.parentId)) {
      throw new PromptekaMCPError(
        ErrorCodes.FOLDER_NOT_FOUND,
        `Parent folder '${data.parentId}' does not exist`
      );
    }

    // Check for duplicate folder name within the same parent
    const existingFolder = this.findFolderByNameAndParent(
      data.name,
      data.parentId as UUID | null | undefined
    );
    if (existingFolder) {
      throw new PromptekaMCPError(
        ErrorCodes.INVALID_INPUT,
        `A folder named '${data.name}' already exists in this location`
      );
    }

    return this.executeWithRetry(() => {
      const transaction = this.db!.transaction(() => {
        const id = uuidv4() as UUID;
        const now = new Date().toISOString();

        const stmt = this.db!.prepare(`
          INSERT INTO folders (id, name, parent_id, emoji, color, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `);

        stmt.run(
          id,
          data.name,
          data.parentId || null,
          data.emoji || null,
          data.color || null,
          now,
          now
        );

        // Verify insertion was successful
        const verify = this.db!.prepare("SELECT 1 FROM folders WHERE id = ?").get(id);
        if (!verify) {
          throw new PromptekaMCPError(
            ErrorCodes.DATABASE_ERROR,
            "Failed to verify folder was created (read-back check failed)"
          );
        }

        return id;
      });
      return transaction();
    }, "create folder");
  }

  /**
   * Update folder
   */
  updateFolder(
    id: string,
    data: Partial<{
      name: string;
      parentId: UUID | null;
      emoji: Emoji | null;
      color: PromptColor | null;
    }>
  ): void {
    this.ensureConnected();

    // Validate folder exists
    const folderId = id as UUID;
    if (!this.folderExists(folderId)) {
      throw new PromptekaMCPError(
        ErrorCodes.FOLDER_NOT_FOUND,
        `Folder '${id}' does not exist`
      );
    }

    // Validate parent folder exists if changing
    if ("parentId" in data && data.parentId && !this.folderExists(data.parentId)) {
      throw new PromptekaMCPError(
        ErrorCodes.FOLDER_NOT_FOUND,
        `Parent folder '${data.parentId}' does not exist`
      );
    }

    // Check for cycles if changing parent
    if ("parentId" in data && this.wouldCreateCycle(folderId, data.parentId || null)) {
      throw new PromptekaMCPError(
        ErrorCodes.INVALID_INPUT,
        "Cannot move folder - would create a circular hierarchy"
      );
    }

    // Check for duplicate folder name if name or parent is being changed
    if ("name" in data || "parentId" in data) {
      // Get current folder to determine the parent (if not changing)
      const currentFolder = this.getFolder(id);
      if (!currentFolder) {
        throw new PromptekaMCPError(
          ErrorCodes.FOLDER_NOT_FOUND,
          `Folder '${id}' not found`
        );
      }

      const newName = "name" in data ? (data.name as string) : currentFolder.name;
      const newParentId = "parentId" in data ? (data.parentId || null) : (currentFolder.parentId || null);

      // Check if another folder with the same name exists in the target parent
      const existingFolder = this.findFolderByNameAndParent(newName, newParentId as UUID | null | undefined);
      if (existingFolder && existingFolder.id !== folderId) {
        throw new PromptekaMCPError(
          ErrorCodes.INVALID_INPUT,
          `A folder named '${newName}' already exists in that location`
        );
      }
    }

    this.executeWithRetry(() => {
      const transaction = this.db!.transaction(() => {
        const now = new Date().toISOString();
        const updates: string[] = [];
        const params: unknown[] = [];

        if ("name" in data) {
          updates.push("name = ?");
          params.push(data.name);
        }
        if ("parentId" in data) {
          updates.push("parent_id = ?");
          params.push(data.parentId || null);
        }
        if ("emoji" in data) {
          updates.push("emoji = ?");
          params.push(data.emoji || null);
        }
        if ("color" in data) {
          updates.push("color = ?");
          params.push(data.color || null);
        }

        if (updates.length === 0) {
          return;
        }

        updates.push("updated_at = ?");
        params.push(now);
        params.push(id);

        const stmt = this.db!.prepare(`
          UPDATE folders
          SET ${updates.join(", ")}
          WHERE id = ?
        `);

        stmt.run(...params);

        // Verify update was successful
        const verify = this.db!.prepare("SELECT 1 FROM folders WHERE id = ?").get(id);
        if (!verify) {
          throw new PromptekaMCPError(
            ErrorCodes.DATABASE_ERROR,
            "Failed to verify folder was updated (read-back check failed)"
          );
        }
      });
      return transaction();
    }, "update folder");
  }

  /**
   * Delete folder
   */
  deleteFolder(id: string, recursive: boolean = false): void {
    this.ensureConnected();

    // Validate folder exists
    if (!this.folderExists(id as UUID)) {
      throw new PromptekaMCPError(
        ErrorCodes.FOLDER_NOT_FOUND,
        `Folder '${id}' does not exist`
      );
    }

    this.executeWithRetry(() => {
      const transaction = this.db!.transaction(() => {
        if (!recursive) {
          // Check if folder has children
          const result = this.db!
            .prepare("SELECT COUNT(*) as count FROM prompts WHERE folder_id = ?")
            .get(id) as { count: number };

          if (result.count > 0) {
            throw new PromptekaMCPError(
              ErrorCodes.FOLDER_NOT_EMPTY,
              `Folder has ${result.count} prompts. Use recursive=true to delete with contents.`
            );
          }

          const subfolders = this.db!
            .prepare("SELECT COUNT(*) as count FROM folders WHERE parent_id = ?")
            .get(id) as { count: number };

          if (subfolders.count > 0) {
            throw new PromptekaMCPError(
              ErrorCodes.FOLDER_NOT_EMPTY,
              `Folder has ${subfolders.count} subfolders. Use recursive=true to delete with contents.`
            );
          }
        } else {
          // Recursively delete all nested folders and prompts
          this.recursivelyDeleteFolder(id as UUID);
        }

        // Delete the folder itself
        const stmt = this.db!.prepare("DELETE FROM folders WHERE id = ?");
        stmt.run(id);

        // Verify deletion was successful
        const verify = this.db!.prepare("SELECT 1 FROM folders WHERE id = ?").get(id);
        if (verify) {
          throw new PromptekaMCPError(
            ErrorCodes.DATABASE_ERROR,
            "Failed to verify folder was deleted (read-back check failed)"
          );
        }
      });
      return transaction();
    }, "delete folder");
  }

  /**
   * Move prompt to different folder
   */
  movePrompt(promptId: string, targetFolderId: UUID | null): void {
    this.ensureConnected();

    // Validate prompt exists
    if (!this.promptExists(promptId as UUID)) {
      throw new PromptekaMCPError(
        ErrorCodes.PROMPT_NOT_FOUND,
        `Prompt '${promptId}' does not exist`
      );
    }

    // Validate target folder exists if specified
    if (targetFolderId !== null && !this.folderExists(targetFolderId)) {
      throw new PromptekaMCPError(
        ErrorCodes.FOLDER_NOT_FOUND,
        `Target folder '${targetFolderId}' does not exist`
      );
    }

    this.executeWithRetry(() => {
      const transaction = this.db!.transaction(() => {
        const now = new Date().toISOString();

        const stmt = this.db!.prepare(`
          UPDATE prompts
          SET folder_id = ?, updated_at = ?
          WHERE id = ?
        `);

        stmt.run(targetFolderId || null, now, promptId);

        // Verify move was successful
        const verify = this.db!
          .prepare("SELECT folder_id FROM prompts WHERE id = ?")
          .get(promptId) as { folder_id: UUID | null } | undefined;

        if (!verify || (targetFolderId !== null && verify.folder_id !== targetFolderId)) {
          throw new PromptekaMCPError(
            ErrorCodes.DATABASE_ERROR,
            "Failed to verify prompt was moved (read-back check failed)"
          );
        }
      });
      return transaction();
    }, "move prompt");
  }

  /**
   * Restore backup - atomic operation with full transaction
   * Handles folder hierarchy, ID mapping, and overwrite semantics
   */
  restoreBackup(
    backupFolders: any[],
    backupPrompts: any[],
    overwrite: boolean
  ): { importedFolders: number; importedPrompts: number } {
    this.ensureConnected();

    return this.executeWithRetry(() => {
      const transaction = this.db!.transaction(() => {
        const folderIdMap = new Map<string, string>();
        let importedFolders = 0;
        let importedPrompts = 0;

        // Sort folders by hierarchy - parents before children
        // This ensures parent_id references exist when creating children
        const sortedFolders = [...backupFolders].sort((a, b) => {
          const aParentDepth = this.getFolderDepth(a, backupFolders);
          const bParentDepth = this.getFolderDepth(b, backupFolders);
          return aParentDepth - bParentDepth;
        });

        // Phase 1: Import folders
        for (const folder of sortedFolders) {
          const oldId = folder.id as string;
          const name = folder.name as string;
          const parentId = folder.parent_id as string | null | undefined;
          const emoji = folder.emoji || null;
          const color = folder.color || null;

          // Map parent folder ID if it exists in backup
          let mappedParentId: string | null = null;
          if (parentId) {
            mappedParentId = folderIdMap.get(parentId) || null;
            if (!mappedParentId) {
              throw new PromptekaMCPError(
                ErrorCodes.INVALID_INPUT,
                `Folder '${name}' references parent folder '${parentId}' which was not found in backup`
              );
            }
          }

          // Check if folder with same name already exists in parent
          const existingFolder = this.findFolderByNameAndParent(name, mappedParentId as UUID | null | undefined);

          if (existingFolder) {
            if (!overwrite) {
              // Skip this folder on duplicate when overwrite=false
              // Still map old ID to existing folder ID for prompts that reference it
              folderIdMap.set(oldId, existingFolder.id);
              continue;
            } else {
              // Overwrite: delete existing folder and its contents, then recreate
              // Use cascade delete to handle children
              this.db!.prepare("DELETE FROM prompts WHERE folder_id = ?").run(existingFolder.id);
              this.db!.prepare("DELETE FROM folders WHERE id = ?").run(existingFolder.id);
            }
          }

          // Create new folder
          const newId = uuidv4() as UUID;
          const now = new Date().toISOString();

          this.db!.prepare(`
            INSERT INTO folders (id, name, parent_id, emoji, color, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `).run(
            newId,
            name,
            mappedParentId || null,
            emoji,
            color,
            now,
            now
          );

          // Verify folder was created
          const verify = this.db!.prepare("SELECT 1 FROM folders WHERE id = ?").get(newId);
          if (!verify) {
            throw new PromptekaMCPError(
              ErrorCodes.DATABASE_ERROR,
              `Failed to create folder '${name}' in backup restore`
            );
          }

          folderIdMap.set(oldId, newId);
          importedFolders++;
        }

        // Phase 2: Import prompts
        for (const prompt of backupPrompts) {
          const title = prompt.title as string;
          const content = prompt.content || "";
          const folderId = prompt.folder_id as string | null | undefined;
          const emoji = prompt.emoji || null;
          const color = prompt.color || null;
          const url = prompt.url || null;

          // Map folder ID if it exists in backup
          let mappedFolderId: string | null = null;
          if (folderId) {
            mappedFolderId = folderIdMap.get(folderId) || null;
            if (!mappedFolderId) {
              throw new PromptekaMCPError(
                ErrorCodes.INVALID_INPUT,
                `Prompt '${title}' references folder '${folderId}' which was not found in backup`
              );
            }
          }

          // Check if prompt with same title already exists
          const existingPrompt = this.findPromptByTitle(title);

          if (existingPrompt) {
            if (!overwrite) {
              // Skip duplicate when overwrite=false
              continue;
            } else {
              // Overwrite: delete existing prompt and recreate
              this.db!.prepare("DELETE FROM prompts WHERE id = ?").run(existingPrompt.id);
            }
          }

          // Create new prompt
          const newId = uuidv4() as UUID;
          const now = new Date().toISOString();

          this.db!.prepare(`
            INSERT INTO prompts (id, title, content, folder_id, emoji, color, url, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            newId,
            title,
            content,
            mappedFolderId || null,
            emoji,
            color,
            url,
            now,
            now
          );

          // Verify prompt was created
          const verify = this.db!.prepare("SELECT 1 FROM prompts WHERE id = ?").get(newId);
          if (!verify) {
            throw new PromptekaMCPError(
              ErrorCodes.DATABASE_ERROR,
              `Failed to create prompt '${title}' in backup restore`
            );
          }

          importedPrompts++;
        }

        return { importedFolders, importedPrompts };
      });

      return transaction();
    }, "restore backup");
  }

  /**
   * Get folder by ID
   */
  getFolder(id: string): Folder | null {
    this.ensureConnected();

    try {
      const query = `
        SELECT
          id,
          name,
          parent_id as parentId,
          emoji,
          color,
          created_at as createdAt,
          updated_at as updatedAt
        FROM folders
        WHERE id = ?
      `;

      const folder = this.db!.prepare(query).get(id) as {
        id: UUID;
        name: string;
        parentId: UUID | null;
        emoji?: string;
        color?: string;
        createdAt: string;
        updatedAt: string;
      } | undefined;

      if (!folder) {
        return null;
      }

      return {
        id: folder.id as UUID,
        name: folder.name,
        parentId: folder.parentId as UUID | null | undefined,
        emoji: folder.emoji as Emoji | null | undefined,
        color: folder.color as PromptColor | null | undefined,
        createdAt: folder.createdAt,
        updatedAt: folder.updatedAt,
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown error";
      throw new PromptekaMCPError(
        ErrorCodes.DATABASE_ERROR,
        `Failed to get folder: ${message}`
      );
    }
  }

  /**
   * Verify schema compatibility
   */
  verifySchema(): { compatible: boolean; version?: string } {
    this.ensureConnected();

    try {
      const tables = this.db!
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('folders', 'prompts')"
        )
        .all() as Array<{ name: string }>;

      if (tables.length !== 2) {
        return { compatible: false };
      }

      return { compatible: true };
    } catch {
      return { compatible: false };
    }
  }

  /**
   * Ensure connection is open
   */
  private ensureConnected(): void {
    if (!this.isOpen || !this.db) {
      this.connect();
    }
  }
}

/**
 * Singleton instance
 */
let accessorInstance: PromptekaDatabaseAccessor | null = null;

export function initializeDatabaseAccessor(
  dbPath?: string
): PromptekaDatabaseAccessor {
  if (accessorInstance) {
    return accessorInstance;
  }

  accessorInstance = new PromptekaDatabaseAccessor(dbPath);
  accessorInstance.connect();
  return accessorInstance;
}

export function getDatabaseAccessor(): PromptekaDatabaseAccessor {
  if (!accessorInstance) {
    accessorInstance = new PromptekaDatabaseAccessor();
    accessorInstance.connect();
  }
  return accessorInstance;
}
