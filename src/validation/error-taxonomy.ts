/**
 * Error taxonomy - defines all error codes and their meanings
 *
 * Errors are classified into three categories:
 * 1. Validation: Client's responsibility (invalid input)
 * 2. Processing: Server's responsibility (operation failed)
 * 3. System: Infrastructure issues
 */

export const ErrorCodes = {
  // Validation errors (HTTP 400 - client's fault)
  INVALID_INPUT: "INVALID_INPUT",
  INVALID_EMOJI: "INVALID_EMOJI",
  INVALID_COLOR: "INVALID_COLOR",
  INVALID_UUID: "INVALID_UUID",
  PAYLOAD_TOO_LARGE: "PAYLOAD_TOO_LARGE",

  // Processing errors (HTTP 422 - operation failed)
  FOLDER_NOT_FOUND: "FOLDER_NOT_FOUND",
  PROMPT_NOT_FOUND: "PROMPT_NOT_FOUND",
  FOLDER_NOT_EMPTY: "FOLDER_NOT_EMPTY",
  PARENT_FOLDER_NOT_FOUND: "PARENT_FOLDER_NOT_FOUND",
  DATABASE_ERROR: "DATABASE_ERROR",

  // System errors (HTTP 500 - server/infrastructure)
  QUEUE_FULL: "QUEUE_FULL",
  PERMISSION_DENIED: "PERMISSION_DENIED",
  RESPONSE_TIMEOUT: "RESPONSE_TIMEOUT",
  INTERNAL_ERROR: "INTERNAL_ERROR",
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];

export interface ErrorDetails {
  code: ErrorCode;
  message: string;
  retryable: boolean;
  httpStatus: number;
  userFacingMessage: string;
}

/**
 * Error catalog with human-readable messages and retry guidance
 */
export const ErrorCatalog: Record<ErrorCode, ErrorDetails> = {
  INVALID_INPUT: {
    code: "INVALID_INPUT",
    message: "Required field is missing or invalid",
    retryable: false,
    httpStatus: 400,
    userFacingMessage: "Please check your input and try again",
  },

  INVALID_EMOJI: {
    code: "INVALID_EMOJI",
    message: "Emoji must be 1-2 characters",
    retryable: false,
    httpStatus: 400,
    userFacingMessage: "Please use a single emoji or emoji pair",
  },

  INVALID_COLOR: {
    code: "INVALID_COLOR",
    message: "Color must be one of: red, orange, yellow, green, blue, purple",
    retryable: false,
    httpStatus: 400,
    userFacingMessage: "Please select a valid color",
  },

  INVALID_UUID: {
    code: "INVALID_UUID",
    message: "ID is not a valid UUID",
    retryable: false,
    httpStatus: 400,
    userFacingMessage: "The ID format is invalid",
  },

  PAYLOAD_TOO_LARGE: {
    code: "PAYLOAD_TOO_LARGE",
    message: "Prompt content exceeds 100KB limit",
    retryable: false,
    httpStatus: 413,
    userFacingMessage: "Prompt content is too large. Maximum 100KB allowed",
  },

  FOLDER_NOT_FOUND: {
    code: "FOLDER_NOT_FOUND",
    message: "Folder does not exist",
    retryable: false,
    httpStatus: 404,
    userFacingMessage: "The folder was not found. Please check the folder ID",
  },

  PROMPT_NOT_FOUND: {
    code: "PROMPT_NOT_FOUND",
    message: "Prompt does not exist",
    retryable: false,
    httpStatus: 404,
    userFacingMessage: "The prompt was not found. Please check the prompt ID",
  },

  FOLDER_NOT_EMPTY: {
    code: "FOLDER_NOT_EMPTY",
    message: "Folder contains prompts or subfolders",
    retryable: false,
    httpStatus: 409,
    userFacingMessage:
      "Cannot delete folder with contents. Set recursive=true to delete with contents",
  },

  PARENT_FOLDER_NOT_FOUND: {
    code: "PARENT_FOLDER_NOT_FOUND",
    message: "Parent folder does not exist",
    retryable: false,
    httpStatus: 404,
    userFacingMessage: "The parent folder was not found",
  },

  DATABASE_ERROR: {
    code: "DATABASE_ERROR",
    message: "Database operation failed (usually transient)",
    retryable: true,
    httpStatus: 500,
    userFacingMessage: "Database error. Please try again",
  },

  QUEUE_FULL: {
    code: "QUEUE_FULL",
    message: "Import queue has too many pending operations",
    retryable: true,
    httpStatus: 503,
    userFacingMessage: "Too many pending operations. Please wait and retry",
  },

  PERMISSION_DENIED: {
    code: "PERMISSION_DENIED",
    message: "Permission denied accessing queue directory",
    retryable: false,
    httpStatus: 403,
    userFacingMessage: "Permission denied. Check queue directory permissions",
  },

  RESPONSE_TIMEOUT: {
    code: "RESPONSE_TIMEOUT",
    message: "No response from Prompteka app within 5 seconds",
    retryable: true,
    httpStatus: 504,
    userFacingMessage: "Operation timeout. Check Prompteka app is running",
  },

  INTERNAL_ERROR: {
    code: "INTERNAL_ERROR",
    message: "Unexpected internal error",
    retryable: false,
    httpStatus: 500,
    userFacingMessage:
      "An unexpected error occurred. Please check the logs for details",
  },
};

/**
 * Get error details by code
 */
export function getErrorDetails(code: ErrorCode): ErrorDetails {
  return ErrorCatalog[code];
}

/**
 * Check if an error is retryable
 */
export function isRetryable(code: ErrorCode): boolean {
  return getErrorDetails(code).retryable;
}

/**
 * Custom error class for MCP operations
 */
export class PromptekaMCPError extends Error {
  constructor(
    public code: ErrorCode,
    message?: string
  ) {
    const details = getErrorDetails(code);
    super(message || details.message);
    this.name = "PromptekaMCPError";
  }
}
