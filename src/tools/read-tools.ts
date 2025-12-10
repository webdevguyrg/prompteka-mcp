/**
 * Read-only MCP tools
 *
 * These tools provide direct database access for fast, immediate responses.
 * No queuing needed - all operations complete in < 100ms.
 *
 * Tools:
 * - list_folders: Get all folders with hierarchy
 * - list_prompts: Get prompts from a folder with pagination
 * - get_prompt: Get single prompt by ID
 * - search_prompts: Full-text search across prompts
 */

import {
  Tool,
  TextContent,
} from "@modelcontextprotocol/sdk/types.js";
import { getDatabaseReader } from "../core/database-reader.js";
import {
  validateUUIDOrNull,
  validatePagination,
  validateString,
} from "../validation/input-validator.js";
import {
  PromptekaMCPError,
  ErrorCodes,
  getErrorDetails,
} from "../validation/error-taxonomy.js";
import { getLogger } from "../observability/logger.js";

/**
 * List all folders
 */
export function createListFoldersTool(): Tool {
  return {
    name: "list_folders",
    description: "List all folders in your Prompteka library",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  };
}

export async function handleListFolders(input: unknown): Promise<TextContent> {
  const logger = getLogger();
  const timer = logger.startTimer();

  try {
    // Validate input
    if (typeof input !== "object" || input === null) {
      throw new PromptekaMCPError(ErrorCodes.INVALID_INPUT, "Input must be an object");
    }

    // Get database reader
    const db = getDatabaseReader();

    // List folders
    const folders = db.listFolders();

    // All folders are returned - filtering by empty status would require additional DB queries
    const filtered = folders;

    // Log success
    logger.logSuccess("list_folders", timer(), {
      folderCount: filtered.length,
    });

    // Return results
    return {
      type: "text",
      text: JSON.stringify(filtered, null, 2),
    };
  } catch (error) {
    const duration = timer();

    if (error instanceof PromptekaMCPError) {
      const details = getErrorDetails(error.code);
      logger.logError(
        "list_folders",
        error.code,
        duration,
        error.message
      );

      return {
        type: "text",
        text: JSON.stringify({
          status: "error",
          error: error.code,
          message: details.userFacingMessage,
        }),
      };
    }

    const message = error instanceof Error ? error.message : "Unknown error";
    logger.logError("list_folders", ErrorCodes.INTERNAL_ERROR, duration, message);

    return {
      type: "text",
      text: JSON.stringify({
        status: "error",
        error: ErrorCodes.INTERNAL_ERROR,
        message: "An unexpected error occurred",
      }),
    };
  }
}

/**
 * List prompts with pagination
 *
 * Input: { folderId?: string | null, limit?: number, offset?: number }
 */
export function createListPromptsTool(): Tool {
  return {
    name: "list_prompts",
    description: "List prompts from a specific folder or all prompts with pagination",
    inputSchema: {
      type: "object",
      properties: {
        folderId: {
          type: ["string", "null"],
          description: "Filter by folder ID (null = no folder, undefined = all folders)",
        },
        limit: {
          type: "integer",
          minimum: 1,
          maximum: 500,
          description: "Number of prompts per page (default: 100)",
          default: 100,
        },
        offset: {
          type: "integer",
          minimum: 0,
          description: "Number of prompts to skip (default: 0)",
          default: 0,
        },
      },
      additionalProperties: false,
    },
  };
}

