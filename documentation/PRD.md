# Prompteka MCP Server - Product Requirements Document v4

**Status**: MVP Phase (Full Read-Write Direct DB Access)
**Updated**: December 9, 2025
**Protocol Version**: 1.0

---

## Overview

An MCP (Model Context Protocol) server providing AI assistants with full access to Prompteka's prompt library via direct SQLite database access:
- **Reads** (5 tools): Direct SQLite database access (fast, < 100ms, no app required)
- **Writes** (7 tools): Direct SQLite database writes using WAL mode (immediate, < 10ms, no app required)

**12 Total Tools**:
- **Read-Only** (5): list_folders, list_prompts, get_prompt, search_prompts, health_check
- **Write Operations** (7): create_prompt, update_prompt, delete_prompt, create_folder, update_folder, delete_folder, move_prompt

Enables: "Save this prompt to my Security folder", "Move all testing prompts to QA folder", "Organize my library automatically", "Verify the MCP server is running".

## Architecture

### Data Flow

```
AI Assistant
    ↓ (MCP Protocol)
MCP Server
    ├→ listFolders() → Direct SQLite Read (< 100ms) ← Prompteka SQLite
    ├→ listPrompts() → Direct SQLite Read (< 100ms) ← Prompteka SQLite
    ├→ createPrompt() → Direct SQLite Write (< 10ms) ← Prompteka SQLite (WAL mode)
    ├→ updatePrompt() → Direct SQLite Write (< 10ms) ← Prompteka SQLite (WAL mode)
    └→ deletePrompt() → Direct SQLite Write (< 10ms) ← Prompteka SQLite (WAL mode)

Note: Changes are immediately visible to the Prompteka app via SQLite's WAL mechanism.
No async queue, no file watching, no response polling - everything is synchronous and instant.
The Prompteka app can run concurrently without conflicts, locks, or corruption risk.
```

### Directory Structure

```
~/Library/Application Support/prompteka/
├── prompts.db                    # SQLite database (read-write by MCP, WAL mode enabled)
├── prompts.db-wal                # WAL file (enables concurrent read-write access)
├── prompts.db-shm                # WAL shared memory (SQLite internal)
└── import-queue/                 # DEPRECATED: No longer used by MCP server
    └── (maintained by Prompteka app for other use cases)
```

---

## Protocol Contract

### Version

```
Protocol Version: 1.0
Minimum MCP SDK: 0.1.0
Minimum Node: 18.0.0
Minimum macOS: 12.0
```

### Tool Definitions

All tools follow this contract:

#### Read Tools (Direct DB, Immediate Response)

##### `list_folders`

**Input Schema**:
```json
{
  "type": "object",
  "properties": {
    "includeEmpty": { "type": "boolean", "default": false }
  },
  "additionalProperties": false
}
```

**Output Schema**:
```json
{
  "type": "array",
  "items": {
    "type": "object",
    "properties": {
      "id": { "type": "string", "pattern": "^[a-f0-9\\-]{36}$" },
      "name": { "type": "string", "minLength": 1, "maxLength": 255 },
      "parentId": { "type": ["string", "null"], "pattern": "^[a-f0-9\\-]{36}$|^null$" },
      "emoji": { "type": ["string", "null"], "maxLength": 2 },
      "color": { "type": ["string", "null"], "enum": ["red", "orange", "yellow", "green", "blue", "purple", null] },
      "childCount": { "type": "integer", "minimum": 0 },
      "promptCount": { "type": "integer", "minimum": 0 },
      "createdAt": { "type": "string", "format": "date-time" },
      "updatedAt": { "type": "string", "format": "date-time" }
    },
    "required": ["id", "name", "parentId", "childCount", "promptCount", "createdAt", "updatedAt"],
    "additionalProperties": false
  }
}
```

**Timeout**: 2 seconds
**Max Results**: 1000 folders
**Errors**: `DATABASE_ERROR`, `INVALID_INPUT`

---

##### `list_prompts`

**Input Schema**:
```json
{
  "type": "object",
  "properties": {
    "folderId": { "type": ["string", "null"], "pattern": "^[a-f0-9\\-]{36}$|^null$" },
    "limit": { "type": "integer", "minimum": 1, "maximum": 500, "default": 100 },
    "offset": { "type": "integer", "minimum": 0, "default": 0 }
  },
  "additionalProperties": false
}
```

