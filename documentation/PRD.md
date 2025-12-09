# Prompteka MCP Server - Product Requirements Document v2

**Status**: MVP Phase (Read-Only → Queued Writes)
**Updated**: December 9, 2025
**Protocol Version**: 1.0

---

## Overview

An MCP (Model Context Protocol) server providing AI assistants with full CRUD access to Prompteka's prompt library via two mechanisms:
- **Reads**: Direct SQLite database access (fast, < 100ms)
- **Writes**: File-based import queue (safe, async, Prompteka-validated)

Enables: "Save this prompt to my Security folder", "List all prompts about testing", "Update the color of my API design prompt".

## Architecture

### Data Flow

```
AI Assistant
    ↓ (MCP Protocol)
MCP Server
    ├→ listFolders() → Direct DB Read ← Prompteka SQLite
    ├→ listPrompts() → Direct DB Read ← Prompteka SQLite
    ├→ createPrompt() → Write JSON File → ~/Library/Application Support/prompteka/import-queue/
    ├→ updatePrompt() → Write JSON File → import-queue/
    └→ deletePrompt() → Write JSON File → import-queue/
         ↓ (File System Events)
    Prompteka App (watches queue)
         ↓ (Validates, updates DB)
    User sees changes in 100-500ms
```

### Directory Structure

```
~/Library/Application Support/prompteka/
├── prompts.db                    # SQLite database (opened read-only by MCP)
├── prompts.db-wal                # WAL file (safe concurrent access)
├── prompts.db-shm                # WAL shared memory
└── import-queue/                 # Write queue (MCP writes here)
    ├── {uuid}.json               # Pending operation
    ├── .response-{uuid}.json     # Response from Prompteka (after processing)
    ├── processed/
    │   └── {uuid}.json           # Completed successfully
    └── failed/
        ├── {uuid}.json           # Failed with error
        └── {uuid}.error          # Error details (text file)
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

#### Write Tools (File-Based Queue, Async Response)

All write tools follow this pattern:
1. Validate input locally
2. Generate operation UUID
3. Write to `import-queue/{uuid}.json` (atomic: temp + rename)
4. Wait max 5 seconds for `.response-{uuid}.json`
5. Return response or timeout error

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

**Timeout**: 5 seconds (total wait for response file)
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

**Timeout**: 5 seconds
**Idempotency**: Same ID sent twice = first succeeds, second returns "already updated" (safe)
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

**Timeout**: 5 seconds
**Idempotency**: Deleting non-existent prompt = success (safe)
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

**Timeout**: 5 seconds
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

**Timeout**: 5 seconds
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

**Timeout**: 5 seconds
**Safety**: If `recursive=false` and folder has prompts/subfolders, returns error
**Errors**: `FOLDER_NOT_FOUND`, `FOLDER_NOT_EMPTY`, `DATABASE_ERROR`

---

## Queue Contract

### Write Operation File Format

**Location**: `~/Library/Application Support/prompteka/import-queue/{uuid}.json`

**Schema**:
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "operation": "create_prompt",
  "timestamp": "2025-12-09T10:30:45.123Z",
  "data": {
    "title": "Security Review",
    "content": "Review for...",
    "folderId": "550e8400-e29b-41d4-a716-446655440001"
  }
}
```

**Requirements**:
- `id`: UUIDv4, unique per operation
- `operation`: One of: `create_prompt`, `update_prompt`, `delete_prompt`, `create_folder`, `update_folder`, `delete_folder`
- `timestamp`: ISO 8601 with milliseconds
- `data`: Operation-specific payload (matches tool input schema)
- **Max file size**: 1 MB

### Write Operation Lifecycle

| Step | Actor | Action | Timeout | Notes |
|------|-------|--------|---------|-------|
| 1 | MCP | Write `.{uuid}.tmp` with operation JSON | N/A | Atomic: temp file + rename |
| 2 | MCP | Rename `.{uuid}.tmp` → `{uuid}.json` | N/A | Now visible to Prompteka |
| 3 | Prompteka | Detect `{uuid}.json` (file watcher) | - | Within 100ms typically |
| 4 | Prompteka | Read, validate, execute operation | 2s | Logs errors internally |
| 5 | Prompteka | Write `.response-{uuid}.json` with result | 2s | Response file (see below) |
| 6 | Prompteka | Move `{uuid}.json` to `processed/` or `failed/` | 1s | Marks complete |
| 7 | MCP | Poll for `.response-{uuid}.json` | 5s total | Return once found or timeout |
| 8 | MCP | Clean up response file | N/A | Delete after reading |

### Response File Format

**Location**: `~/Library/Application Support/prompteka/import-queue/.response-{uuid}.json`

**Success Response**:
```json
{
  "status": "success",
  "id": "new-prompt-uuid",
  "message": "Prompt 'Security Review' created successfully"
}
```

**Error Response**:
```json
{
  "status": "error",
  "error": "FOLDER_NOT_FOUND",
  "message": "Folder 550e8400-e29b-41d4-a716-446655440001 does not exist"
}
```

### Retry & Cleanup Policy

**MCP Server Retries** (for write operations):
- Initial attempt: write file
- Wait up to 5 seconds for response
- If timeout: retry up to 2 more times with 1s backoff
- If all retries fail: return error to client

**Prompteka Cleanup** (daily):
- Delete `processed/{uuid}.json` files older than 7 days
- Keep `failed/{uuid}.json` indefinitely (user inspection)
- Keep `.response-{uuid}.json` until operation moved (then delete)

**MCP Cleanup** (on startup):
- Delete `.response-{uuid}.json` older than 24 hours (orphaned responses)
- Log count of orphaned files

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

### Phase 1: Read-Only MVP (Week 1)
- [ ] Database reader working
- [ ] Read-only tools: list_folders, list_prompts, get_prompt, search_prompts
- [ ] Structured logging
- [ ] npm package published
- [ ] Documentation complete

### Phase 2: Full CRUD (Week 2)
- [ ] Queue writer working
- [ ] Write tools: all 6 (create/update/delete for prompts + folders)
- [ ] Response file handling
- [ ] Retry/cleanup policy
- [ ] Error handling complete
- [ ] End-to-end testing
- [ ] npm package updated

### Post-Launch Monitoring
- Track operation counts by type
- Monitor error rates and types
- Check response time latencies
- Validate queue health

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

---

## References

- MCP Specification: https://modelcontextprotocol.io
- Prompteka GitHub: https://github.com/webdevguyrg/prompteka
- JSON Schema: https://json-schema.org/
- SQLite WAL: https://sqlite.org/wal.html

---

**Document Version**: 2.0
**Status**: Ready for Implementation
**Last Updated**: December 9, 2025
