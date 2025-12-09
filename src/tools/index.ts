/**
 * MCP Tools Index
 *
 * Exports all tools (read-only and write) for registration with the MCP server.
 * 10 total tools: 4 read-only + 6 write
 */

// Read-only tools (immediate database access)
export {
  createListFoldersTool,
  handleListFolders,
  createListPromptsTool,
  handleListPrompts,
  createGetPromptTool,
  handleGetPrompt,
  createSearchPromptsTool,
  handleSearchPrompts,
} from "./read-tools.js";

// Write tools (via import queue)
export {
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
  createBackupPromptsTool,
  handleBackupPrompts,
  createRestorePromptsTool,
  handleRestorePrompts,
} from "./write-tools.js";