**Output Schema**:
```json
{
  "type": "object",
  "properties": {
    "prompts": {
      "type": "array",
      "maxItems": 500,
      "items": {
        "type": "object",
        "properties": {
          "id": { "type": "string", "pattern": "^[a-f0-9\\-]{36}$" },
          "title": { "type": "string", "minLength": 1, "maxLength": 255 },
          "content": { "type": "string", "maxLength": 100000 },
          "folderId": { "type": ["string", "null"], "pattern": "^[a-f0-9\\-]{36}$|^null$" },
          "emoji": { "type": ["string", "null"], "maxLength": 2 },
          "color": { "type": ["string", "null"], "enum": ["red", "orange", "yellow", "green", "blue", "purple", null] },
          "url": { "type": ["string", "null"], "format": "uri", "maxLength": 2048 },
          "createdAt": { "type": "string", "format": "date-time" },
          "updatedAt": { "type": "string", "format": "date-time" }
        },
        "required": ["id", "title", "content", "folderId", "createdAt", "updatedAt"],
        "additionalProperties": false
      }
    },
    "total": { "type": "integer", "minimum": 0 },
    "offset": { "type": "integer", "minimum": 0 },
    "limit": { "type": "integer", "minimum": 1, "maximum": 500 }
  },
  "required": ["prompts", "total", "offset", "limit"],
  "additionalProperties": false
}
```

**Timeout**: 3 seconds
**Pagination**: Limit 500 per page, use offset for iteration
**Errors**: `DATABASE_ERROR`, `FOLDER_NOT_FOUND`, `INVALID_INPUT`

---

##### `get_prompt`

**Input Schema**:
```json
{
  "type": "object",
  "properties": {
    "id": { "type": "string", "pattern": "^[a-f0-9\\-]{36}$" }
  },
  "required": ["id"],
  "additionalProperties": false
}
```

**Output**: Single prompt object (see list_prompts schema)

**Timeout**: 1 second
**Errors**: `DATABASE_ERROR`, `PROMPT_NOT_FOUND`, `INVALID_INPUT`

---

##### `search_prompts`

**Input Schema**:
```json
{
  "type": "object",
  "properties": {
    "query": { "type": "string", "minLength": 1, "maxLength": 500 },
    "limit": { "type": "integer", "minimum": 1, "maximum": 500, "default": 100 },
    "offset": { "type": "integer", "minimum": 0, "default": 0 }
  },
  "required": ["query"],
  "additionalProperties": false
}
```

**Output**: Same as list_prompts (array with pagination)

**Timeout**: 5 seconds (FTS index)
**Search**: Full-text search on title + content
**Pagination**: Limit 500 per page
**Errors**: `DATABASE_ERROR`, `SEARCH_INVALID`, `INVALID_INPUT`

---

#### Write Tools (Direct SQLite, Synchronous Response)

All write tools follow this pattern:
1. Validate input locally
2. Acquire database write lock (serialized by SQLite)
3. Execute atomic operation in transaction
4. Return success response immediately (< 10ms typical)
5. Changes visible to all readers via WAL mode

##### `create_prompt`

**Input Schema**:
```json
{
  "type": "object",
  "properties": {
    "title": { "type": "string", "minLength": 1, "maxLength": 255 },
    "content": { "type": "string", "minLength": 1, "maxLength": 100000 },
    "folderId": { "type": ["string", "null"], "pattern": "^[a-f0-9\\-]{36}$|^null$", "default": null },
    "emoji": { "type": ["string", "null"], "maxLength": 2, "default": null },
    "color": { "type": ["string", "null"], "enum": ["red", "orange", "yellow", "green", "blue", "purple", null], "default": null },
    "url": { "type": ["string", "null"], "format": "uri", "maxLength": 2048, "default": null }
  },
  "required": ["title", "content"],
  "additionalProperties": false
}
```

**Response Schema**:
```json
{
  "type": "object",
  "properties": {
    "status": { "type": "string", "enum": ["success", "error"] },
    "id": { "type": ["string", "null"], "description": "Prompt ID if success" },
    "message": { "type": "string", "description": "Human-readable message" },
    "error": { "type": ["string", "null"], "description": "Error code: VALIDATION_ERROR, FOLDER_NOT_FOUND, DATABASE_ERROR, INVALID_EMOJI, INVALID_COLOR" }
  },
  "required": ["status", "message", "error"],
  "additionalProperties": false
}
```

**Response Time**: < 10ms (synchronous)
**Errors**: See error taxonomy below

---

##### `update_prompt`

**Input Schema**:
```json
{
  "type": "object",
  "properties": {
    "id": { "type": "string", "pattern": "^[a-f0-9\\-]{36}$" },
    "title": { "type": ["string", "null"], "minLength": 1, "maxLength": 255 },
    "content": { "type": ["string", "null"], "minLength": 1, "maxLength": 100000 },
    "folderId": { "type": ["string", "null"], "pattern": "^[a-f0-9\\-]{36}$|^null$" },
    "emoji": { "type": ["string", "null"], "maxLength": 2 },
    "color": { "type": ["string", "null"], "enum": ["red", "orange", "yellow", "green", "blue", "purple", null] },
    "url": { "type": ["string", "null"], "format": "uri", "maxLength": 2048 }
  },
  "required": ["id"],
  "additionalProperties": false
}
```

**Response**: Same as create_prompt

**Response Time**: < 10ms (synchronous)
**Errors**: `VALIDATION_ERROR`, `PROMPT_NOT_FOUND`, `FOLDER_NOT_FOUND`, `DATABASE_ERROR`, `INVALID_EMOJI`, `INVALID_COLOR`

