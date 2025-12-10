/**
 * MCP Tools Index
 *
 * Exports all tools (read-only and write) for registration with the MCP server.
 * 12 total tools: 5 read-only + 7 write
 *
 * Read-Only (5):
 * - list_folders: Get all folders
 * - list_prompts: Get prompts from folder with pagination
 * - get_prompt: Get single prompt by ID
 * - search_prompts: Full-text search
 * - health_check: Verify MCP server and database operational
 *
 * Write Operations (7):
 * - create_prompt: Create new prompt
 * - update_prompt: Update existing prompt
 * - delete_prompt: Delete prompt (requires confirmDelete: true)
 * - create_folder: Create new folder
 * - update_folder: Update folder
 * - delete_folder: Delete folder (requires confirmDelete: true, true recursive)
 * - move_prompt: Move prompt to different folder
 *
 * DISABLED (field name mismatches cause data loss):
 * - export_prompts: Disabled due to camelCase/snake_case mismatch
 * - backup_prompts: Disabled due to camelCase/snake_case mismatch
 * - restore_prompts: Disabled due to camelCase/snake_case mismatch
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
  createHealthCheckTool,
  handleHealthCheck,
} from "./read-tools.js";

// Write tools
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
} from "./write-tools.js";