export async function handleListPrompts(input: unknown): Promise<TextContent> {
  const logger = getLogger();
  const timer = logger.startTimer();

  try {
    if (typeof input !== "object" || input === null) {
      throw new PromptekaMCPError(ErrorCodes.INVALID_INPUT, "Input must be an object");
    }

    const obj = input as Record<string, unknown>;

    // Validate pagination
    const { limit, offset } = validatePagination(obj.limit, obj.offset);

    // Validate folderId if provided
    let folderId: string | null | undefined;
    if ("folderId" in obj) {
      folderId = validateUUIDOrNull(obj.folderId);
    }

    // Get database reader
    const db = getDatabaseReader();

    // List prompts
    const { prompts, total } = db.listPrompts(folderId, limit, offset);

    logger.logSuccess("list_prompts", timer(), {
      promptCount: prompts.length,
      total,
      offset,
      limit,
    });

    return {
      type: "text",
      text: JSON.stringify(
        {
          prompts: prompts.map((p) => ({
            id: p.id,
            title: p.title,
            folderId: p.folderId,
            emoji: p.emoji,
            color: p.color,
            createdAt: p.createdAt,
            updatedAt: p.updatedAt,
          })),
          total,
          offset,
          limit,
        },
        null,
        2
      ),
    };
  } catch (error) {
    const duration = timer();

    if (error instanceof PromptekaMCPError) {
      const details = getErrorDetails(error.code);
      logger.logError("list_prompts", error.code, duration, error.message);

      return {
        type: "text",
        text: JSON.stringify({
          status: "error",
          error: error.code,
          message: details.userFacingMessage,
        }),
      };
    }

    const message = error instanceof Error ? error.message : "Unknown error";
    logger.logError("list_prompts", ErrorCodes.INTERNAL_ERROR, duration, message);

    return {
      type: "text",
      text: JSON.stringify({
        status: "error",
        error: ErrorCodes.INTERNAL_ERROR,
        message: "An unexpected error occurred",
      }),
    };
  }
}

/**
 * Get single prompt by ID
 *
 * Input: { id: string }
 */
export function createGetPromptTool(): Tool {
  return {
    name: "get_prompt",
    description: "Get full details of a single prompt by ID",
    inputSchema: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description: "Prompt ID (UUID)",
          pattern: "^[a-f0-9-]{36}$",
        },
      },
      required: ["id"],
      additionalProperties: false,
    },
  };
}

export async function handleGetPrompt(input: unknown): Promise<TextContent> {
  const logger = getLogger();
  const timer = logger.startTimer();

  try {
    if (typeof input !== "object" || input === null) {
      throw new PromptekaMCPError(ErrorCodes.INVALID_INPUT, "Input must be an object");
    }

    const obj = input as Record<string, unknown>;

    // Validate ID
    const id = validateUUIDOrNull(obj.id);
    if (!id) {
      throw new PromptekaMCPError(ErrorCodes.INVALID_UUID, "ID is required");
    }

    // Get database reader
    const db = getDatabaseReader();

    // Get prompt
    const prompt = db.getPrompt(id);

    if (!prompt) {
      const details = getErrorDetails(ErrorCodes.PROMPT_NOT_FOUND);
      logger.logWarn("get_prompt", `Prompt not found: ${id}`);

      return {
        type: "text",
        text: JSON.stringify({
          status: "error",
          error: ErrorCodes.PROMPT_NOT_FOUND,
          message: details.userFacingMessage,
        }),
      };
    }

    logger.logSuccess("get_prompt", timer(), {
      promptId: id,
      titleLength: prompt.title.length,
      contentLength: prompt.content.length,
    });

    return {
      type: "text",
      text: JSON.stringify(prompt, null, 2),
    };
  } catch (error) {
    const duration = timer();

    if (error instanceof PromptekaMCPError) {
      const details = getErrorDetails(error.code);
      logger.logError("get_prompt", error.code, duration, error.message);

      return {
        type: "text",
        text: JSON.stringify({
          status: "error",
          error: error.code,
          message: details.userFacingMessage,
        }),
      };
    }

    const message = error instanceof Error ? error.message : "Unknown error";
    logger.logError("get_prompt", ErrorCodes.INTERNAL_ERROR, duration, message);

    return {
      type: "text",
      text: JSON.stringify({
        status: "error",
        error: ErrorCodes.INTERNAL_ERROR,
        message: "An unexpected error occurred",
      }),
    };
  }
}