---

##### `delete_prompt`

**Input Schema**:
```json
{
  "type": "object",
  "properties": {
    "id": { "type": "string", "pattern": "^[a-f0-9\\-]{36}$" }
  },
  "required": ["id"],
  "additionalProperties": false
}
```

**Response**:
```json
{
  "type": "object",
  "properties": {
    "status": { "type": "string", "enum": ["success", "error"] },
    "message": { "type": "string" },
    "error": { "type": ["string", "null"] }
  },
  "required": ["status", "message", "error"],
  "additionalProperties": false
}
```

**Response Time**: < 10ms (synchronous)
**Errors**: `DATABASE_ERROR`

---

##### `create_folder`

**Input Schema**:
```json
{
  "type": "object",
  "properties": {
    "name": { "type": "string", "minLength": 1, "maxLength": 255 },
    "parentId": { "type": ["string", "null"], "pattern": "^[a-f0-9\\-]{36}$|^null$", "default": null },
    "emoji": { "type": ["string", "null"], "maxLength": 2, "default": null },
    "color": { "type": ["string", "null"], "enum": ["red", "orange", "yellow", "green", "blue", "purple", null], "default": null }
  },
  "required": ["name"],
  "additionalProperties": false
}
```

**Response**: Same as create_prompt (includes folder ID on success)

**Response Time**: < 10ms (synchronous)
**Errors**: `VALIDATION_ERROR`, `PARENT_FOLDER_NOT_FOUND`, `DATABASE_ERROR`, `INVALID_EMOJI`, `INVALID_COLOR`

---

##### `update_folder`

**Input Schema**:
```json
{
  "type": "object",
  "properties": {
    "id": { "type": "string", "pattern": "^[a-f0-9\\-]{36}$" },
    "name": { "type": ["string", "null"], "minLength": 1, "maxLength": 255 },
    "parentId": { "type": ["string", "null"], "pattern": "^[a-f0-9\\-]{36}$|^null$" },
    "emoji": { "type": ["string", "null"], "maxLength": 2 },
    "color": { "type": ["string", "null"], "enum": ["red", "orange", "yellow", "green", "blue", "purple", null] }
  },
  "required": ["id"],
  "additionalProperties": false
}
```

**Response**: Same as create_folder

**Response Time**: < 10ms (synchronous)
**Errors**: `VALIDATION_ERROR`, `FOLDER_NOT_FOUND`, `PARENT_FOLDER_NOT_FOUND`, `DATABASE_ERROR`, `INVALID_EMOJI`, `INVALID_COLOR`

---

##### `delete_folder`

**Input Schema**:
```json
{
  "type": "object",
  "properties": {
    "id": { "type": "string", "pattern": "^[a-f0-9\\-]{36}$" },
    "recursive": { "type": "boolean", "default": false, "description": "If true, delete folder + contents. If false, fail if folder not empty." }
  },
  "required": ["id"],
  "additionalProperties": false
}
```

**Response**: Same as create_folder

**Response Time**: < 10ms (synchronous)
**Safety**: If `recursive=false` and folder has prompts/subfolders, returns error
**Errors**: `FOLDER_NOT_FOUND`, `FOLDER_NOT_EMPTY`, `DATABASE_ERROR`

---

## Database Contract (Direct SQLite Access)

### Write Operation Mechanism

**DEPRECATED**: Previous version used file-based queue. Current version uses direct SQLite writes.

**Current Approach**: All write operations execute directly against the Prompteka SQLite database using WAL mode for safe concurrent access.

**Benefits**:
- Immediate responses (< 10ms vs 200-500ms)
- No app dependency - works standalone
- No queue polling or file system watching
- Atomic ACID transactions
- Safe concurrent read-write with Prompteka app

**Database Access**:
- **Location**: `~/Library/Application Support/prompteka/prompts.db`
- **Mode**: WAL (Write-Ahead Logging) enabled
- **Concurrent Access**: Readers don't block writers, writers serialize automatically
- **Lock Timeout**: SQLite SQLITE_BUSY retry up to 5 seconds
- **Rollback**: Automatic on validation error (no partial writes)

### Transaction Isolation & Consistency

**ACID Guarantees**:
- **Atomicity**: Operation succeeds or fails completely (no partial updates)
- **Consistency**: Database is always in valid state (constraints enforced)
- **Isolation**: Concurrent reads don't see uncommitted writes (SQLite snapshot isolation)
- **Durability**: Committed changes survive crashes (fsync to disk)

**Write Sequence**:
1. Validate input against JSON schemas (immediate error if invalid)
2. BEGIN TRANSACTION
3. Check foreign key constraints (e.g., folder exists)
4. Execute INSERT/UPDATE/DELETE operation
5. COMMIT TRANSACTION (or automatic ROLLBACK if error)
6. Return response (< 10ms total)

**Error Handling**:
- Validation errors: No transaction, return immediately with error code
- Database errors (locked): Retry up to 5 seconds with exponential backoff
- Constraint violations: ROLLBACK transaction, return `CONSTRAINT_VIOLATION` error
- Corruption: Very rare with WAL mode, return `DATABASE_ERROR` and log details

