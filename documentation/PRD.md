# Prompteka MCP Server - Product Requirements Document

## Overview

An MCP (Model Context Protocol) server that provides AI assistants with full read-write access to Prompteka's prompt library. Enables interactions like: "Add this to my Security folder", "List prompts in Engineering", "Search for prompts about API design".

## Architecture

### Data Flow

```
AI Assistant → MCP Server → Database/Queue → Prompteka App → User
```

**Reads**: Direct SQLite access (fast, consistent)
**Writes**: JSON file queue (no DB conflicts, async processing)

### Directory Structure

```
~/Library/Application Support/prompteka/
├── prompts.db                           # SQLite database
├── prompts.db-wal                       # WAL file (concurrent reads)
├── prompts.db-shm                       # WAL shared memory
└── import-queue/                        # Write queue
    ├── {operation-id}.json              # Pending operation
    ├── processed/
    │   └── {operation-id}.json          # Completed operation
    └── failed/
        └── {operation-id}.json          # Failed operation + error
```

## Features

### Phase 1: Read-Only (MVP)

**MCP Tools**:
- `list_folders` - Get all folders with hierarchy
- `list_prompts` - Get prompts (optional folder filter)
- `get_prompt` - Get single prompt by ID
- `search_prompts` - Full-text search

**Database**: Direct read access to prompts.db
**Latency**: < 100ms
**Complexity**: Simple - no file watching needed

### Phase 2: Full Read-Write

**MCP Tools**:
- `create_prompt` - Add new prompt to folder
- `update_prompt` - Modify existing prompt
- `delete_prompt` - Remove prompt
- `create_folder` - Add new folder
- `update_folder` - Modify folder
- `delete_folder` - Remove folder

**Write Flow**:
1. MCP writes operation JSON to `import-queue/{id}.json`
2. Prompteka app watches folder, processes JSON
3. Prompteka validates and updates database
4. Prompteka writes response to `.response-{id}.json`
5. MCP waits for response (5s timeout)

**Latency**: 100-500ms (acceptable for AI workflows)

## Input/Output Formats

### Read Tool Input

```json
{
  "folder_id": 5,        // optional for list/search
  "query": "api design"  // optional for search
}
```

### Read Tool Output

```json
{
  "id": "prompt-uuid",
  "title": "API Design Review",
  "content": "Review the API for...",
  "folder_id": 5,
  "emoji": "🔌",
  "color": "blue",
  "created_at": "2025-12-09T10:30:00Z",
  "updated_at": "2025-12-09T10:30:00Z"
}
```

### Write Tool Input

```json
{
  "operation": "create_prompt",
  "data": {
    "title": "Security Review",
    "content": "Review for security issues...",
    "folder_id": 5,
    "emoji": "🔒",
    "color": "red"
  }
}
```

### Write Tool Response

```json
{
  "status": "success",
  "message": "Prompt 'Security Review' created",
  "error": null
}
```

or on error:

```json
{
  "status": "error",
  "message": null,
  "error": "Folder not found: 5"
}
```

## Use Cases

### Use Case 1: Quick Prompt Capture
```
User: "Claude, save this prompt to my Engineering folder"
AI: Uses create_prompt tool
→ Prompt added to Prompteka, appears in app
```

### Use Case 2: Prompt Discovery
```
User: "Show me my prompts about testing"
AI: Uses search_prompts tool
→ Lists matching prompts from user's library
```

### Use Case 3: Prompt Organization
```
User: "Move all my security prompts to the Security folder"
AI: Uses list_prompts to find, then update_prompt to move
→ Prompts reorganized in Prompteka
```

### Use Case 4: Prompt Analysis
```
User: "How many prompts do I have in each folder?"
AI: Uses list_folders + list_prompts
→ Shows breakdown of prompt organization
```

## Technical Specifications

### Database (Read-Only)

**Path**: `~/Library/Application Support/prompteka/prompts.db`

**Tables Used**:
- `prompts` - Main prompt data
- `folders` - Folder hierarchy
- `tags` - Tag associations (if needed)

**Concurrent Access**:
- WAL mode enabled in Prompteka app
- Multiple readers OK, safe with app writing
- No locking issues for reads

### Queue (Write Operations)

**Path**: `~/Library/Application Support/prompteka/import-queue/`

**File Format**:
```json
{
  "id": "uuid-string",
  "operation": "create_prompt",
  "timestamp": "2025-12-09T10:30:00.000Z",
  "data": { /* operation-specific data */ }
}
```

