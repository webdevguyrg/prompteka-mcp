/**
 * Input validation module
 *
 * Validates all tool inputs before processing.
 * Enforces strict typing and business rules.
 */

import { PromptekaMCPError, ErrorCodes } from "./error-taxonomy.js";
import { Emoji, PromptColor, UUID } from "../core/types.js";

/**
 * Validate UUID format
 */
export function validateUUID(value: unknown): UUID {
  if (typeof value !== "string") {
    throw new PromptekaMCPError(ErrorCodes.INVALID_UUID, "ID must be a string");
  }

  const uuidPattern =
    /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
  if (!uuidPattern.test(value)) {
    throw new PromptekaMCPError(
      ErrorCodes.INVALID_UUID,
      `Invalid UUID format: ${value}`
    );
  }

  return value as UUID;
}

/**
 * Validate UUID or null
 */
export function validateUUIDOrNull(value: unknown): UUID | null {
  if (value === null || value === undefined) {
    return null;
  }
  return validateUUID(value);
}

/**
 * Validate emoji (1-2 characters)
 */
export function validateEmoji(value: unknown): Emoji {
  if (typeof value !== "string") {
    throw new PromptekaMCPError(ErrorCodes.INVALID_EMOJI, "Emoji must be a string");
  }

  if (value.length === 0 || value.length > 2) {
    throw new PromptekaMCPError(
      ErrorCodes.INVALID_EMOJI,
      `Emoji must be 1-2 characters, got ${value.length}`
    );
  }

  // Basic emoji validation (very permissive, allows any non-ASCII)
  if (!/[\p{Emoji}]/u.test(value)) {
    throw new PromptekaMCPError(
      ErrorCodes.INVALID_EMOJI,
      "Value must be a valid emoji"
    );
  }

  return value as Emoji;
}

/**
 * Validate emoji or null
 */
export function validateEmojiOrNull(value: unknown): Emoji | null {
  if (value === null || value === undefined) {
    return null;
  }
  return validateEmoji(value);
}

/**
 * Validate color
 */
export function validateColor(value: unknown): PromptColor {
  const validColors: PromptColor[] = [
    "red",
    "orange",
    "yellow",
    "green",
    "blue",
    "purple",
  ];

  if (typeof value !== "string") {
    throw new PromptekaMCPError(ErrorCodes.INVALID_COLOR, "Color must be a string");
  }

  if (!validColors.includes(value as PromptColor)) {
    throw new PromptekaMCPError(
      ErrorCodes.INVALID_COLOR,
      `Color must be one of: ${validColors.join(", ")}, got "${value}"`
    );
  }

  return value as PromptColor;
}

/**
 * Validate color or null
 */
export function validateColorOrNull(value: unknown): PromptColor | null {
  if (value === null || value === undefined) {
    return null;
  }
  return validateColor(value);
}

/**
 * Validate string field (required, with length limits)
 */
export function validateString(
  value: unknown,
  fieldName: string,
  minLength: number = 1,
  maxLength: number = 255
): string {
  if (typeof value !== "string") {
    throw new PromptekaMCPError(
      ErrorCodes.INVALID_INPUT,
      `${fieldName} must be a string`
    );
  }

  const trimmed = value.trim();
  if (trimmed.length < minLength) {
    throw new PromptekaMCPError(
      ErrorCodes.INVALID_INPUT,
      `${fieldName} must be at least ${minLength} character(s)`
    );
  }

  if (value.length > maxLength) {
    throw new PromptekaMCPError(
      ErrorCodes.PAYLOAD_TOO_LARGE,
      `${fieldName} exceeds maximum length of ${maxLength} characters`
    );
  }

  return value;
}

/**
 * Validate string or null
 */
export function validateStringOrNull(
  value: unknown,
  fieldName: string,
  minLength: number = 1,
  maxLength: number = 255
): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  return validateString(value, fieldName, minLength, maxLength);
}

/**
 * Validate prompt content (up to 100KB)
 */