### Concurrency Model

**Reader-Writer Compatibility**:
- Multiple readers: Simultaneous, never blocked
- Writer + readers: Readers use snapshot, writer proceeds
- Multiple writers: Serialized by SQLite (one at a time)
- Deadlocks: Impossible (SQLite serializes writes)

**WAL Mode Benefits**:
- Readers use "-wal" file, writers use main file
- No checkpoint blocking (async background writer)
- Power failure safe (WAL journal keeps consistency)
- Better performance for concurrent access

---

## Error Taxonomy

### Validation Errors (Local, Immediate)

Client's responsibility to fix:

| Error Code | Status | Message | Retry? |
|------------|--------|---------|--------|
| `INVALID_INPUT` | 400 | "Missing required field: title" | No |
| `INVALID_EMOJI` | 400 | "Emoji must be 1-2 characters" | No |
| `INVALID_COLOR` | 400 | "Color must be one of: red, blue, green..." | No |
| `INVALID_UUID` | 400 | "ID is not a valid UUID" | No |
| `PAYLOAD_TOO_LARGE` | 413 | "Prompt content exceeds 100KB limit" | No |

### Processing Errors (App's responsibility, in response file)

Server encountered issue during DB operation:

| Error Code | Message | Retry? | Action |
|------------|---------|--------|--------|
| `FOLDER_NOT_FOUND` | "Folder {id} does not exist" | No | Check folder exists before retrying |
| `PROMPT_NOT_FOUND` | "Prompt {id} does not exist" | No | Check prompt exists |
| `FOLDER_NOT_EMPTY` | "Folder has 3 prompts; use recursive=true to delete" | Maybe | User chooses to delete contents or not |
| `DATABASE_ERROR` | "Database locked (usually transient)" | Yes | Retry with backoff |
| `INVALID_EMOJI` | "Server-side validation failed on emoji" | No | Should not happen if MCP validates |
| `INVALID_COLOR` | "Server-side validation failed on color" | No | Should not happen if MCP validates |

### System Errors (Infrastructure)

| Error Code | Cause | Action |
|------------|-------|--------|
| `QUEUE_FULL` | `import-queue/` has 1000+ pending files | Wait and retry |
| `PERMISSION_DENIED` | Queue directory not writable | Check permissions (0700) |
| `RESPONSE_TIMEOUT` | No response file within 5 seconds | Log for debugging; may be Prompteka crash |

---

## Safety & Security

### Path Validation (MCP Server)

**On startup, validate**:
- Queue directory exists and is readable/writable
- DB file exists and is readable
- Queue directory is NOT a symlink (reject symlinks)
- No path traversal attempts (`../` rejected)
- Base path must be exactly `~/Library/Application Support/prompteka`

**On every write**:
- Generated UUID (no user input in path)
- Atomic write via temp file + rename
- File permissions set to 0600 (user only)

### Data Validation (MCP Server, Before Writing Queue)

**Always validate**:
- title/content not empty or whitespace-only
- Emoji is 1-2 characters (not arbitrary unicode)
- Color is from allowed list
- UUIDs match pattern
- Content under 100KB
- Folder exists (for folderId references)
- No SQL injection attempts (validation only; app uses prepared statements)

### Logging & PII

**Structured Logs** (always include):
```json
{
  "timestamp": "2025-12-09T10:30:45.123Z",
  "tool": "create_prompt",
  "requestId": "{MCP request ID}",
  "operationId": "{UUID}",
  "durationMs": 145,
  "status": "success|error",
  "error": null,
  "metadata": {
    "folderId": "...",
    "titleLength": 25,
    "contentLength": 1024
  }
}
```

**PII Redaction Rules**:
- Never log full prompt content
- Never log email addresses or URLs
- Log field names and lengths only
- At `LOG_LEVEL=debug`, may log content (admin use only)

---

## Configuration & Setup

### Environment Variables

| Variable | Default | Purpose | Required |
|----------|---------|---------|----------|
| `PROMPTEKA_DB_PATH` | Auto-detect | Path to prompts.db | No (auto-found) |
| `PROMPTEKA_QUEUE_PATH` | Auto-detect | Path to import-queue/ | No (auto-found) |
| `LOG_LEVEL` | `info` | Logging verbosity: debug, info, warn, error | No |
| `NODE_ENV` | `production` | Environment | No |

### Auto-Detection

MCP server auto-detects paths by:
1. Check `$PROMPTEKA_DB_PATH` env var
2. Check `~/Library/Application Support/prompteka/prompts.db`
3. If not found, error with clear instructions

### Minimum Requirements

| Requirement | Minimum Version | Notes |
|---|---|---|
| macOS | 12.0 (Monterey) | Prompteka requirement |
| Node.js | 18.0.0 | LTS, ESM support |
| npm | 9.0.0 | With Node 18 |
| Prompteka | 1.6.2+ | WAL mode support |

