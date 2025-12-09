/**
 * Prompteka Database Reader
 *
 * Provides read-only access to Prompteka's SQLite database.
 * Uses WAL mode for safe concurrent access with Prompteka app writes.
 *
 * WAL Safety:
 * - MCP opens ONE read-only connection
 * - Prompteka app opens separate write connections
 * - WAL ensures no locks or conflicts
 * - Reads are consistent snapshots
 */

import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import os from "os";
import { Folder, Prompt, UUID } from "./types.js";
import { PromptekaMCPError, ErrorCodes } from "../validation/error-taxonomy.js";
import { getLogger } from "../observability/logger.js";

/**
 * Validates that a path is safe (no symlinks, no traversal)
 */
function validatePath(filePath: string): void {
  // Check for path traversal attempts
  if (filePath.includes("..")) {
    throw new PromptekaMCPError(
      ErrorCodes.PERMISSION_DENIED,
      "Path traversal detected"
    );
  }

  // Get real path and verify it doesn't resolve outside expected location
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

  // Verify it's not a symlink
  const stats = fs.lstatSync(filePath);
  if (stats.isSymbolicLink()) {
    throw new PromptekaMCPError(
      ErrorCodes.PERMISSION_DENIED,
      "Symlinks are not allowed"
    );
  }
}

/**
 * Database reader for Prompteka SQLite database
 *
 * Supports read-only operations:
 * - listFolders()
 * - listPrompts()
 * - getPrompt()
 * - searchPrompts()
 */
export class PromptekaDatabaseReader {
  private db: Database.Database | null = null;
  private dbPath: string;
  private isOpen = false;

  constructor(dbPath?: string) {
    // Determine database path
    if (dbPath) {
      validatePath(dbPath);
      this.dbPath = dbPath;
    } else {
      // Auto-detect Prompteka database location
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
   * Connect to database in read-only mode
   */
  connect(): void {
    if (this.isOpen) {
      return;
    }

    try {
      // Open read-only connection
      this.db = new Database(this.dbPath, { readonly: true });

      // Enable WAL mode recognition (already enabled by Prompteka app)
      // This doesn't fail if WAL isn't enabled, just confirms readiness
      this.db.pragma("journal_mode = WAL");

      this.isOpen = true;
      getLogger().logDebug("database-reader", "Connected to database", {
        dbPath: this.dbPath,
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
   * Verify database is accessible and responsive
   */
  async healthCheck(): Promise<boolean> {
    try {
      if (!this.isOpen || !this.db) {
        return false;
      }

      // Run a simple query to verify connectivity
      const result = this.db.prepare("SELECT 1").get();
      return result !== undefined;
    } catch {
      return false;
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
          updated_at as updatedAt,
          (SELECT COUNT(*) FROM folders WHERE parent_id = f.id) as childCount,
          (SELECT COUNT(*) FROM prompts WHERE folder_id = f.id) as promptCount
        FROM folders f
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
        childCount: number;
        promptCount: number;
      }>;

      return folders.map((f) => ({
        id: f.id,
        name: f.name,
        parentId: f.parentId,
        emoji: f.emoji,
        color: f.color as any,
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
      // Build query
      let query = "FROM prompts WHERE 1=1";
      const params: unknown[] = [];

      if (folderId !== undefined && folderId !== null) {
        query += " AND folder_id = ?";
        params.push(folderId);
      } else if (folderId === null) {
        query += " AND folder_id IS NULL";
      }

      // Get total count
      const countResult = this.db!.prepare(`SELECT COUNT(*) as count ${query}`).get(
        ...params
      ) as { count: number };
      const total = countResult.count;

      // Get paginated results
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
          id: p.id,
          title: p.title,
          content: p.content,
          folderId: p.folderId,
          emoji: p.emoji,
          color: p.color as any,
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
        id: prompt.id,
        title: prompt.title,
        content: prompt.content,
        folderId: prompt.folderId,
        emoji: prompt.emoji,
        color: prompt.color as any,
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
   * Search prompts by query (full-text search on title + content)
   */
  searchPrompts(
    query: string,
    limit: number = 100,
    offset: number = 0
  ): { prompts: Prompt[]; total: number } {
    this.ensureConnected();

    try {
      // Escape query for FTS
      const searchQuery = query.replace(/"/g, '""');

      // Check if FTS table exists, fall back to LIKE if not
      const hasFTS = this.db!
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name='prompts_fts'"
        )
        .get();

      let countQuery: string;
      let selectQuery: string;
      const params: unknown[] = [];

      if (hasFTS) {
        // Use FTS if available
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
        // Fall back to LIKE search
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
          id: p.id,
          title: p.title,
          content: p.content,
          folderId: p.folderId,
          emoji: p.emoji,
          color: p.color as any,
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
   * Verify database schema is compatible
   */
  verifySchema(): { compatible: boolean; version?: string } {
    this.ensureConnected();

    try {
      // Check for required tables
      const tables = this.db!
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('folders', 'prompts')"
        )
        .all() as Array<{ name: string }>;

      if (tables.length !== 2) {
        return { compatible: false };
      }

      // Try to get version from settings
      try {
        const versionResult = this.db!
          .prepare("SELECT value FROM settings WHERE key = 'app_version'")
          .get() as { value: string } | undefined;

        return {
          compatible: true,
          version: versionResult?.value,
        };
      } catch {
        // Settings table may not exist, but core schema is compatible
        return { compatible: true };
      }
    } catch {
      return { compatible: false };
    }
  }

  /**
   * Ensure database is connected
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
let readerInstance: PromptekaDatabaseReader | null = null;

export function initializeDatabaseReader(dbPath?: string): PromptekaDatabaseReader {
  if (readerInstance) {
    return readerInstance;
  }

  readerInstance = new PromptekaDatabaseReader(dbPath);
  readerInstance.connect();
  return readerInstance;
}

export function getDatabaseReader(): PromptekaDatabaseReader {
  if (!readerInstance) {
    readerInstance = new PromptekaDatabaseReader();
    readerInstance.connect();
  }
  return readerInstance;
}
