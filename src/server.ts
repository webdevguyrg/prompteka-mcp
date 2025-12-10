#!/usr/bin/env node

/**
 * Prompteka MCP Server
 *
 * Main entry point for the MCP server.
 * Initializes all components and registers tools with the MCP framework.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { ListToolsRequestSchema, CallToolRequestSchema, Tool, CallToolRequest } from "@modelcontextprotocol/sdk/types.js";

import { initializeLogger, getLogger } from "./observability/logger.js";
import { initializeDatabaseReader } from "./core/database-reader.js";
import { initializeDatabaseAccessor } from "./core/database-accessor.js";

// Import all tools
import {
  createListFoldersTool,
  handleListFolders,
  createListPromptsTool,
  handleListPrompts,
  createGetPromptTool,
  handleGetPrompt,
  createSearchPromptsTool,
  handleSearchPrompts,
  createHealthCheckTool,
  handleHealthCheck,
  createCreatePromptTool,
  handleCreatePrompt,
  createUpdatePromptTool,
  handleUpdatePrompt,
  createDeletePromptTool,
  handleDeletePrompt,
  createCreateFolderTool,
  handleCreateFolder,
  createUpdateFolderTool,
  handleUpdateFolder,
  createDeleteFolderTool,
  handleDeleteFolder,
  createMovePromptTool,
  handleMovePrompt,
} from "./tools/index.js";

const VERSION = "1.0.2";

// Tool registry
interface ToolHandler {
  tool: Tool;
  handler: (input: unknown) => Promise<{
    type: string;
    text: string;
  }>;
}

const tools: Map<string, ToolHandler> = new Map([
  // Read-only tools
  [
    "list_folders",
    {
      tool: createListFoldersTool(),
      handler: handleListFolders,
    },
  ],
  [
    "list_prompts",
    {
      tool: createListPromptsTool(),
      handler: handleListPrompts,
    },
  ],
  [
    "get_prompt",
    {
      tool: createGetPromptTool(),
      handler: handleGetPrompt,
    },
  ],
  [
    "search_prompts",
    {
      tool: createSearchPromptsTool(),
      handler: handleSearchPrompts,
    },
  ],
  [
    "health_check",
    {
      tool: createHealthCheckTool(),
      handler: handleHealthCheck,
    },
  ],
  // Write tools
  [
    "create_prompt",
    {
      tool: createCreatePromptTool(),
      handler: handleCreatePrompt,
    },
  ],
  [
    "update_prompt",
    {
      tool: createUpdatePromptTool(),
      handler: handleUpdatePrompt,
    },
  ],
  [
    "delete_prompt",
    {
      tool: createDeletePromptTool(),
      handler: handleDeletePrompt,
    },
  ],
  [
    "create_folder",
    {
      tool: createCreateFolderTool(),
      handler: handleCreateFolder,
    },
  ],
  [
    "update_folder",
    {
      tool: createUpdateFolderTool(),
      handler: handleUpdateFolder,
    },
  ],
  [
    "delete_folder",
    {
      tool: createDeleteFolderTool(),
      handler: handleDeleteFolder,
    },
  ],
  [
    "move_prompt",
    {
      tool: createMovePromptTool(),
      handler: handleMovePrompt,
    },
  ],
]);

/**
 * Initialize server
 */
async function main(): Promise<void> {
  // Initialize logger
  const logLevel = (process.env.LOG_LEVEL as any) || "info";
  initializeLogger({
    level: logLevel,
    pretty: process.env.NODE_ENV !== "production",
  });

  const logger = getLogger();
  logger.logStartup(VERSION);

  try {
    // Initialize database reader
    const dbPath = process.env.PROMPTEKA_DB_PATH;
    const db = initializeDatabaseReader(dbPath);

    // Verify database connection
    const isHealthy = await db.healthCheck();
    if (!isHealthy) {
      throw new Error("Database health check failed");
    }

    // Initialize write accessor for write operations
    initializeDatabaseAccessor(dbPath);
    logger.logDebug("server", "Write accessor initialized for database operations");

    // Create MCP server
    const server = new Server({
      name: "prompteka",
      version: VERSION,
    });

    // Handle list_tools
    server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: Array.from(tools.values()).map((t) => t.tool),
      };
    });

    // Handle call_tool
    server.setRequestHandler(CallToolRequestSchema, async (request: CallToolRequest) => {
      const toolName = request.params.name;
      const toolEntry = tools.get(toolName);

      if (!toolEntry) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                error: "TOOL_NOT_FOUND",
                message: `Tool '${toolName}' not found`,
              }),
            },
          ],
        };
      }

      // Call handler
      const result = await toolEntry.handler(request.params.arguments);

      return {
        content: [result],
      };
    });

    // Connect via stdio
    const transport = new StdioServerTransport();
    await server.connect(transport);

    logger.logDebug("server", `Connected with ${tools.size} tools`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.logError("server", "INTERNAL_ERROR", 0, message);
    process.exit(1);
  }
}

/**
 * Handle graceful shutdown
 */
process.on("SIGINT", () => {
  const logger = getLogger();
  logger.logShutdown("SIGINT");
  process.exit(0);
});

process.on("SIGTERM", () => {
  const logger = getLogger();
  logger.logShutdown("SIGTERM");
  process.exit(0);
});

process.on("SIGHUP", () => {
  const logger = getLogger();
  logger.logShutdown("SIGHUP");
  process.exit(0);
});

// Run server
main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
