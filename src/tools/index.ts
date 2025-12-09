/**
 * MCP Tools Index
 *
 * Exports all tools (read-only and write) for registration with the MCP server.
 */

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

// Write tools will be exported here once implemented
// export {
//   createCreatePromptTool,
//   handleCreatePrompt,
//   // ... etc
// } from "./write-tools.js";