---

## Observability

### Structured Logging Format

Every operation logs this structure:

```typescript
interface LogEntry {
  timestamp: string;          // ISO 8601
  level: "debug" | "info" | "warn" | "error";
  tool: string;               // "list_prompts", "create_prompt", etc.
  requestId?: string;         // MCP request ID
  operationId?: string;       // Queue operation UUID
  durationMs: number;         // How long the operation took
  status: "success" | "error";
  error?: string;             // Error code (see taxonomy)
  message?: string;           // Human-readable message
  metadata?: {                // Operation-specific data
    folderId?: string;
    itemCount?: number;
    resultSize?: number;      // Bytes
  };
}
```

### Log Levels

- **debug**: Full payloads, all function calls (development only)
- **info**: Operation start/end, results count, latency
- **warn**: Timeouts, retries, unusual conditions
- **error**: Failures, validation errors, system issues

### Health Checks (Optional v1.1)

Tool `_health_check` (MCP convention):
```json
{
  "status": "healthy|degraded|unhealthy",
  "database": "connected|disconnected",
  "queue": "writable|read_only|missing",
  "uptime_seconds": 3600,
  "operations_processed": 1234,
  "errors_last_hour": 5
}
```

---

## Testing Requirements

Before ship:

- [ ] Contract tests: validate all tool schemas (input/output)
- [ ] Queue tests: write file, wait for response, cleanup
- [ ] Path validation: reject symlinks, traversal attempts
- [ ] Error cases: folder not found, prompt not found, timeout
- [ ] Concurrent: two writes to same prompt (second waits/retries)
- [ ] Permissions: validate 0700 on queue directory
- [ ] Logging: verify structured format, no PII

---

## Migration & Versioning

### Protocol Versioning

Backward compatibility: tools keep old signature, add new tool for new behavior.

If breaking change needed (v2.0):
- Support both v1 and v2 tools simultaneously
- Log deprecation warnings for v1 clients
- 6-month deprecation period before removal

### Database Schema

MCP server is **read-only** (read) or **write-only** (via queue).
No schema migrations needed in MCP server.
Prompteka app handles schema upgrades.

---

## Deployment & Rollout

### Phase 1: Read-Only MVP
- [ ] Database reader working
- [ ] Read-only tools: list_folders, list_prompts, get_prompt, search_prompts (4 tools)
- [ ] Structured logging
- [ ] npm package published
- [ ] Documentation complete

### Phase 2: Full CRUD + Organization
- [ ] Queue writer working
- [ ] Write tools: create/update/delete for prompts + folders (6 tools)
- [ ] Organization tools: move_prompt, export_prompts (2 tools)
- [ ] Response file handling
- [ ] Retry/cleanup policy
- [ ] Error handling complete
- [ ] End-to-end testing
- [ ] npm package updated

### Phase 3: Data Management & Backup
- [ ] Backup/restore tools (2 tools)
- [ ] ZIP compression integration
- [ ] Atomic restore with rollback
- [ ] Integration testing

### Phase 4: Production Rollout
- [ ] Security review complete
- [ ] All 14 tools tested extensively
- [ ] Performance benchmarks verified
- [ ] User documentation published
- [ ] Support procedures established

### Post-Launch Monitoring
- Track operation counts by tool type
- Monitor error rates and types
- Check response time latencies
- Validate queue health
- Monitor backup/restore/export operations
- Track file export statistics

---

## Use Cases

### UC1: Capture Prompt Quickly
```
User: "Save this prompt to my Engineering folder"
AI: create_prompt(title, content, folderId)
→ Prompt visible in Prompteka within 500ms
```

### UC2: Organize Existing Prompts
```
User: "Move all my testing prompts to the QA folder"
AI: search_prompts("testing")
    → [3 prompts]
    → update_prompt(id, folderId=qa_folder) for each
→ Prompts reorganized in Prompteka
```

### UC3: Audit Library
```
User: "How many prompts do I have by color?"
AI: list_folders()
    → for each folder: list_prompts(folderId)
    → count by color
→ AI summarizes: "3 red, 5 blue, 2 green"
```

### UC4: Clone & Customize
```
User: "Make a variant of my API review prompt for REST"
AI: get_prompt(id)
    → create_prompt(title="API Review (REST)", content=modified, folderId=same)
→ New prompt in Prompteka
```

##### `move_prompt`

**Input Schema**:
```json
{
  "type": "object",
  "properties": {
    "promptId": { "type": "string", "pattern": "^[a-f0-9\\-]{36}$" },
    "targetFolderId": { "type": ["string", "null"], "pattern": "^[a-f0-9\\-]{36}$|^null$" }
  },
  "required": ["promptId", "targetFolderId"],
  "additionalProperties": false
}
```

**Response**:
```json
{
  "status": "success",
  "message": "Prompt moved to target folder",
  "data": {
    "promptId": "...",
    "targetFolderId": "...",
    "previousFolderId": "..."
  }
}
```

