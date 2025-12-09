/**
 * Import Queue Writer
 *
 * Handles write operations via file-based queue:
 * 1. Write operation JSON to import-queue/{uuid}.json
 * 2. Wait for response in .response-{uuid}.json (max 5 seconds)
 * 3. Return response to client
 * 4. Clean up response file
 *
 * Idempotency:
 * - Same UUID sent twice = only processed once
 * - Response file reused if it still exists
 * - Safe for retries
 *
 * Retry Strategy:
 * - Initial attempt: write file, wait 5s
 * - Retry 1: wait 1s, then wait 5s again
 * - Retry 2: wait 1s, then wait 5s again
 * - Max 3 total attempts
 */

import fs from "fs";
import path from "path";
import os from "os";
import { v4 as uuidv4 } from "uuid";
import {
  QueueOperationFile,
  OperationResult,
  QueueOperation,
} from "./types.js";
import {
  PromptekaMCPError,
  ErrorCodes,
  isRetryable,
} from "../validation/error-taxonomy.js";
import { getLogger } from "../observability/logger.js";

interface WriteQueueConfig {
  queuePath?: string;
  timeoutMs?: number;
  maxRetries?: number;
  retryBackoffMs?: number;
}

/**
 * Queue writer for import operations
 */
export class ImportQueueWriter {
  private queuePath: string;
  private timeoutMs: number;
  private maxRetries: number;
  private retryBackoffMs: number;

  constructor(config: WriteQueueConfig = {}) {
    // Determine queue path
    if (config.queuePath) {
      this.validatePath(config.queuePath);
      this.queuePath = config.queuePath;
    } else {
      // Auto-detect queue path
      const defaultPath = path.join(
        os.homedir(),
        "Library/Application Support/prompteka/import-queue"
      );

      if (!fs.existsSync(defaultPath)) {
        throw new PromptekaMCPError(
          ErrorCodes.INTERNAL_ERROR,
          `Import queue directory not found at ${defaultPath}. Make sure Prompteka is installed.`
        );
      }

      this.queuePath = defaultPath;
    }

    this.timeoutMs = config.timeoutMs || 5000;
    this.maxRetries = config.maxRetries || 2;
    this.retryBackoffMs = config.retryBackoffMs || 1000;

    getLogger().logDebug("queue-writer", "Initialized", {
      queuePath: this.queuePath,
      timeoutMs: this.timeoutMs,
      maxRetries: this.maxRetries,
    });
  }

  /**
   * Validate queue path (no symlinks, no traversal)
   */
  private validatePath(queuePath: string): void {
    // Check for path traversal
    if (queuePath.includes("..")) {
      throw new PromptekaMCPError(
        ErrorCodes.PERMISSION_DENIED,
        "Path traversal detected"
      );
    }

    // Get real path
    const realPath = fs.realpathSync(queuePath);
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

    // Check for symlink
    const stats = fs.lstatSync(queuePath);
    if (stats.isSymbolicLink()) {
      throw new PromptekaMCPError(
        ErrorCodes.PERMISSION_DENIED,
        "Symlinks are not allowed"
      );
    }

    // Check writability
    try {
      fs.accessSync(queuePath, fs.constants.R_OK | fs.constants.W_OK);
    } catch {
      throw new PromptekaMCPError(
        ErrorCodes.PERMISSION_DENIED,
        `Queue directory is not readable/writable: ${queuePath}`
      );
    }
  }

  /**
   * Check queue depth (prevent overflow)
   */
  private checkQueueDepth(): void {
    try {
      const files = fs.readdirSync(this.queuePath);
      const operationFiles = files.filter(
        (f) => !f.startsWith(".") && f.endsWith(".json")
      );

      if (operationFiles.length > 1000) {
        throw new PromptekaMCPError(
          ErrorCodes.QUEUE_FULL,
          `Queue has too many pending operations (${operationFiles.length})`
        );
      }
    } catch (error) {
      if (error instanceof PromptekaMCPError) {
        throw error;
      }

      throw new PromptekaMCPError(
        ErrorCodes.PERMISSION_DENIED,
        "Cannot access queue directory"
      );
    }
  }