/**
 * Search prompts by query
 *
 * Input: { query: string, limit?: number, offset?: number }
 */
export function createSearchPromptsTool(): Tool {
  return {
    name: "search_prompts",
    description: "Full-text search across prompt titles and content",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          minLength: 1,
          maxLength: 500,
          description: "Search query (title or content)",
        },
        limit: {
          type: "integer",
          minimum: 1,
          maximum: 500,
          description: "Number of results per page (default: 100)",
          default: 100,
        },
        offset: {
          type: "integer",
          minimum: 0,
          description: "Number of results to skip (default: 0)",
          default: 0,
        },
      },
      required: ["query"],
      additionalProperties: false,
    },
  };
}

export async function handleSearchPrompts(input: unknown): Promise<TextContent> {
  const logger = getLogger();
  const timer = logger.startTimer();

  try {
    if (typeof input !== "object" || input === null) {
      throw new PromptekaMCPError(ErrorCodes.INVALID_INPUT, "Input must be an object");
    }

    const obj = input as Record<string, unknown>;

    // Validate query
    const query = validateString(obj.query, "query", 1, 500);

    // Validate pagination
    const { limit, offset } = validatePagination(obj.limit, obj.offset);

    // Get database reader
    const db = getDatabaseReader();

    // Search prompts
    const { prompts, total } = db.searchPrompts(query, limit, offset);

    logger.logSuccess("search_prompts", timer(), {
      query,
      resultCount: prompts.length,
      total,
      offset,
      limit,
    });

    return {
      type: "text",
      text: JSON.stringify(
        {
          prompts: prompts.map((p) => ({
            id: p.id,
            title: p.title,
            folderId: p.folderId,
            emoji: p.emoji,
            color: p.color,
            createdAt: p.createdAt,
            updatedAt: p.updatedAt,
          })),
          total,
          offset,
          limit,
          query,
        },
        null,
        2
      ),
    };
  } catch (error) {
    const duration = timer();

    if (error instanceof PromptekaMCPError) {
      const details = getErrorDetails(error.code);
      logger.logError("search_prompts", error.code, duration, error.message);

      return {
        type: "text",
        text: JSON.stringify({
          status: "error",
          error: error.code,
          message: details.userFacingMessage,
        }),
      };
    }

    const message = error instanceof Error ? error.message : "Unknown error";
    logger.logError(
      "search_prompts",
      ErrorCodes.INTERNAL_ERROR,
      duration,
      message
    );

    return {
      type: "text",
      text: JSON.stringify({
        status: "error",
        error: ErrorCodes.INTERNAL_ERROR,
        message: "An unexpected error occurred",
      }),
    };
  }
}

/**
 * Health check tool - verifies MCP server and database are operational
 */
export function createHealthCheckTool(): Tool {
  return {
    name: "health_check",
    description: "Verify MCP server and database connectivity. Returns operational status.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  };
}

export async function handleHealthCheck(): Promise<TextContent> {
  const logger = getLogger();
  const timer = logger.startTimer();

  try {
    const db = getDatabaseReader();
    const isHealthy = await db.healthCheck();

    if (!isHealthy) {
      return {
        type: "text",
        text: JSON.stringify({
          status: "unhealthy",
          message: "Database health check failed",
        }, null, 2),
      };
    }

    logger.logSuccess("health_check", timer(), {});

    return {
      type: "text",
      text: JSON.stringify({
        status: "healthy",
        message: "MCP server and database operational",
        timestamp: new Date().toISOString(),
        tools: 12,
      }, null, 2),
    };
  } catch (error) {
    const duration = timer();
    const message = error instanceof Error ? error.message : "Unknown error";
    logger.logError("health_check", ErrorCodes.INTERNAL_ERROR, duration, message);

    return {
      type: "text",
      text: JSON.stringify({
        status: "unhealthy",
        error: ErrorCodes.INTERNAL_ERROR,
        message: "Health check failed: " + message,
      }, null, 2),
    };
  }
}
