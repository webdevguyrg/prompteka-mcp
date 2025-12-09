/**
 * MCP Tools Index
 *
 * Exports all tools (read-only and write) for registration with the MCP server.
 * 14 total tools: 4 read-only + 10 write
 *
 * Read-Only (4):
 * - list_folders: Get all folders
 * - list_prompts: Get prompts from folder with pagination
 * - get_prompt: Get single prompt by ID
 * - search_prompts: Full-text search
 *
 * Write Operations (10):
 * - create_prompt: Create new prompt
 * - update_prompt: Update existing prompt (idempotent)
 * - delete_prompt: Delete prompt (idempotent)
 * - create_folder: Create new folder
 * - update_folder: Update folder
 * - delete_folder: Delete folder with safety
 * - move_prompt: Move prompt to different folder
 * - export_prompts: Export to JSON/CSV/Markdown
 * - backup_prompts: Export entire library
 * - restore_prompts: Import from backup
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
  createMovePromptTool,
  handleMovePrompt,
  createExportPromptsTool,
  handleExportPrompts,
  createBackupPromptsTool,
  handleBackupPrompts,
  createRestorePromptsTool,
  handleRestorePrompts,
} from "./write-tools.js";