**File Lifecycle**:
1. MCP writes `{id}.json` atomically (temp file + rename)
2. Prompteka detects file, reads and processes
3. Prompteka writes response to `.response-{id}.json`
4. Prompteka moves original to `processed/` or `failed/`
5. MCP reads response, confirms success/failure

**Guarantees**:
- Atomic writes (temp file + rename)
- Processed in order by filesystem
- No race conditions (directories are exclusive)
- Persistent error tracking

### Error Handling

**Validation Errors** (MCP Server):
- Missing required fields
- Invalid folder/prompt IDs
- Type mismatches
- Returned immediately to AI

**Processing Errors** (Prompteka App):
- Database constraints violated
- Folder not found
- Invalid data format
- Logged, response written to `.response-{id}.json`

**Recovery**:
- Failed operations moved to `failed/` folder
- User can inspect error and retry
- No data corruption

## Performance Targets

| Operation | Latency | Notes |
|-----------|---------|-------|
| list_prompts | < 100ms | Direct DB read, cached |
| search_prompts | < 200ms | Full-text search index |
| get_prompt | < 50ms | Direct DB lookup |
| list_folders | < 50ms | Small dataset |
| create_prompt | 100-500ms | File write + Prompteka processing |
| update_prompt | 100-500ms | File write + Prompteka processing |
| delete_prompt | 100-500ms | File write + Prompteka processing |

## Installation & Setup

### User Installation

```bash
npm install -g prompteka-mcp
```

### Configuration (Claude Desktop)

Add to `~/.claude/claude.json`:

```json
{
  "mcpServers": {
    "prompteka": {
      "command": "prompteka-mcp"
    }
  }
}
```

### Optional Environment Variables

```bash
PROMPTEKA_DB_PATH="/path/to/prompts.db"  # Override default
PROMPTEKA_QUEUE_PATH="/path/to/import-queue"  # Override default
LOG_LEVEL="info"  # debug, info, warn, error
```

## Security Model

### What This Provides

- ✅ Local-only access (no network)
- ✅ Same user account (filesystem permissions)
- ✅ Explicit file operations (visible in filesystem)
- ✅ App validates before writing to DB

### What This Does NOT Provide

- ❌ Multi-user isolation (not needed - one user per device)
- ❌ Encryption (use system encryption if needed)
- ❌ Authentication (relies on macOS login)
- ❌ Audit logging (not a requirement)

### Threat Model

**Threat**: AI generates harmful prompt
**Mitigation**: User reviews AI suggestions before confirming

**Threat**: MCP server has bug that deletes prompts
**Mitigation**: Prompts are recoverable from backups (user's responsibility)

**Threat**: Malicious MCP tool
**Mitigation**: User-installed explicitly, isolated to this device

## Success Criteria

- ✅ AI can read prompts from Prompteka via MCP
- ✅ AI can search prompts by content
- ✅ AI can create new prompts in specified folders
- ✅ Changes appear in Prompteka within 1 second
- ✅ No database corruption under any condition
- ✅ Clear error messages when operations fail
- ✅ Works with Claude Desktop and Claude Code

## Out of Scope

**Not building**:
- Web interface or REST API
- Sync across devices
- Encryption of prompts
- User authentication
- Bulk operations beyond what MCP allows
- Conflict resolution for concurrent edits
- Change notifications or webhooks

**These may come later if needed**, but are not required for MVP.

## Rollout Plan

### Week 1: Read-Only MVP
- MCP server with list/get/search tools
- Works with Prompteka 1.6.2+
- Installation guide and examples
- Publish to npm

### Week 2: Full Read-Write
- Write tools and queue processing
- Prompteka app integration complete
- Full end-to-end testing
- Update installation guide

### Ongoing
- Monitor for issues
- Performance optimization if needed
- Feature requests from users

## Appendix: Example Interactions

### Create a Prompt

```
User: "Save this security review checklist to my Security folder"

AI (via create_prompt):
{
  "title": "Security Review Checklist",
  "content": "1. Validate inputs...",
  "folder_id": 5,
  "emoji": "🔒",
  "color": "red"
}

Prompteka: ✅ Created prompt, visible in app
```

### Search and Summarize

```
User: "What prompts do I have about database design?"

AI (via search_prompts):
→ Returns 3 matching prompts

AI summarizes:
- "Database Optimization" (2 weeks old)
- "SQL Injection Testing" (1 month old)
- "NoSQL Considerations" (3 months old)
```

### Reorganize

```
User: "Move all my API prompts into the API folder"

AI:
1. list_prompts(search="API")
2. For each result: update_prompt(..., folder_id=api_folder_id)
→ Prompts reorganized
```

---

**Document Version**: 1.0
**Last Updated**: December 9, 2025
**Status**: Active