**Response Time**: < 10ms (synchronous)
**Behavior**: Move prompt to specified folder (null = root folder)
**Errors**: `PROMPT_NOT_FOUND`, `FOLDER_NOT_FOUND`, `DATABASE_ERROR`

---

##### `export_prompts`

**Input Schema**:
```json
{
  "type": "object",
  "properties": {
    "format": { "type": "string", "enum": ["json", "csv", "markdown"], "default": "json" },
    "folderId": { "type": ["string", "null"] },
    "includeMetadata": { "type": "boolean", "default": true }
  },
  "additionalProperties": false
}
```

**Response**:
```json
{
  "status": "success",
  "message": "Exported 25 prompts",
  "data": {
    "format": "json",
    "filename": "prompts-export-2025-12-09.json",
    "path": "~/Downloads/",
    "promptCount": 25,
    "sizeBytes": 102400
  }
}
```

**Timeout**: 8 seconds (conversion + write)
**Formats**:
- `json` - Full prompt objects with all metadata
- `csv` - Tabular format (title, content, folder, emoji, color, url)
- `markdown` - Markdown file with folder structure and prompts

**Errors**: `DATABASE_ERROR`, `INVALID_INPUT`, `PERMISSION_DENIED`

---

##### `backup_prompts`

**Input Schema**:
```json
{
  "type": "object",
  "properties": {
    "includeMetadata": { "type": "boolean", "default": true }
  },
  "additionalProperties": false
}
```

**Response**:
```json
{
  "status": "success",
  "id": "backup-uuid",
  "message": "Backup created at ~/Downloads/prompteka-backup-2025-12-09.zip",
  "data": {
    "filename": "prompteka-backup-2025-12-09.zip",
    "path": "~/Downloads/",
    "folderCount": 8,
    "promptCount": 127,
    "sizeBytes": 524288
  }
}
```

**Timeout**: 10 seconds (may include compression)
**Output**: ZIP file with all prompts, folders, and metadata
**Includes**: JSON export + folder structure + manifest
**Errors**: `DATABASE_ERROR`, `PERMISSION_DENIED`, `INTERNAL_ERROR`

---

##### `restore_prompts`

**Input Schema**:
```json
{
  "type": "object",
  "properties": {
    "backupPath": { "type": "string", "minLength": 1, "maxLength": 1024 },
    "overwrite": { "type": "boolean", "default": false }
  },
  "required": ["backupPath"],
  "additionalProperties": false
}
```

**Response**:
```json
{
  "status": "success",
  "message": "Restored 8 folders and 127 prompts from backup",
  "data": {
    "foldersCreated": 8,
    "promptsCreated": 127,
    "promptsSkipped": 0,
    "promptsOverwritten": 0
  }
}
```

**Timeout**: 15 seconds (may include validation + import)
**Behavior**:
- If `overwrite=false`: Skip prompts with matching ID (merge mode)
- If `overwrite=true`: Replace existing prompts with same ID
- Folders created/updated as needed
- Atomic operation (rollback on error)

**Errors**: `DATABASE_ERROR`, `INVALID_INPUT`, `PERMISSION_DENIED`, `INTERNAL_ERROR`

---

## Local-Only & App Store Compliance

### Network & Privacy Policy

**The MCP server is strictly local-only**:
- ✅ No network calls whatsoever
- ✅ No external API communication
- ✅ No telemetry or analytics
- ✅ No data transmission outside the machine
- ✅ Operates entirely within `~/Library/Application Support/prompteka/`

**App Store Compliance**:
- Runs only when explicitly invoked by an MCP-compatible AI assistant
- Accesses ONLY Prompteka data directory
- Uses filesystem events (no code injection, no privilege escalation)
- Respects macOS sandbox restrictions
- No persistent background processes
- Safe for App Store distribution

**Data Handling for Prompteka**:
- MCP server processes user's prompt library data
- No data stored outside Prompteka's designated folder
- No copies sent to remote servers
- Operations logged locally only
- User retains full control of all data

---

## Concurrency & Limits Policy

### Read-Only Operations

**Single Connection Pattern**:
- MCP server opens ONE read-only SQLite connection at startup
- Connection reused for all read operations (list_folders, list_prompts, get_prompt, search_prompts)
- WAL mode ensures concurrent reads don't block writes by Prompteka app
- Connection auto-closed on server shutdown

**Concurrency Guarantee**:
- Multiple simultaneous read tools can run in parallel (MCP platform handles this)
- No locking, no contention, no serialization needed
- Safe with Prompteka app's concurrent writes

### Write Operations

**Serialization**: Write operations are logically serialized through the queue:
1. MCP writes to `{uuid}.json`
2. Prompteka processes one file at a time (watches queue sequentially)
3. Response written to `.response-{uuid}.json`
4. No parallel writes risk database conflicts

**Queue Depth Limit**:
- If `import-queue/` has 1000+ files, reject with `QUEUE_FULL` error
- Prevents runaway file accumulation

