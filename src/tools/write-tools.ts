/**
 * Write MCP tools
 *
 * These tools write to the import queue and wait for responses from Prompteka.
 * Operations are idempotent and support retries.
 *
 * Tools:
 * - create_prompt: Create new prompt
 * - update_prompt: Update existing prompt (idempotent)
 * - delete_prompt: Delete prompt (idempotent)
 * - create_folder: Create new folder
 * - update_folder: Update folder
 * - delete_folder: Delete folder with safety checks
 * - backup_prompts: Export entire library as ZIP
 * - restore_prompts: Import library from backup
 */

import {
  Tool,
  TextContent,
  ErrorContent,
} from "@modelcontextprotocol/sdk/types.js";
import { getQueueWriter } from "../core/queue-writer.js";
import {
  validateCreatePromptInput,
  validateCreateFolderInput,
  validateUUID,
  validateString,
  validateBooleanOrNull,
} from "../validation/input-validator.js";
import {
  PromptekaMCPError,
  ErrorCodes,
  getErrorDetails,
} from "../validation/error-taxonomy.js";
import { getLogger } from "../observability/logger.js";
import { OperationResult } from "../core/types.js";

/**
 * Create prompt tool
 */
export function createCreatePromptTool(): Tool {
  return {
    name: "create_prompt",
    description: "Create a new prompt in your Prompteka library",
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
          description: "Emoji (1-2 characters, optional)",
        },
        color: {
          type: ["string", "null"],
          enum: ["red", "orange", "yellow", "green", "blue", "purple", null],
          description: "Color (optional)",
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
): Promise<TextContent | ErrorContent> {
  const logger = getLogger();
  const timer = logger.startTimer();

  try {
    const validated = validateCreatePromptInput(input);
    const queue = getQueueWriter();
    const result = await queue.write("create_prompt", validated);

    logger.logSuccess("create_prompt", timer(), {
      titleLength: validated.title.length,
      contentLength: validated.content.length,
      hasFolder: validated.folderId !== null,
      status: result.status,
    });

    return {
      type: "text",
      text: JSON.stringify(result, null, 2),
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
): Promise<TextContent | ErrorContent> {
  const logger = getLogger();
  const timer = logger.startTimer();

  try {
    if (typeof input !== "object" || input === null) {
      throw new PromptekaMCPError(ErrorCodes.INVALID_INPUT, "Input must be an object");
    }

    const obj = input as Record<string, unknown>;
    const id = validateUUID(obj.id);

    const data: Record<string, unknown> = { id };

    // Optionally include only provided fields
    if ("title" in obj && obj.title !== null) {
      data.title = validateString(obj.title, "title", 1, 255);
    }
    if ("content" in obj && obj.content !== null) {
      data.content = validateString(obj.content, "content", 1, 100000);
    }
    if ("folderId" in obj) {
      data.folderId = obj.folderId;
    }
    if ("emoji" in obj) {
      data.emoji = obj.emoji;
    }
    if ("color" in obj) {
      data.color = obj.color;
    }
    if ("url" in obj) {
      data.url = obj.url;
    }

    const queue = getQueueWriter();
    const result = await queue.write("update_prompt", data);

    logger.logSuccess("update_prompt", timer(), {
      promptId: id,
      fieldsUpdated: Object.keys(data).length - 1,
      status: result.status,
    });

    return {
      type: "text",
      text: JSON.stringify(result, null, 2),
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
    description: "Delete a prompt from your library",
    inputSchema: {
      type: "object",
      properties: {
        id: {
          type: "string",
          pattern: "^[a-f0-9-]{36}$",
          description: "Prompt ID to delete",
        },
      },
      required: ["id"],
      additionalProperties: false,
    },
  };
}

export async function handleDeletePrompt(
  input: unknown
): Promise<TextContent | ErrorContent> {
  const logger = getLogger();
  const timer = logger.startTimer();

  try {
    if (typeof input !== "object" || input === null) {
      throw new PromptekaMCPError(ErrorCodes.INVALID_INPUT, "Input must be an object");
    }

    const obj = input as Record<string, unknown>;
    const id = validateUUID(obj.id);

    const queue = getQueueWriter();
    const result = await queue.write("delete_prompt", { id });

    logger.logSuccess("delete_prompt", timer(), {
      promptId: id,
      status: result.status,
    });

    return {
      type: "text",
      text: JSON.stringify(result, null, 2),
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
        emoji: {
          type: ["string", "null"],
          maxLength: 2,
          description: "Emoji (1-2 characters, optional)",
        },
        color: {
          type: ["string", "null"],
          enum: ["red", "orange", "yellow", "green", "blue", "purple", null],
          description: "Color (optional)",
        },
      },
      required: ["name"],
      additionalProperties: false,
    },
  };
}

export async function handleCreateFolder(
  input: unknown
): Promise<TextContent | ErrorContent> {
  const logger = getLogger();
  const timer = logger.startTimer();

  try {
    const validated = validateCreateFolderInput(input);
    const queue = getQueueWriter();
    const result = await queue.write("create_folder", validated);

    logger.logSuccess("create_folder", timer(), {
      folderName: validated.name,
      status: result.status,
    });

    return {
      type: "text",
      text: JSON.stringify(result, null, 2),
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
      },
      required: ["id"],
      additionalProperties: false,
    },
  };
}

export async function handleUpdateFolder(
  input: unknown
): Promise<TextContent | ErrorContent> {
  const logger = getLogger();
  const timer = logger.startTimer();

  try {
    if (typeof input !== "object" || input === null) {
      throw new PromptekaMCPError(ErrorCodes.INVALID_INPUT, "Input must be an object");
    }

    const obj = input as Record<string, unknown>;
    const id = validateUUID(obj.id);

    const data: Record<string, unknown> = { id };

    if ("name" in obj && obj.name !== null) {
      data.name = validateString(obj.name, "name", 1, 255);
    }
    if ("parentId" in obj) {
      data.parentId = obj.parentId;
    }
    if ("emoji" in obj) {
      data.emoji = obj.emoji;
    }
    if ("color" in obj) {
      data.color = obj.color;
    }

    const queue = getQueueWriter();
    const result = await queue.write("update_folder", data);

    logger.logSuccess("update_folder", timer(), {
      folderId: id,
      status: result.status,
    });

    return {
      type: "text",
      text: JSON.stringify(result, null, 2),
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
    description: "Delete a folder from your library",
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
      },
      required: ["id"],
      additionalProperties: false,
    },
  };
}

export async function handleDeleteFolder(
  input: unknown
): Promise<TextContent | ErrorContent> {
  const logger = getLogger();
  const timer = logger.startTimer();

  try {
    if (typeof input !== "object" || input === null) {
      throw new PromptekaMCPError(ErrorCodes.INVALID_INPUT, "Input must be an object");
    }

    const obj = input as Record<string, unknown>;
    const id = validateUUID(obj.id);
    const recursive = validateBooleanOrNull(obj.recursive, false);

    const queue = getQueueWriter();
    const result = await queue.write("delete_folder", { id, recursive });

    logger.logSuccess("delete_folder", timer(), {
      folderId: id,
      recursive,
      status: result.status,
    });

    return {
      type: "text",
      text: JSON.stringify(result, null, 2),
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
 * Backup prompts tool
 */
export function createBackupPromptsTool(): Tool {
  return {
    name: "backup_prompts",
    description: "Export your entire prompt library as a backup ZIP file",
    inputSchema: {
      type: "object",
      properties: {
        includeMetadata: {
          type: "boolean",
          default: true,
          description: "Include folder structure and metadata (default: true)",
        },
      },
      additionalProperties: false,
    },
  };
}

export async function handleBackupPrompts(
  input: unknown
): Promise<TextContent | ErrorContent> {
  const logger = getLogger();
  const timer = logger.startTimer();

  try {
    if (typeof input !== "object" || input === null) {
      throw new PromptekaMCPError(ErrorCodes.INVALID_INPUT, "Input must be an object");
    }

    const obj = input as Record<string, unknown>;
    const includeMetadata = validateBooleanOrNull(obj.includeMetadata, true);

    const queue = getQueueWriter();
    const result = await queue.write("backup_prompts", { includeMetadata });

    logger.logSuccess("backup_prompts", timer(), {
      includeMetadata,
      status: result.status,
    });

    return {
      type: "text",
      text: JSON.stringify(result, null, 2),
    };
  } catch (error) {
    const duration = timer();

    if (error instanceof PromptekaMCPError) {
      const details = getErrorDetails(error.code);
      logger.logError("backup_prompts", error.code, duration, error.message);

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
    logger.logError("backup_prompts", ErrorCodes.INTERNAL_ERROR, duration, message);

    return {
      type: "text",
      text: JSON.stringify({
        status: "error",
        error: ErrorCodes.INTERNAL_ERROR,
        message: "Failed to create backup",
      }),
    };
  }
}

/**
 * Restore prompts tool
 */
export function createRestorePromptsTool(): Tool {
  return {
    name: "restore_prompts",
    description: "Import a previously exported prompt library backup",
    inputSchema: {
      type: "object",
      properties: {
        backupPath: {
          type: "string",
          description: "Path to backup ZIP file",
        },
        overwrite: {
          type: "boolean",
          default: false,
          description: "Overwrite conflicting prompts (default: false, merge)",
        },
      },
      required: ["backupPath"],
      additionalProperties: false,
    },
  };
}

export async function handleRestorePrompts(
  input: unknown
): Promise<TextContent | ErrorContent> {
  const logger = getLogger();
  const timer = logger.startTimer();

  try {
    if (typeof input !== "object" || input === null) {
      throw new PromptekaMCPError(ErrorCodes.INVALID_INPUT, "Input must be an object");
    }

    const obj = input as Record<string, unknown>;
    const backupPath = validateString(obj.backupPath, "backupPath", 1, 1024);
    const overwrite = validateBooleanOrNull(obj.overwrite, false);

    const queue = getQueueWriter();
    const result = await queue.write("restore_prompts", { backupPath, overwrite });

    logger.logSuccess("restore_prompts", timer(), {
      backupPath,
      overwrite,
      status: result.status,
    });

    return {
      type: "text",
      text: JSON.stringify(result, null, 2),
    };
  } catch (error) {
    const duration = timer();

    if (error instanceof PromptekaMCPError) {
      const details = getErrorDetails(error.code);
      logger.logError("restore_prompts", error.code, duration, error.message);

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
    logger.logError("restore_prompts", ErrorCodes.INTERNAL_ERROR, duration, message);

    return {
      type: "text",
      text: JSON.stringify({
        status: "error",
        error: ErrorCodes.INTERNAL_ERROR,
        message: "Failed to restore backup",
      }),
    };
  }
}
