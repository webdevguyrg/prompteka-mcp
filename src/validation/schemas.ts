/**
 * JSON Schema definitions for all MCP tools
 *
 * These schemas are used to validate input/output of all read and write tools.
 * Schemas follow JSON Schema draft 7 specification.
 */

// UUID pattern (UUIDv4)
const UUID_PATTERN = "^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$";

// Color enum
const COLORS = ["red", "orange", "yellow", "green", "blue", "purple"] as const;

export const Schemas = {
  UUID: UUID_PATTERN,
  Colors: COLORS,

  // Read Tool Schemas
  ListFolders: {
    type: "object" as const,
    properties: {
      includeEmpty: { type: "boolean", default: false },
    },
    additionalProperties: false,
  },

  ListFoldersOutput: {
    type: "array" as const,
    items: {
      type: "object" as const,
      properties: {
        id: { type: "string", pattern: UUID_PATTERN },
        name: { type: "string", minLength: 1, maxLength: 255 },
        parentId: { type: ["string", "null"] },
        emoji: { type: ["string", "null"], maxLength: 2 },
        color: {
          type: ["string", "null"],
          enum: [...COLORS, null],
        },
        childCount: { type: "integer", minimum: 0 },
        promptCount: { type: "integer", minimum: 0 },
        createdAt: { type: "string", format: "date-time" },
        updatedAt: { type: "string", format: "date-time" },
      },
      required: [
        "id",
        "name",
        "parentId",
        "childCount",
        "promptCount",
        "createdAt",
        "updatedAt",
      ],
      additionalProperties: false,
    },
  },

  ListPrompts: {
    type: "object" as const,
    properties: {
      folderId: { type: ["string", "null"] },
      limit: { type: "integer", minimum: 1, maximum: 500, default: 100 },
      offset: { type: "integer", minimum: 0, default: 0 },
    },
    additionalProperties: false,
  },

  ListPromptsOutput: {
    type: "object" as const,
    properties: {
      prompts: {
        type: "array" as const,
        maxItems: 500,
        items: {
          type: "object" as const,
          properties: {
            id: { type: "string", pattern: UUID_PATTERN },
            title: { type: "string", minLength: 1, maxLength: 255 },
            content: { type: "string", maxLength: 100000 },
            folderId: { type: ["string", "null"] },
            emoji: { type: ["string", "null"], maxLength: 2 },
            color: {
              type: ["string", "null"],
              enum: [...COLORS, null],
            },
            url: { type: ["string", "null"], format: "uri", maxLength: 2048 },
            createdAt: { type: "string", format: "date-time" },
            updatedAt: { type: "string", format: "date-time" },
          },
          required: ["id", "title", "content", "folderId", "createdAt", "updatedAt"],
          additionalProperties: false,
        },
      },
      total: { type: "integer", minimum: 0 },
      offset: { type: "integer", minimum: 0 },
      limit: { type: "integer", minimum: 1, maximum: 500 },
    },
    required: ["prompts", "total", "offset", "limit"],
    additionalProperties: false,
  },

  GetPrompt: {
    type: "object" as const,
    properties: {
      id: { type: "string", pattern: UUID_PATTERN },
    },
    required: ["id"],
    additionalProperties: false,
  },

  SearchPrompts: {
    type: "object" as const,
    properties: {
      query: { type: "string", minLength: 1, maxLength: 500 },
      limit: { type: "integer", minimum: 1, maximum: 500, default: 100 },
      offset: { type: "integer", minimum: 0, default: 0 },
    },
    required: ["query"],
    additionalProperties: false,
  },

  // Write Tool Schemas
  CreatePrompt: {
    type: "object" as const,
    properties: {
      title: { type: "string", minLength: 1, maxLength: 255 },
      content: { type: "string", minLength: 1, maxLength: 100000 },
      folderId: { type: ["string", "null"], default: null },
      emoji: { type: ["string", "null"], maxLength: 2, default: "🤖" },
      color: {
        type: ["string", "null"],
        enum: [...COLORS, null],
        default: "blue",
      },
      url: { type: ["string", "null"], format: "uri", maxLength: 2048, default: null },
    },
    required: ["title", "content"],
    additionalProperties: false,
  },

  UpdatePrompt: {
    type: "object" as const,
    properties: {
      id: { type: "string", pattern: UUID_PATTERN },
      title: { type: ["string", "null"], minLength: 1, maxLength: 255 },
      content: { type: ["string", "null"], minLength: 1, maxLength: 100000 },
      folderId: { type: ["string", "null"] },
      emoji: { type: ["string", "null"], maxLength: 2 },
      color: { type: ["string", "null"], enum: [...COLORS, null] },
      url: { type: ["string", "null"], format: "uri", maxLength: 2048 },
    },
    required: ["id"],
    additionalProperties: false,
  },

  DeletePrompt: {
    type: "object" as const,
    properties: {
      id: { type: "string", pattern: UUID_PATTERN },
    },
    required: ["id"],
    additionalProperties: false,
  },

  CreateFolder: {
    type: "object" as const,
    properties: {
      name: { type: "string", minLength: 1, maxLength: 255 },
      parentId: { type: ["string", "null"], default: null },
      emoji: { type: ["string", "null"], maxLength: 2, default: null },
      color: {
        type: ["string", "null"],
        enum: [...COLORS, null],
        default: null,
      },
    },
    required: ["name"],
    additionalProperties: false,
  },

  UpdateFolder: {
    type: "object" as const,
    properties: {
      id: { type: "string", pattern: UUID_PATTERN },
      name: { type: ["string", "null"], minLength: 1, maxLength: 255 },
      parentId: { type: ["string", "null"] },
      emoji: { type: ["string", "null"], maxLength: 2 },
      color: { type: ["string", "null"], enum: [...COLORS, null] },
    },
    required: ["id"],
    additionalProperties: false,
  },

  DeleteFolder: {
    type: "object" as const,
    properties: {
      id: { type: "string", pattern: UUID_PATTERN },
      recursive: { type: "boolean", default: false },
    },
    required: ["id"],
    additionalProperties: false,
  },

  // Response Schemas
  OperationResponse: {
    type: "object" as const,
    properties: {
      status: { type: "string", enum: ["success", "error"] },
      id: { type: ["string", "null"], pattern: UUID_PATTERN },
      message: { type: "string" },
      error: { type: ["string", "null"] },
    },
    required: ["status", "message", "error"],
    additionalProperties: false,
  },
};

export type SchemaType = typeof Schemas;

/**
 * Validate input against a schema (basic validation)
 * In production, use a full JSON Schema validator like 'ajv'
 */
export function validateSchema(
  data: unknown,
  schema: Record<string, unknown>
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (schema.type === "object" && typeof data !== "object") {
    errors.push("Input must be an object");
    return { valid: false, errors };
  }

  if (!schema.required) {
    return { valid: true, errors: [] };
  }

  const obj = data as Record<string, unknown>;
  for (const field of schema.required as string[]) {
    if (!(field in obj)) {
      errors.push(`Missing required field: ${field}`);
    }
  }

  return { valid: errors.length === 0, errors };
}
