/**
 * Write MCP tools
 *
 * These tools write directly to the Prompteka SQLite database using WAL mode.
 * All operations are atomic, ACID-compliant, and executed immediately (<10ms).
 * The MCP server works independently - the Prompteka app is not required for writes.
 *
 * Tools:
 * - create_prompt: Create new prompt
 * - update_prompt: Update existing prompt
 * - delete_prompt: Delete prompt
 * - create_folder: Create new folder
 * - update_folder: Update folder
 * - delete_folder: Delete folder with safety checks
 * - move_prompt: Move prompt between folders
 */

import {
  Tool,
  TextContent,
} from "@modelcontextprotocol/sdk/types.js";
import { getDatabaseAccessor } from "../core/database-accessor.js";
import {
  validateCreatePromptInput,
  validateCreateFolderInput,
  validateUUID,
  validateString,
  validatePromptContent,
  validateEmojiOrNull,
  validateColorOrNull,
  validateURL,
  validateUUIDOrNull,
  validateBooleanOrNull,
} from "../validation/input-validator.js";
import {
  PromptekaMCPError,
  ErrorCodes,
  getErrorDetails,
} from "../validation/error-taxonomy.js";
import { getLogger } from "../observability/logger.js";

/**
 * Create prompt tool
 */
export function createCreatePromptTool(): Tool {
  return {
    name: "create_prompt",
    description: "Create a new prompt in your Prompteka library (defaults: 🤖 emoji, blue color)",
    inputSchema: {
      type: "object",
      properties: {
        title: {
          type: "string",
          minLength: 1,
          maxLength: 255,
          description: "Prompt title",
        },
        content: {
          type: "string",
          minLength: 1,
          maxLength: 100000,
          description: "Prompt content (max 100KB)",
        },
        folderId: {
          type: ["string", "null"],
          description: "Target folder ID (optional)",
        },
        emoji: {
          type: ["string", "null"],
          maxLength: 2,
          description: "Emoji (1-2 characters, default: 🤖)",
        },
        color: {
          type: ["string", "null"],
          enum: ["red", "orange", "yellow", "green", "blue", "purple", null],
          description: "Color (default: blue)",
        },
        url: {
          type: ["string", "null"],
          maxLength: 2048,
          description: "URL reference (optional)",
        },
      },
      required: ["title", "content"],
      additionalProperties: false,
    },
  };
}