**Max Parallel Requests** (MCP client level):
- No hard limit enforced (MCP platform manages)
- Recommended: max 5 concurrent write tools per session
- Queuing provides natural backpressure

### Idempotency Guarantees

**Update & Delete Operations**:
- Same `id` sent twice = only processed once (idempotent)
- Second identical request returns: "Already updated: {field changes applied}"
- Safe to retry without side effects
- Response file reuse: if `.response-{uuid}.json` exists, return it (don't reprocess)

**Delete Idempotency**:
- Deleting non-existent prompt = success ("Already deleted")
- No error thrown

---

## Resilience & Orphan Handling

### Server Restart Recovery

**On MCP Server Startup**:
```
1. Scan import-queue/ for pending operations
2. If `.response-{uuid}.json` exists but `.../processed/{uuid}.json` not yet moved:
   - Operation succeeded, response file still valid → return it
3. If no response file exists:
   - Operation may have crashed → delete stale `.{uuid}.tmp` files
4. Clean up orphaned response files (> 24h old) → log count
5. Begin normal operation
```

**Orphaned Operations** (Prompteka crashed before responding):
- MCP detects timeout (5s) → returns `RESPONSE_TIMEOUT` to client
- User can retry immediately (idempotent)
- If retry fails again, user knows there's a problem

**Queue Health Check**:
- On startup, verify queue directory is writable
- If not writable, refuse to start (log clear error message)

### Timeout Handling

**Write Operation Timeout** (5 seconds):
1. MCP writes `{uuid}.json`
2. Wait for `.response-{uuid}.json` for 5s
3. If timeout: Retry 1 (wait 1s, then wait 5s again) + Retry 2 (same pattern)
4. If still no response: Return `RESPONSE_TIMEOUT` error to client

**User Guidance for Timeout**:
- Check if Prompteka app is running
- Check queue directory for stuck files
- Restart Prompteka app and retry

### Orphan File Cleanup

**MCP Cleanup (on startup)**:
- Delete `.response-{uuid}.json` files > 24 hours old
- Log: "Cleaned {N} orphaned response files from last session"
- Frees disk space

**Prompteka Cleanup (daily background)**:
- Delete `processed/{uuid}.json` > 7 days old
- Keep `failed/{uuid}.json` indefinitely (user inspection)

---

## Client Response Sizing & Pagination

### Response Size Limits

**list_prompts & search_prompts**:
- Max 500 items per response (enforced)
- Typical response size: 500 prompts @ 2KB each = 1MB
- If prompt content is very large (100KB max), still under limit

**list_folders**:
- Max 1000 folders per response
- Typical size: ~100 bytes per folder = 100KB max

**No Truncation Needed**: Responses are always under network limits (1MB << 10MB typical)

### Pagination Defaults

**list_prompts & search_prompts**:
```json
{
  "limit": 100,      // Default (client can request up to 500)
  "offset": 0        // Start from beginning
}
```

**Recommended Client Behavior**:
- First call: `limit=100, offset=0` (get first 100)
- Loop: increment `offset` by 100 each call
- Stop when: `offset >= total` (from response)

**Example**:
```
Call 1: list_prompts(limit=100, offset=0)   → 100 items, total=350
Call 2: list_prompts(limit=100, offset=100) → 100 items
Call 3: list_prompts(limit=100, offset=200) → 100 items
Call 4: list_prompts(limit=100, offset=300) → 50 items (last page)
Done (offset 400 >= total 350)
```

### Stable Operation IDs

**Queue Operations**:
- Each write generates UUIDv4 (stable, unique)
- Client can use operation ID to:
  - Track retry progress
  - Correlate with logs
  - Debug failures

---

## Configuration File Support

### Configuration Methods (Precedence)

1. **Environment Variables** (highest priority)
   ```bash
   export PROMPTEKA_DB_PATH="/custom/path/prompts.db"
   export PROMPTEKA_QUEUE_PATH="/custom/path/import-queue"
   export LOG_LEVEL="debug"
   ```

2. **.env File** (project root)
   ```
   PROMPTEKA_DB_PATH=/custom/path/prompts.db
   PROMPTEKA_QUEUE_PATH=/custom/path/import-queue
   LOG_LEVEL=info
   ```

3. **Defaults** (lowest priority)
   ```
   PROMPTEKA_DB_PATH: ~/Library/Application Support/prompteka/prompts.db
   PROMPTEKA_QUEUE_PATH: ~/Library/Application Support/prompteka/import-queue
   LOG_LEVEL: info
   ```

### Config File Validation

On startup:
- Read env vars + .env file
- Validate all paths exist and are readable/writable
- If invalid: log clear error and exit with code 1
- Never proceed with invalid config

---

## Detailed Testing Strategy

### Unit Tests

**Contract Tests** (must pass):
- [ ] Validate all tool input schemas (reject invalid inputs)
- [ ] Validate all tool output schemas (responses match spec)
- [ ] Test pagination limits (max 500, reject >500)
- [ ] Test emoji validation (1-2 chars, reject invalid)
- [ ] Test color validation (only 6 allowed colors)
- [ ] Test UUID validation (reject malformed UUIDs)

**Path Validation Tests**:
- [ ] Reject symlinks in queue path
- [ ] Reject `../` traversal attempts
- [ ] Accept only exact `~/Library/Application Support/prompteka` base
- [ ] Verify 0600 permissions on written files

**Error Cases**:
- [ ] Folder not found → `FOLDER_NOT_FOUND`
- [ ] Prompt not found → `PROMPT_NOT_FOUND`
- [ ] Payload too large → `PAYLOAD_TOO_LARGE`
- [ ] Invalid color → `INVALID_COLOR`

### Integration Tests

**Queue Operations** (write file → verify response):
- [ ] create_prompt → response file appears → cleanup
- [ ] update_prompt → response file appears → idempotent on retry
- [ ] delete_prompt → response file appears → idempotent (delete non-existent)
- [ ] create_folder → response file appears → verify folderId in response

**Timeout & Retry** (in temp directory):
- [ ] Write file, simulate 5s+ delay → timeout, retry, eventually succeed
- [ ] Verify 3 total attempts (initial + 2 retries)
- [ ] Verify 1s backoff between retries

**Concurrent Operations**:
- [ ] Two read tools in parallel (should succeed)
- [ ] Two write tools in parallel to queue (both succeed, both process)

**SQLite Fixtures**:
- [ ] Create temporary SQLite db with Prompteka schema
- [ ] Seed sample folders/prompts
- [ ] Run read tools against fixture
- [ ] Verify results match expected

### SQLite Fixture Template

```sql
CREATE TABLE folders (id TEXT PRIMARY KEY, name TEXT, ...);
CREATE TABLE prompts (id TEXT PRIMARY KEY, title TEXT, content TEXT, folder_id TEXT, ...);

INSERT INTO folders VALUES ('folder-1', 'Engineering', NULL, '🔧', 'blue', '2025-12-01T10:00:00Z', '2025-12-01T10:00:00Z');
INSERT INTO prompts VALUES ('prompt-1', 'API Review', 'Content...', 'folder-1', '📋', 'red', NULL, '2025-12-01T10:00:00Z', '2025-12-01T10:00:00Z');
-- ... more test data
```

### Logging Tests

- [ ] Verify structured log format (has all required fields)
- [ ] Verify no PII in logs (check titleLength, not title)
- [ ] Verify error logs include error code
- [ ] Verify latency is recorded correctly

---

## Upgrade & Versioning Policy

### Protocol Versioning

**Current**: v1.0

**Backward Compatibility Strategy**:
- New minor versions (v1.1, v1.2) add tools but keep all v1.0 tools intact
- Major version (v2.0) only if breaking changes required

**Example**: If adding new `list_prompts_v2` tool:
- Keep old `list_prompts` tool working
- New clients use `list_prompts_v2`
- Old clients continue with `list_prompts`
- 6-month deprecation warning for v1.0 users

### npm Package Versioning

```
v1.0.0 - Initial release (4 read tools)
v1.1.0 - Add write tools (6 additional tools)
v1.2.0 - Add health check tool
v2.0.0 - Breaking change (theoretical future)
```

### Client Version Detection

Clients can check: `prompteka-mcp --version` to verify they have the right MCP tools available.

---

## App Store Review Checklist

### Privacy & Security

- [ ] **Local-Only**: Confirm no network calls in code (grep for http/https)
- [ ] **No Telemetry**: No analytics, error reporting, or data collection
- [ ] **Sandboxed**: Only accesses `~/Library/Application Support/prompteka`
- [ ] **No Tracking**: No user tracking, no device fingerprinting
- [ ] **Open Source**: Link to GitHub repo in documentation

### Data Handling

- [ ] **No Copies**: User's prompt data never copied outside directory
- [ ] **No Remote Storage**: No cloud backup or sync (MCP server is local only)
- [ ] **User Control**: User fully controls all data (can delete at any time)
- [ ] **Encryption**: No additional encryption needed (uses Prompteka's DB)

### Functionality

- [ ] **No Harmful Content**: Only reads/writes user's own prompts
- [ ] **No Manipulation**: Cannot modify other users' data
- [ ] **No Reverse Engineering**: Cannot extract Prompteka proprietary info
- [ ] **No Performance Degradation**: Queue operations don't slow down Prompteka

### Documentation

- [ ] **Privacy Policy**: Link to prompteka.net/privacy-policy.html
- [ ] **Clear Purpose**: README explains MCP server is for AI assistants
- [ ] **Permissions**: Document what the server can/cannot do
- [ ] **Data Retention**: Explain queue cleanup policies

---

## References

- MCP Specification: https://modelcontextprotocol.io
- Prompteka GitHub: https://github.com/webdevguyrg/prompteka
- JSON Schema: https://json-schema.org/
- SQLite WAL: https://sqlite.org/wal.html

---

**Document Version**: 3.0
**Status**: Ready for Implementation (All Gaps Addressed)
**Last Updated**: December 9, 2025
