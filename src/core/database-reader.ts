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
import { Folder, Prompt, UUID, Emoji, PromptColor } from "./types.js";
import { PromptekaMCPError, ErrorCodes } from "../validation/error-taxonomy.js";
import { getLogger } from "../observability/logger.js";

/**
 * Expected Prompteka database schema version.
 * If the database schema differs from this, writes are blocked to prevent data corruption.
 * CRITICAL: This must match the actual Prompteka database schema version.
 * Verify with: sqlite3 ~/Library/Application\ Support/prompteka/prompts.db "PRAGMA schema_version;"
 */
const PROMPTEKA_SCHEMA_VERSION = 10; // Current Prompteka schema version

/**
 * Prompteka bundle identifier for App Store (sandboxed) version
 */
const PROMPTEKA_BUNDLE_ID = "com.robertgrow.prompteka";

/**
 * Get the sandboxed database path (App Store version)
 */
function getSandboxedDbPath(): string {
  return path.join(
    os.homedir(),
    `Library/Containers/${PROMPTEKA_BUNDLE_ID}/Data/Library/Application Support/prompteka/prompts.db`
  );
}

/**
 * Get the non-sandboxed database path (dev/direct distribution)
 */
function getNonSandboxedDbPath(): string {
  return path.join(
    os.homedir(),
    "Library/Application Support/prompteka/prompts.db"
  );
}

/**
 * Validates that a path is safe (no symlinks, no traversal)
 * Accepts both sandboxed (App Store) and non-sandboxed paths
 */
function validatePath(filePath: string): void {
  // Check for path traversal attempts
  if (filePath.includes("..")) {
    throw new PromptekaMCPError(
      ErrorCodes.PERMISSION_DENIED,
      "Path traversal detected"
    );
  }

  // Get real path and verify it's in an allowed location
  const realPath = fs.realpathSync(filePath);

  // Allowed base paths: sandboxed (App Store) and non-sandboxed (dev)
  const sandboxedBase = path.join(
    os.homedir(),
    `Library/Containers/${PROMPTEKA_BUNDLE_ID}/Data/Library/Application Support/prompteka`
  );
  const nonSandboxedBase = path.join(
    os.homedir(),
    "Library/Application Support/prompteka"
  );

  const isInSandboxed = realPath.startsWith(sandboxedBase);
  const isInNonSandboxed = realPath.startsWith(nonSandboxedBase);

  if (!isInSandboxed && !isInNonSandboxed) {
    throw new PromptekaMCPError(
      ErrorCodes.PERMISSION_DENIED,
      `Path must be under ${sandboxedBase} or ${nonSandboxedBase}`
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
    // Determine database path with priority:
    // 1. Explicit dbPath parameter
    // 2. PROMPTEKA_DB_PATH environment variable
    // 3. Sandboxed path (App Store version)
    // 4. Non-sandboxed path (dev/direct distribution)

    if (dbPath) {
      validatePath(dbPath);
      this.dbPath = dbPath;
    } else if (process.env.PROMPTEKA_DB_PATH) {
      const envPath = process.env.PROMPTEKA_DB_PATH.replace(/^~/, os.homedir());
      if (!fs.existsSync(envPath)) {
        throw new PromptekaMCPError(
          ErrorCodes.INTERNAL_ERROR,
          `Prompteka database not found at ${envPath} (from PROMPTEKA_DB_PATH). Verify the path is correct.`
        );
      }
      validatePath(envPath);
      this.dbPath = envPath;
    } else {
      // Auto-detect: check sandboxed (App Store) first, then non-sandboxed (dev)
      const sandboxedPath = getSandboxedDbPath();
      const nonSandboxedPath = getNonSandboxedDbPath();

      if (fs.existsSync(sandboxedPath)) {
        this.dbPath = sandboxedPath;
        getLogger().logDebug("database-reader", "Using App Store (sandboxed) database", {
          path: sandboxedPath,
        });
      } else if (fs.existsSync(nonSandboxedPath)) {
        this.dbPath = nonSandboxedPath;
        getLogger().logDebug("database-reader", "Using non-sandboxed database", {
          path: nonSandboxedPath,
        });
      } else {
        throw new PromptekaMCPError(
          ErrorCodes.INTERNAL_ERROR,
          `Prompteka database not found. Checked:\n` +
            `  - App Store: ${sandboxedPath}\n` +
            `  - Dev/Direct: ${nonSandboxedPath}\n` +
            `Make sure Prompteka is installed and has been opened at least once.`
        );
      }
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

      // Note: WAL mode is already enabled by Prompteka app
      // We don't set it here because read-only connections cannot change journal mode

      // Verify database schema version matches expectations
      const schemaVersionResult = this.db.pragma("schema_version", { simple: true });
      const schemaVersion = schemaVersionResult as number;
      if (schemaVersion !== PROMPTEKA_SCHEMA_VERSION) {
        this.db.close();
        throw new PromptekaMCPError(
          ErrorCodes.DATABASE_ERROR,
          `Database schema mismatch: expected version ${PROMPTEKA_SCHEMA_VERSION}, got ${schemaVersion}. ` +
            `This may indicate an incompatible Prompteka version. Please verify Prompteka is up to date.`
        );
      }

      this.isOpen = true;
      getLogger().logDebug("database-reader", "Connected to database", {
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
        createdAt: string;
        updatedAt: string;
        childCount: number;
        promptCount: number;
      }>;

      return folders.map((f) => ({
        id: f.id as UUID,
        name: f.name,
        parentId: f.parentId as UUID | null | undefined,
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
          body as content,
          folder_id as folderId,
          icon as emoji,
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
          body as content,
          folder_id as folderId,
          icon as emoji,
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
   * Search prompts by query (full-text search on title + content)
   */
  searchPrompts(
    query: string,
    limit: number = 100,
    offset: number = 0
  ): { prompts: Prompt[]; total: number } {
    this.ensureConnected();

    try {
      const likeQuery = `%${query.replace(/"/g, '""')}%`;

      const countQuery = `
        SELECT COUNT(*) as count FROM prompts
        WHERE title LIKE ? OR body LIKE ?
      `;

      const selectQuery = `
        SELECT
          id,
          title,
          body as content,
          folder_id as folderId,
          icon as emoji,
          color,
          url,
          created_at as createdAt,
          updated_at as updatedAt
        FROM prompts
        WHERE title LIKE ? OR body LIKE ?
        ORDER BY created_at DESC
        LIMIT ? OFFSET ?
      `;

      const countResult = this.db!.prepare(countQuery).get(
        likeQuery,
        likeQuery
      ) as { count: number };
      const total = countResult.count;

      const prompts = this.db!.prepare(selectQuery).all(
        likeQuery,
        likeQuery,
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