export async function handleCreatePrompt(
  input: unknown
): Promise<TextContent> {
  const logger = getLogger();
  const timer = logger.startTimer();

  try {
    const validated = validateCreatePromptInput(input);
    const db = getDatabaseAccessor();

    // Create the prompt in the database
    const promptId = db.createPrompt(validated);

    logger.logSuccess("create_prompt", timer(), {
      promptId,
      titleLength: validated.title.length,
      contentLength: validated.content.length,
      hasFolder: validated.folderId !== null,
    });

    return {
      type: "text",
      text: JSON.stringify({
        status: "success",
        id: promptId,
        message: `Prompt '${validated.title}' created successfully`,
      }, null, 2),
    };
  } catch (error) {
    const duration = timer();

    if (error instanceof PromptekaMCPError) {
      const details = getErrorDetails(error.code);
      logger.logError("create_prompt", error.code, duration, error.message);

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
    logger.logError("create_prompt", ErrorCodes.INTERNAL_ERROR, duration, message);

    return {
      type: "text",
      text: JSON.stringify({
        status: "error",
        error: ErrorCodes.INTERNAL_ERROR,
        message: "Failed to create prompt",
      }),
    };
  }
}

/**
 * Update prompt tool
 */
export function createUpdatePromptTool(): Tool {
  return {
    name: "update_prompt",
    description: "Update an existing prompt",
    inputSchema: {
      type: "object",
      properties: {
        id: {
          type: "string",
          pattern: "^[a-f0-9-]{36}$",
          description: "Prompt ID",
        },
        title: {
          type: ["string", "null"],
          minLength: 1,
          maxLength: 255,
          description: "New title (optional)",
        },
        content: {
          type: ["string", "null"],
          minLength: 1,
          maxLength: 100000,
          description: "New content (optional)",
        },
        folderId: {
          type: ["string", "null"],
          description: "New folder (optional)",
        },
        emoji: {
          type: ["string", "null"],
          maxLength: 2,
          description: "New emoji (optional)",
        },
        color: {
          type: ["string", "null"],
          enum: ["red", "orange", "yellow", "green", "blue", "purple", null],
          description: "New color (optional)",
        },
        url: {
          type: ["string", "null"],
          maxLength: 2048,
          description: "New URL (optional)",
        },
      },
      required: ["id"],
      additionalProperties: false,
    },
  };
}

export async function handleUpdatePrompt(
  input: unknown
): Promise<TextContent> {
  const logger = getLogger();
  const timer = logger.startTimer();

  try {
    if (typeof input !== "object" || input === null) {
      throw new PromptekaMCPError(ErrorCodes.INVALID_INPUT, "Input must be an object");
    }

    const obj = input as Record<string, unknown>;
    const id = validateUUID(obj.id);

    const updateData: Partial<{
      title: string;
      content: string;
      folderId: any;
      emoji: any;
      color: any;
      url: any;
    }> = {};

    // Optionally include only provided fields with proper validation
    if ("title" in obj && obj.title !== null) {
      updateData.title = validateString(obj.title, "title", 1, 255);
    }
    if ("content" in obj && obj.content !== null) {
      updateData.content = validatePromptContent(obj.content);
    }
    if ("folderId" in obj) {
      updateData.folderId = validateUUIDOrNull(obj.folderId);
    }
    if ("emoji" in obj) {
      updateData.emoji = validateEmojiOrNull(obj.emoji);
    }
    if ("color" in obj) {
      updateData.color = validateColorOrNull(obj.color);
    }
    if ("url" in obj) {
      updateData.url = validateURL(obj.url);
    }

    const db = getDatabaseAccessor();
    db.updatePrompt(id, updateData);

    logger.logSuccess("update_prompt", timer(), {
      promptId: id,
      fieldsUpdated: Object.keys(updateData).length,
    });

    return {
      type: "text",
      text: JSON.stringify({
        status: "success",
        id: id,
        message: `Prompt updated successfully`,
      }, null, 2),
    };
  } catch (error) {
    const duration = timer();

    if (error instanceof PromptekaMCPError) {
      const details = getErrorDetails(error.code);
      logger.logError("update_prompt", error.code, duration, error.message);

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
    logger.logError("update_prompt", ErrorCodes.INTERNAL_ERROR, duration, message);

    return {
      type: "text",
      text: JSON.stringify({
        status: "error",
        error: ErrorCodes.INTERNAL_ERROR,
        message: "Failed to update prompt",
      }),
    };
  }
}

/**
 * Delete prompt tool
 */
export function createDeletePromptTool(): Tool {
  return {
    name: "delete_prompt",
    description: "Delete a prompt from your library (requires explicit confirmation)",
    inputSchema: {
      type: "object",
      properties: {
        id: {
          type: "string",
          pattern: "^[a-f0-9-]{36}$",
          description: "Prompt ID to delete",
        },
        confirmDelete: {
          type: "boolean",
          description: "Must be set to true to confirm deletion (safety measure)",
        },
      },
      required: ["id", "confirmDelete"],
      additionalProperties: false,
    },
  };
}

export async function handleDeletePrompt(
  input: unknown
): Promise<TextContent> {
  const logger = getLogger();
  const timer = logger.startTimer();

  try {
    if (typeof input !== "object" || input === null) {
      throw new PromptekaMCPError(ErrorCodes.INVALID_INPUT, "Input must be an object");
    }

    const obj = input as Record<string, unknown>;
    const id = validateUUID(obj.id);
    const confirmDelete = validateBooleanOrNull(obj.confirmDelete, false);

    // Require explicit confirmation to prevent accidental deletions
    if (!confirmDelete) {
      throw new PromptekaMCPError(
        ErrorCodes.INVALID_INPUT,
        "Deletion requires explicit confirmation. Set confirmDelete to true to proceed."
      );
    }

    const db = getDatabaseAccessor();
    db.deletePrompt(id);

    logger.logSuccess("delete_prompt", timer(), {
      promptId: id,
    });

    return {
      type: "text",
      text: JSON.stringify({
        status: "success",
        id: id,
        message: "Prompt deleted successfully",
      }, null, 2),
    };
  } catch (error) {
    const duration = timer();

    if (error instanceof PromptekaMCPError) {
      const details = getErrorDetails(error.code);
      logger.logError("delete_prompt", error.code, duration, error.message);

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
    logger.logError("delete_prompt", ErrorCodes.INTERNAL_ERROR, duration, message);

    return {
      type: "text",
      text: JSON.stringify({
        status: "error",
        error: ErrorCodes.INTERNAL_ERROR,
        message: "Failed to delete prompt",
      }),
    };
  }
}

/**
 * Create folder tool
 */
export function createCreateFolderTool(): Tool {
  return {
    name: "create_folder",
    description: "Create a new folder in your library",
    inputSchema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          minLength: 1,
          maxLength: 255,
          description: "Folder name",
        },
        parentId: {
          type: ["string", "null"],
          description: "Parent folder ID for nesting (optional)",
        },
      },
      required: ["name"],
      additionalProperties: false,
    },
  };
}