  /**
   * Write operation to queue
   */
  async write(operation: QueueOperation, data: unknown): Promise<OperationResult> {
    const operationId = uuidv4() as any;
    const logger = getLogger();

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        // Check queue depth
        this.checkQueueDepth();

        // Build operation file
        const operationFile: QueueOperationFile = {
          id: operationId,
          operation,
          timestamp: new Date().toISOString(),
          data: data as Record<string, unknown>,
        };

        // Validate file size
        const fileContent = JSON.stringify(operationFile);
        const fileSize = new TextEncoder().encode(fileContent).length;

        if (fileSize > 1000000) {
          // 1MB limit
          throw new PromptekaMCPError(
            ErrorCodes.PAYLOAD_TOO_LARGE,
            `Operation exceeds 1MB limit (${fileSize} bytes)`
          );
        }

        // Write atomically (temp file + rename)
        const filePath = path.join(this.queuePath, `${operationId}.json`);
        const tmpPath = path.join(this.queuePath, `.${operationId}.tmp`);

        fs.writeFileSync(tmpPath, fileContent, { mode: 0o600 });
        fs.renameSync(tmpPath, filePath);

        // Wait for response
        const result = await this.waitForResponse(operationId);

        // Log success
        logger.logSuccess("queue-write", 0, {
          operationId,
          operation,
          attempt: attempt + 1,
        });

        return result;
      } catch (error) {
        // If last attempt, throw error
        if (attempt === this.maxRetries) {
          if (error instanceof PromptekaMCPError) {
            throw error;
          }

          const message =
            error instanceof Error ? error.message : "Unknown error";
          logger.logError(
            "queue-write",
            ErrorCodes.INTERNAL_ERROR,
            0,
            message,
            { operationId, operation, attempt: attempt + 1 }
          );

          throw new PromptekaMCPError(
            ErrorCodes.INTERNAL_ERROR,
            `Failed to write operation: ${message}`
          );
        }

        // Wait before retry
        if (attempt < this.maxRetries) {
          await this.sleep(this.retryBackoffMs);
        }
      }
    }

    throw new PromptekaMCPError(
      ErrorCodes.RESPONSE_TIMEOUT,
      "Operation timeout after retries"
    );
  }

  /**
   * Wait for response file with timeout and retries
   */
  private async waitForResponse(operationId: string): Promise<OperationResult> {
    const responsePath = path.join(
      this.queuePath,
      `.response-${operationId}.json`
    );
    const startTime = Date.now();
    let lastError: Error | null = null;

    while (Date.now() - startTime < this.timeoutMs) {
      try {
        if (fs.existsSync(responsePath)) {
          // Read response
          const content = fs.readFileSync(responsePath, "utf-8");
          const response = JSON.parse(content) as OperationResult;

          // Clean up response file
          try {
            fs.unlinkSync(responsePath);
          } catch {
            // Ignore cleanup errors
          }

          return response;
        }
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
      }

      // Wait before polling again
      await this.sleep(50);
    }

    throw new PromptekaMCPError(
      ErrorCodes.RESPONSE_TIMEOUT,
      `No response within ${this.timeoutMs}ms${lastError ? `: ${lastError.message}` : ""}`
    );
  }

  /**
   * Clean up orphaned response files on startup
   */
  async cleanupOrphans(): Promise<number> {
    const logger = getLogger();
    let cleanedCount = 0;

    try {
      const files = fs.readdirSync(this.queuePath);
      const now = Date.now();
      const twentyFourHours = 24 * 60 * 60 * 1000;

      for (const file of files) {
        if (!file.startsWith(".response-")) {
          continue;
        }

        const filePath = path.join(this.queuePath, file);

        try {
          const stats = fs.statSync(filePath);
          const age = now - stats.mtimeMs;

          if (age > twentyFourHours) {
            fs.unlinkSync(filePath);
            cleanedCount++;
          }
        } catch {
          // Ignore individual file errors
        }
      }

      if (cleanedCount > 0) {
        logger.logDebug("queue-writer", `Cleaned up ${cleanedCount} orphaned response files`);
      }

      return cleanedCount;
    } catch (error) {
      logger.logWarn("queue-writer", "Failed to clean up orphaned files", {
        error: error instanceof Error ? error.message : String(error),
      });

      return 0;
    }
  }

  /**
   * Sleep helper
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Verify queue is accessible
   */
  async healthCheck(): Promise<boolean> {
    try {
      const testFile = path.join(this.queuePath, ".health-check");
      fs.writeFileSync(testFile, "ok");
      fs.unlinkSync(testFile);
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Singleton instance
 */
let writerInstance: ImportQueueWriter | null = null;

export function initializeQueueWriter(config?: WriteQueueConfig): ImportQueueWriter {
  if (writerInstance) {
    return writerInstance;
  }

  writerInstance = new ImportQueueWriter(config);
  return writerInstance;
}

export function getQueueWriter(): ImportQueueWriter {
  if (!writerInstance) {
    writerInstance = new ImportQueueWriter();
  }
  return writerInstance;
}
