/**
 * Shared type definitions for Prompteka MCP Server
 *
 * These types represent the domain model for prompts, folders, and operations
 * across the MCP server, ensuring type safety and consistency.
 */

/**
 * Valid emoji - single emoji character or pair (1-2 chars)
 */
export type Emoji = string & { readonly __brand: "Emoji" };

/**
 * Valid color from Prompteka's color palette
 */
export type PromptColor = "red" | "orange" | "yellow" | "green" | "blue" | "purple";

/**
 * UUID string representing unique identifiers
 */
export type UUID = string & { readonly __brand: "UUID" };

/**
 * Helper functions to cast values to branded types
 * These are safe when the value is guaranteed to meet the type requirements
 */
export function asUUID(value: string): UUID {
  return value as UUID;
}

export function asEmoji(value: string | null | undefined): Emoji | null | undefined {
  if (value === null || value === undefined) return value;
  return value as Emoji;
}

/**
 * Folder domain object
 *
 * Note: Folders do NOT have emoji or color in the actual Prompteka database.
 * Only prompts support emoji and color styling.
 */
export interface Folder {
  id: UUID;
  name: string;
  createdAt: string; // ISO 8601 timestamp
  updatedAt: string; // ISO 8601 timestamp
  parentId: UUID | null | undefined; // For nested folders (reserved for future use)
}

/**
 * Prompt domain object
 */
export interface Prompt {
  id: UUID;
  title: string;
  content: string;
  folderId: UUID | null | undefined;
  emoji: Emoji | null | undefined;
  color: PromptColor | null | undefined;
  url: string | null | undefined;
  createdAt: string; // ISO 8601 timestamp
  updatedAt: string; // ISO 8601 timestamp
  tags?: string[];
}

/**
 * Import queue operation types
 */
export type QueueOperation =
  | "create_prompt"
  | "update_prompt"
  | "delete_prompt"
  | "create_folder"
  | "update_folder"
  | "delete_folder";

/**
 * Queue operation file structure
 */
export interface QueueOperationFile {
  id: UUID;
  operation: QueueOperation;
  timestamp: string; // ISO 8601 timestamp
  data: Record<string, unknown>;
}

/**
 * Queue operation result
 */
export interface OperationResult {
  status: "success" | "error";
  id?: UUID;
  message: string;
  error?: string;
  errorCode?: string;
  data?: Record<string, unknown>;
}

/**
 * Error codes for operation failures
 */
export enum ErrorCode {
  // Validation errors (client-side)
  INVALID_INPUT = "INVALID_INPUT",
  INVALID_EMOJI = "INVALID_EMOJI",
  INVALID_COLOR = "INVALID_COLOR",
  INVALID_UUID = "INVALID_UUID",
  PAYLOAD_TOO_LARGE = "PAYLOAD_TOO_LARGE",

  // Processing errors (queue-side)
  FOLDER_NOT_FOUND = "FOLDER_NOT_FOUND",
  PROMPT_NOT_FOUND = "PROMPT_NOT_FOUND",
  FOLDER_NOT_EMPTY = "FOLDER_NOT_EMPTY",
  DATABASE_ERROR = "DATABASE_ERROR",

  // System errors
  QUEUE_FULL = "QUEUE_FULL",
  PERMISSION_DENIED = "PERMISSION_DENIED",
  RESPONSE_TIMEOUT = "RESPONSE_TIMEOUT",
  INTERNAL_ERROR = "INTERNAL_ERROR",
}

/**
 * Structured log entry
 */
export interface LogEntry {
  timestamp: string;
  level: "debug" | "info" | "warn" | "error";
  tool: string;
  requestId?: string;
  operationId?: string;
  durationMs: number;
  status: "success" | "error";
  error?: string;
  message?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Configuration for Prompteka MCP Server
 */
export interface ServerConfig {
  dbPath: string;
  queuePath: string;
  logLevel: "debug" | "info" | "warn" | "error";
  operationTimeoutMs: number;
  maxRetries: number;
  retryBackoffMs: number;
}

/**
 * Health status of the server
 */
export interface HealthStatus {
  status: "healthy" | "degraded" | "unhealthy";
  timestamp: string;
  database: {
    connected: boolean;
    lastCheck: string;
  };
  queue: {
    accessible: boolean;
    lastCheck: string;
  };
  uptime: number; // milliseconds
}