export async function handleCreateFolder(
  input: unknown
): Promise<TextContent> {
  const logger = getLogger();
  const timer = logger.startTimer();

  try {
    const validated = validateCreateFolderInput(input);
    const db = getDatabaseAccessor();

    // Create the folder in the database
    const folderId = db.createFolder(validated);

    logger.logSuccess("create_folder", timer(), {
      folderId,
      folderName: validated.name,
    });

    return {
      type: "text",
      text: JSON.stringify({
        status: "success",
        id: folderId,
        message: `Folder '${validated.name}' created successfully`,
      }, null, 2),
    };
  } catch (error) {
    const duration = timer();

    if (error instanceof PromptekaMCPError) {
      const details = getErrorDetails(error.code);
      logger.logError("create_folder", error.code, duration, error.message);

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
    logger.logError("create_folder", ErrorCodes.INTERNAL_ERROR, duration, message);

    return {
      type: "text",
      text: JSON.stringify({
        status: "error",
        error: ErrorCodes.INTERNAL_ERROR,
        message: "Failed to create folder",
      }),
    };
  }
}

/**
 * Update folder tool
 */
export function createUpdateFolderTool(): Tool {
  return {
    name: "update_folder",
    description: "Update an existing folder",
    inputSchema: {
      type: "object",
      properties: {
        id: {
          type: "string",
          pattern: "^[a-f0-9-]{36}$",
          description: "Folder ID",
        },
        name: {
          type: ["string", "null"],
          minLength: 1,
          maxLength: 255,
          description: "New name (optional)",
        },
        parentId: {
          type: ["string", "null"],
          description: "New parent folder (optional)",
        },
      },
      required: ["id"],
      additionalProperties: false,
    },
  };
}

export async function handleUpdateFolder(
  input: unknown
): Promise<TextContent> {
  const logger = getLogger();
  const timer = logger.startTimer();

  try {
    if (typeof input !== "object" || input === null) {
      throw new PromptekaMCPError(ErrorCodes.INVALID_INPUT, "Input must be an object");
    }

    const obj = input as Record<string, unknown>;
    const id = validateUUID(obj.id);

    const updateData: Partial<{
      name: string;
      parentId: any;
      emoji: any;
      color: any;
    }> = {};

    // Optionally include only provided fields with proper validation
    if ("name" in obj && obj.name !== null) {
      updateData.name = validateString(obj.name, "name", 1, 255);
    }
    if ("parentId" in obj) {
      updateData.parentId = validateUUIDOrNull(obj.parentId);
    }
    if ("emoji" in obj) {
      updateData.emoji = validateEmojiOrNull(obj.emoji);
    }
    if ("color" in obj) {
      updateData.color = validateColorOrNull(obj.color);
    }

    const db = getDatabaseAccessor();
    db.updateFolder(id, updateData);

    logger.logSuccess("update_folder", timer(), {
      folderId: id,
      fieldsUpdated: Object.keys(updateData).length,
    });

    return {
      type: "text",
      text: JSON.stringify({
        status: "success",
        id: id,
        message: "Folder updated successfully",
      }, null, 2),
    };
  } catch (error) {
    const duration = timer();

    if (error instanceof PromptekaMCPError) {
      const details = getErrorDetails(error.code);
      logger.logError("update_folder", error.code, duration, error.message);

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
    logger.logError("update_folder", ErrorCodes.INTERNAL_ERROR, duration, message);

    return {
      type: "text",
      text: JSON.stringify({
        status: "error",
        error: ErrorCodes.INTERNAL_ERROR,
        message: "Failed to update folder",
      }),
    };
  }
}

/**
 * Delete folder tool
 */
export function createDeleteFolderTool(): Tool {
  return {
    name: "delete_folder",
    description: "Delete a folder from your library (requires explicit confirmation)",
    inputSchema: {
      type: "object",
      properties: {
        id: {
          type: "string",
          pattern: "^[a-f0-9-]{36}$",
          description: "Folder ID to delete",
        },
        recursive: {
          type: "boolean",
          default: false,
          description: "Delete folder and all contents (default: false)",
        },
        confirmDelete: {
          type: "boolean",
          description: "Must be set to true to confirm deletion (safety measure)",
        },
      },
      required: ["id", "confirmDelete"],
      additionalProperties: false,
    },
  };
}

export async function handleDeleteFolder(
  input: unknown
): Promise<TextContent> {
  const logger = getLogger();
  const timer = logger.startTimer();

  try {
    if (typeof input !== "object" || input === null) {
      throw new PromptekaMCPError(ErrorCodes.INVALID_INPUT, "Input must be an object");
    }

    const obj = input as Record<string, unknown>;
    const id = validateUUID(obj.id);
    const recursive = validateBooleanOrNull(obj.recursive, false);
    const confirmDelete = validateBooleanOrNull(obj.confirmDelete, false);

    // Require explicit confirmation to prevent accidental deletions
    if (!confirmDelete) {
      throw new PromptekaMCPError(
        ErrorCodes.INVALID_INPUT,
        "Deletion requires explicit confirmation. Set confirmDelete to true to proceed."
      );
    }

    const db = getDatabaseAccessor();
    db.deleteFolder(id, recursive);

    logger.logSuccess("delete_folder", timer(), {
      folderId: id,
      recursive,
    });

    return {
      type: "text",
      text: JSON.stringify({
        status: "success",
        id: id,
        message: "Folder deleted successfully",
      }, null, 2),
    };
  } catch (error) {
    const duration = timer();

    if (error instanceof PromptekaMCPError) {
      const details = getErrorDetails(error.code);
      logger.logError("delete_folder", error.code, duration, error.message);

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
    logger.logError("delete_folder", ErrorCodes.INTERNAL_ERROR, duration, message);

    return {
      type: "text",
      text: JSON.stringify({
        status: "error",
        error: ErrorCodes.INTERNAL_ERROR,
        message: "Failed to delete folder",
      }),
    };
  }
}

/**
 * Move prompt tool
 */
export function createMovePromptTool(): Tool {
  return {
    name: "move_prompt",
    description: "Move a prompt to a different folder",
    inputSchema: {
      type: "object",
      properties: {
        promptId: {
          type: "string",
          pattern: "^[a-f0-9-]{36}$",
          description: "Prompt ID to move",
        },
        targetFolderId: {
          type: ["string", "null"],
          description: "Target folder ID (null = root folder)",
        },
      },
      required: ["promptId", "targetFolderId"],
      additionalProperties: false,
    },
  };
}

export async function handleMovePrompt(
  input: unknown
): Promise<TextContent> {
  const logger = getLogger();
  const timer = logger.startTimer();

  try {
    if (typeof input !== "object" || input === null) {
      throw new PromptekaMCPError(ErrorCodes.INVALID_INPUT, "Input must be an object");
    }

    const obj = input as Record<string, unknown>;
    const promptId = validateUUID(obj.promptId);
    const targetFolderId = validateUUIDOrNull(obj.targetFolderId);

    const db = getDatabaseAccessor();
    db.movePrompt(promptId, targetFolderId);

    logger.logSuccess("move_prompt", timer(), {
      promptId,
      targetFolderId,
    });

    return {
      type: "text",
      text: JSON.stringify({
        status: "success",
        promptId: promptId,
        targetFolderId: targetFolderId,
        message: "Prompt moved successfully",
      }, null, 2),
    };
  } catch (error) {
    const duration = timer();

    if (error instanceof PromptekaMCPError) {
      const details = getErrorDetails(error.code);
      logger.logError("move_prompt", error.code, duration, error.message);

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
    logger.logError("move_prompt", ErrorCodes.INTERNAL_ERROR, duration, message);

    return {
      type: "text",
      text: JSON.stringify({
        status: "error",
        error: ErrorCodes.INTERNAL_ERROR,
        message: "Failed to move prompt",
      }),
    };
  }
}

