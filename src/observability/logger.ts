/**
 * Structured logger for MCP operations
 *
 * All logs follow this schema:
 * {
 *   timestamp: ISO 8601
 *   level: debug | info | warn | error
 *   tool: operation name
 *   requestId?: MCP request ID
 *   operationId?: UUID
 *   durationMs: number
 *   status: success | error
 *   error?: error code
 *   message?: human readable
 *   metadata?: operation specific data
 * }
 *
 * PII Rules:
 * - Never log full prompt content
 * - Never log email addresses
 * - Log only field names and lengths
 * - At debug level, may log content (dev only)
 */

import { LogEntry } from "../core/types.js";

type LogLevel = "debug" | "info" | "warn" | "error";

export interface LoggerConfig {
  level: LogLevel;
  pretty?: boolean; // Pretty-print JSON (dev only)
}

const LogLevelValues: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

export class Logger {
  private config: LoggerConfig;
  private startTime = Date.now();

  constructor(config: LoggerConfig = { level: "info" }) {
    this.config = config;
  }

  /**
   * Check if a log level should be output
   */
  private shouldLog(level: LogLevel): boolean {
    return LogLevelValues[level] >= LogLevelValues[this.config.level];
  }

  /**
   * Format timestamp as ISO 8601
   */
  private getTimestamp(): string {
    return new Date().toISOString();
  }

  /**
   * Get uptime in milliseconds
   */
  private getUptime(): number {
    return Date.now() - this.startTime;
  }

  /**
   * Output a structured log entry
   */
  private output(entry: LogEntry): void {
    if (!this.shouldLog(entry.level)) {
      return;
    }

    const output = this.config.pretty
      ? JSON.stringify(entry, null, 2)
      : JSON.stringify(entry);

    if (entry.level === "error") {
      console.error(output);
    } else if (entry.level === "warn") {
      console.warn(output);
    } else {
      console.log(output);
    }
  }

  /**
   * Log successful operation
   */
  logSuccess(
    tool: string,
    durationMs: number,
    metadata?: Record<string, unknown>,
    requestId?: string,
    operationId?: string
  ): void {
    this.output({
      timestamp: this.getTimestamp(),
      level: "info",
      tool,
      requestId,
      operationId,
      durationMs,
      status: "success",
      metadata,
    });
  }

  /**
   * Log operation error
   */
  logError(
    tool: string,
    error: string,
    durationMs: number,
    message?: string,
    metadata?: Record<string, unknown>,
    requestId?: string,
    operationId?: string
  ): void {
    this.output({
      timestamp: this.getTimestamp(),
      level: "error",
      tool,
      requestId,
      operationId,
      durationMs,
      status: "error",
      error,
      message,
      metadata,
    });
  }

  /**
   * Log warning
   */
  logWarn(
    tool: string,
    message: string,
    metadata?: Record<string, unknown>
  ): void {
    this.output({
      timestamp: this.getTimestamp(),
      level: "warn",
      tool,
      durationMs: 0,
      status: "success",
      message,
      metadata,
    });
  }

  /**
   * Log debug information
   */
  logDebug(
    tool: string,
    message: string,
    metadata?: Record<string, unknown>
  ): void {
    this.output({
      timestamp: this.getTimestamp(),
      level: "debug",
      tool,
      durationMs: 0,
      status: "success",
      message,
      metadata,
    });
  }

  /**
   * Log startup
   */
  logStartup(version: string): void {
    this.output({
      timestamp: this.getTimestamp(),
      level: "info",
      tool: "server",
      durationMs: 0,
      status: "success",
      message: `Prompteka MCP Server v${version} started`,
    });
  }

  /**
   * Log shutdown
   */
  logShutdown(reason?: string): void {
    this.output({
      timestamp: this.getTimestamp(),
      level: "info",
      tool: "server",
      durationMs: this.getUptime(),
      status: "success",
      message: `Prompteka MCP Server shutting down${reason ? `: ${reason}` : ""}`,
    });
  }

  /**
   * Create a timer for measuring operation duration
   */
  startTimer(): () => number {
    const startTime = Date.now();
    return () => Date.now() - startTime;
  }

  /**
   * Sanitize object for logging (removes PII)
   */
  static sanitize(
    obj: Record<string, unknown>,
    includeContent: boolean = false
  ): Record<string, unknown> {
    const sanitized: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(obj)) {
      // Never log content unless explicitly allowed
      if (key === "content" && !includeContent) {
        if (typeof value === "string") {
          sanitized[`${key}Length`] = value.length;
        }
      } else if (key === "content" && includeContent && typeof value === "string") {
        // For debug, truncate to 500 chars max
        sanitized[key] =
          value.length > 500 ? value.substring(0, 500) + "..." : value;
      } else if (typeof value === "string") {
        // Check for email-like patterns
        if (value.includes("@")) {
          sanitized[key] = "[email redacted]";
        } else if (value.startsWith("http")) {
          sanitized[key] = "[url redacted]";
        } else {
          sanitized[key] = value;
        }
      } else {
        sanitized[key] = value;
      }
    }

    return sanitized;
  }
}

// Global logger instance
let globalLogger: Logger;

export function initializeLogger(config: LoggerConfig): Logger {
  globalLogger = new Logger(config);
  return globalLogger;
}

export function getLogger(): Logger {
  if (!globalLogger) {
    globalLogger = new Logger({ level: "info" });
  }
  return globalLogger;
}