export function validatePromptContent(value: unknown): string {
  const content = validateString(value, "content", 1, 100000);
  const byteSize = new TextEncoder().encode(content).length;

  if (byteSize > 100000) {
    throw new PromptekaMCPError(
      ErrorCodes.PAYLOAD_TOO_LARGE,
      `Prompt content exceeds 100KB limit (${byteSize} bytes)`
    );
  }

  return content;
}

/**
 * Validate URL (optional)
 */
export function validateURL(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value !== "string") {
    throw new PromptekaMCPError(ErrorCodes.INVALID_INPUT, "URL must be a string");
  }

  if (value.length > 2048) {
    throw new PromptekaMCPError(
      ErrorCodes.PAYLOAD_TOO_LARGE,
      "URL exceeds maximum length of 2048 characters"
    );
  }

  // Basic URL validation
  try {
    new URL(value);
  } catch {
    throw new PromptekaMCPError(
      ErrorCodes.INVALID_INPUT,
      `Invalid URL format: ${value}`
    );
  }

  return value;
}

/**
 * Validate pagination parameters
 */
export function validatePagination(limit?: unknown, offset?: unknown) {
  let validLimit = 100;
  let validOffset = 0;

  if (limit !== undefined && limit !== null) {
    if (!Number.isInteger(limit) || (limit as number) < 1) {
      throw new PromptekaMCPError(
        ErrorCodes.INVALID_INPUT,
        "Limit must be a positive integer"
      );
    }
    if ((limit as number) > 500) {
      throw new PromptekaMCPError(
        ErrorCodes.INVALID_INPUT,
        "Limit cannot exceed 500"
      );
    }
    validLimit = limit as number;
  }

  if (offset !== undefined && offset !== null) {
    if (!Number.isInteger(offset) || (offset as number) < 0) {
      throw new PromptekaMCPError(
        ErrorCodes.INVALID_INPUT,
        "Offset must be a non-negative integer"
      );
    }
    validOffset = offset as number;
  }

  return { limit: validLimit, offset: validOffset };
}

/**
 * Validate boolean or null (with default)
 */
export function validateBooleanOrNull(
  value: unknown,
  defaultValue: boolean = false
): boolean {
  if (value === null || value === undefined) {
    return defaultValue;
  }

  if (typeof value !== "boolean") {
    throw new PromptekaMCPError(
      ErrorCodes.INVALID_INPUT,
      "Value must be a boolean"
    );
  }

  return value;
}

/**
 * Validate folder inputs
 *
 * Note: Folders do NOT support emoji or color in Prompteka.
 * Only the folder name and parentId can be set.
 */
export interface ValidatedCreateFolderInput {
  name: string;
  parentId: UUID | null;
}

export function validateCreateFolderInput(input: unknown): ValidatedCreateFolderInput {
  if (typeof input !== "object" || input === null) {
    throw new PromptekaMCPError(ErrorCodes.INVALID_INPUT, "Input must be an object");
  }

  const obj = input as Record<string, unknown>;

  return {
    name: validateString(obj.name, "name", 1, 255),
    parentId: validateUUIDOrNull(obj.parentId),
  };
}

/**
 * Validate prompt inputs
 */
export interface ValidatedCreatePromptInput {
  title: string;
  content: string;
  folderId: UUID | null;
  emoji: Emoji | null;
  color: PromptColor | null;
  url: string | null;
}

export function validateCreatePromptInput(input: unknown): ValidatedCreatePromptInput {
  if (typeof input !== "object" || input === null) {
    throw new PromptekaMCPError(ErrorCodes.INVALID_INPUT, "Input must be an object");
  }

  const obj = input as Record<string, unknown>;

  // Apply defaults: 🤖 emoji and blue color if not provided
  const emoji = obj.emoji === null || obj.emoji === undefined ? "🤖" : obj.emoji;
  const color = obj.color === null || obj.color === undefined ? "blue" : obj.color;

  return {
    title: validateString(obj.title, "title", 1, 255),
    content: validatePromptContent(obj.content),
    folderId: validateUUIDOrNull(obj.folderId),
    emoji: validateEmoji(emoji),
    color: validateColor(color),
    url: validateURL(obj.url),
  };
}
