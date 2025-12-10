# Prompteka MCP Server - Senior Level Best Practices

> **Golden Rule**: "Should work" ≠ "does work". Assume nothing. Test everything.
> **MCP Principle**: Explicit contracts, safety guards, clear error taxonomy, observable operations.

This document defines the non-negotiable standards for Prompteka MCP server. These ensure production-ready code: safe, maintainable, scalable.

---

## Table of Contents

1. [Architecture Principles](#architecture-principles)
2. [MCP Protocol Standards](#mcp-protocol-standards)
3. [Code Quality Standards](#code-quality-standards)
4. [Safety & Security](#safety--security)
5. [Observability & Logging](#observability--logging)
6. [Testing Requirements](#testing-requirements)
7. [Banned Patterns](#banned-patterns)
8. [Success Metrics](#success-metrics)

---

## Architecture Principles

### 1. SOLID Principles (Enforced)

**Single Responsibility** - Each module has ONE reason to change
- `DatabaseReader` - Only reads from SQLite
- `DatabaseAccessor` - Only writes to SQLite (with transactions)
- `InputValidator` - Only validates tool inputs
- `MCPTools` - Only bridges MCP protocol and core logic
- `Logger` - Only logs (structured, no side effects)

**Open/Closed** - Open for extension, closed for modification
- New tools added without modifying existing ones
- New error types added without refactoring error handler
- Use interfaces/traits, not concrete implementations

**Liskov Substitution** - Implementations must be substitutable
- All readers implement `DatabaseReader` interface
- All writers implement `QueueWriter` interface
- Error handling consistent across all boundaries

**Interface Segregation** - Small, focused interfaces
- DatabaseReader has only read methods
- DatabaseAccessor has only write methods (transactions)
- Validator has only validation methods
- No interface pollution

**Dependency Inversion** - Depend on abstractions, not concretions
- Tools depend on `DatabaseReader` and `DatabaseAccessor` interfaces, not implementations
- Tests inject mock implementations
- DB path is injected, not hardcoded
- Logger is injected, not global

### 2. DRY (Don't Repeat Yourself)

**File Organization**:
```
src/
├── core/
│   ├── database-reader.ts      # SQLite read operations
│   ├── database-accessor.ts    # SQLite write operations (transactions)
│   └── types.ts                # Shared types (Prompt, Folder, UUID, etc.)
├── tools/
│   ├── index.ts                # Tool registry and exports
│   ├── read-tools.ts           # 5 read-only tools
│   └── write-tools.ts          # 7 write tools
├── validation/
│   ├── input-validator.ts      # Input schema validation
│   ├── schemas.ts              # JSON schemas (reusable)
│   └── error-taxonomy.ts       # Error codes and messages
├── observability/
│   └── logger.ts               # Structured logging
└── server.ts                   # MCP server setup
```

**No Code Duplication**:
- Validation logic shared in `input-validator.ts`
- Error responses use `error-taxonomy.ts`
- File operations use shared utilities in `queue-writer.ts`
- Logging uses centralized `logger.ts`
- Schemas defined once in `schemas.ts`, reused everywhere

### 3. YAGNI (You Aren't Gonna Need It)

**What we implement** (MVP is clean):
- ✅ 4 read tools (list_folders, list_prompts, get_prompt, search_prompts)
- ✅ 6 write tools (create/update/delete × 2)
- ✅ Input validation (JSON schema)
- ✅ Error taxonomy with clear codes
- ✅ Structured logging
- ✅ Queue lifecycle (write, wait, response)
- ✅ Path validation and safety guards

**What we DON'T implement** (not MVP):
- ❌ Caching layer (DB is fast)
- ❌ REST API wrapper
- ❌ GraphQL interface
- ❌ Bulk operations beyond what MCP allows
- ❌ Real-time change notifications
- ❌ Transaction/ACID guarantees (MCP is async)
- ❌ Clustering or multi-machine support
- ❌ Configuration file parsing (env vars only)
- ❌ Metrics/observability beyond structured logs

### 4. KISS (Keep It Simple, Stupid)

**Complexity Red Flags**:
- If explanation > 3 sentences → too complex
- If function > 40 lines → split it
- If conditional nesting > 3 levels → refactor
- If type signature hard to read → simplify

**Simple Patterns**:
- Linear execution (no fancy async patterns)
- Explicit error handling (never silent failures)
- Clear naming (names say what, not how)
- Small files (< 200 lines each)
- Obvious data flow (input → validate → execute → respond)

---

## MCP Protocol Standards

### Tool Definition Requirements

Every tool MUST have:

1. **Input Schema (JSON Schema)**
   - All fields typed and documented
   - Constraints: minLength, maxLength, pattern, enum, etc.
   - Required vs optional clear
   - No `additionalProperties` (strict validation)

2. **Output Schema (JSON Schema)**
   - Consistent response format
   - All error cases documented
   - Max size specified (e.g., result < 100KB)
   - Examples provided

3. **Timeout Specification**
   - Read tools: 1-5 seconds
   - Write tools: 5 seconds (includes queue wait)
   - Documented in tool description

4. **Error Cases**
   - All possible error codes listed
   - Retry vs fail guidance
   - Client-facing messages (no internal errors)

5. **Pagination (if applicable)**
   - Limit and offset parameters
   - Max page size (e.g., 500)
   - Total count returned
   - Documented example

### Tool Categories

**Read Tools** (Direct DB, Immediate Response):
- `list_folders` - All folders with metadata
- `list_prompts` - Paginated prompts by folder
- `get_prompt` - Single prompt by ID
- `search_prompts` - Full-text search with pagination

**Write Tools** (File Queue, Async via Response File):
- `create_prompt` - Add prompt with emoji/color/folder
- `update_prompt` - Modify any prompt fields
- `delete_prompt` - Remove prompt
- `create_folder` - Add folder with emoji/color
- `update_folder` - Modify folder
- `delete_folder` - Remove folder (recursive option)

### Error Surface (User-Facing)

All errors follow this contract:

```typescript
interface ToolResponse {
  status: "success" | "error";
  error?: string;              // Error code (e.g., "FOLDER_NOT_FOUND")
  message: string;             // Human-readable message
  id?: string;                 // For successful writes
}
```

**Error Message Guidelines**:
- ✅ "Folder 'Security' not found in database"
- ❌ "Error in query execution: TypeError at line 42"
- ✅ "Content exceeds 100KB limit (actual: 105KB)"
- ❌ "JSON parse error"
- ✅ "Emoji must be 1-2 characters (got: '🎉🎊⭐')"
- ❌ "Invalid field type"

---

## Code Quality Standards

### TypeScript Rigor

**Mandatory**:
- Strict mode ON (`"strict": true` in tsconfig.json)
- No `any` types (use `unknown` with guards)
- All function parameters typed
- All return types specified
- Exported types documented

**Pattern**:
```typescript
// ✅ GOOD
async function getPrompt(id: string): Promise<Prompt | null> {
  if (!isValidUUID(id)) {
    throw new ValidationError("Invalid prompt ID");
  }
  return await reader.getPrompt(id);
}

// ❌ BAD
async function getPrompt(id) {
  return await reader.getPrompt(id);
}

// ❌ BAD
async function getPrompt(id: any): any {
  return await reader.getPrompt(id);
}
```

### Error Handling (Mandatory)

**Every error must be**:
1. Logged with context (not silent)
2. Wrapped in appropriate error type
3. Propagated or handled explicitly
4. Tested for that specific case

**Pattern**:
```typescript
// ✅ GOOD - Explicit, logged, testable
try {
  await operation();
} catch (error) {
  logger.error('Operation failed', {
    operation: 'create_prompt',
    folderId: id,
    error: error instanceof Error ? error.message : String(error),
  });
  throw new OperationError('Create prompt failed', { cause: error });
}

// ❌ BAD - Silent failure
try {
  await operation();
} catch {}

// ❌ BAD - Unlogged
throw error;
```

### Input Validation

**Validate at Entry Point**:
```typescript
export async function createPrompt(input: unknown): Promise<Response> {
  // 1. Validate schema
  const validated = createPromptSchema.parse(input);

  // 2. Validate business logic
  if (!await folderExists(validated.folderId)) {
    return { status: 'error', error: 'FOLDER_NOT_FOUND', ... };
  }

  // 3. Execute
  return await executeCreate(validated);
}
```

**Never trust**:
- User input (validate all)
- File contents (validate all)
- Environment variables (validate or use defaults)
- Database results (validate schema on read)

### Function Size & Complexity

**Guidelines**:
- < 40 lines per function (split if larger)
- < 3 levels of nesting (refactor if deeper)
- 1 responsibility per function
- Clear input → output

```typescript
// ✅ GOOD - 12 lines, single responsibility
async function findPromptsByFolder(folderId: string): Promise<Prompt[]> {
  if (!isValidUUID(folderId)) {
    throw new ValidationError('Invalid folder ID');
  }
  return await db.query(
    'SELECT * FROM prompts WHERE folder_id = ?',
    [folderId]
  );
}

// ❌ BAD - 60 lines, multiple responsibilities
async function getAndProcessAndValidate(folderId) {
  // ... lots of logic
}
```

---

## Safety & Security

### Path Validation (Mandatory)

**On startup**:
```typescript
function validatePaths(dbPath: string, queuePath: string): void {
  // 1. Must exist
  if (!fs.existsSync(dbPath)) throw new ConfigError('DB not found');
  if (!fs.existsSync(queuePath)) fs.mkdirSync(queuePath, { recursive: true });

  // 2. Not symlinks
  const dbStats = fs.lstatSync(dbPath);
  if (dbStats.isSymbolicLink()) throw new ConfigError('DB is symlink');

  // 3. No path traversal
  const resolvedQueue = path.resolve(queuePath);
  const baseDir = path.resolve(os.homedir(), '.../prompteka');
  if (!resolvedQueue.startsWith(baseDir)) throw new ConfigError('Invalid queue path');

  // 4. Correct permissions
  const stats = fs.statSync(queuePath);
  if ((stats.mode & 0o077) !== 0) {
    fs.chmodSync(queuePath, 0o700);
  }
}
```

**On every file write**:
```typescript
async function writeQueueOperation(op: Operation): Promise<void> {
  // 1. Atomic: temp file + rename
  const tempPath = `${queuePath}/.${op.id}.tmp`;
  await fs.promises.writeFile(tempPath, JSON.stringify(op));

  // 2. Rename to final location (atomic on POSIX)
  await fs.promises.rename(tempPath, `${queuePath}/${op.id}.json`);

  // 3. Set permissions
  await fs.promises.chmod(`${queuePath}/${op.id}.json`, 0o600);
}
```

### Input Validation (Mandatory)

**Before writing queue**:
```typescript
interface ValidationResult {
  valid: boolean;
  error?: string;
}

function validateCreatePromptInput(input: unknown): ValidationResult {
  // 1. Type check
  if (typeof input !== 'object' || !input) {
    return { valid: false, error: 'Input must be object' };
  }

  // 2. Required fields
  const { title, content, folderId, emoji, color } = input as any;
  if (!title || typeof title !== 'string' || title.trim().length === 0) {
    return { valid: false, error: 'Title required and must not be empty' };
  }

  // 3. Field constraints
  if (title.length > 255) {
    return { valid: false, error: 'Title exceeds 255 chars' };
  }
  if (content.length > 100000) {
    return { valid: false, error: 'Content exceeds 100KB' };
  }

  // 4. Emoji validation (1-2 characters)
  if (emoji && typeof emoji === 'string' && emoji.length > 2) {
    return { valid: false, error: 'Emoji must be 1-2 characters' };
  }

  // 5. Color validation (known list only)
  if (color && !['red', 'orange', 'yellow', 'green', 'blue', 'purple'].includes(color)) {
    return { valid: false, error: 'Unknown color' };
  }

  // 6. UUID validation (if provided)
  if (folderId && !isValidUUID(folderId)) {
    return { valid: false, error: 'Invalid folder ID' };
  }

  return { valid: true };
}
```

### PII & Logging Safety

**Never Log**:
- Full prompt content
- Email addresses or URLs
- User names (just IDs)
- Passwords or secrets

**Do Log**:
- Operation name and ID
- Field lengths (not content)
- Error codes (not messages with data)
- Latency and status

```typescript
// ✅ GOOD - No PII, useful for debugging
logger.info('Prompt created', {
  tool: 'create_prompt',
  requestId: req.id,
  operationId: op.id,
  durationMs: elapsed,
  titleLength: title.length,
  contentLength: content.length,
  folderId: folder.id,
  status: 'success',
});

// ❌ BAD - Contains PII
logger.info('Created prompt', {
  title: 'Secret API keys',
  content: 'API_KEY=sk-1234567890',
  user: 'robert@example.com',
});
```

---

## Observability & Logging

### Structured Logging (Mandatory)

Every operation logs JSON with these fields:

```typescript
interface LogEntry {
  timestamp: string;        // ISO 8601 with millis
  level: 'debug'|'info'|'warn'|'error';
  tool: string;            // 'create_prompt', etc.
  requestId?: string;      // From MCP
  operationId?: string;    // UUID for queue ops
  durationMs: number;      // Elapsed time
  status: 'success'|'error';
  error?: string;          // Error code
  message?: string;        // Context or user message
  metadata?: {
    itemCount?: number;
    resultSize?: number;   // In bytes
    folderId?: string;
    cached?: boolean;
  };
}
```

**Log Levels**:
- **debug**: Full payloads, all function calls (dev only)
- **info**: Tool start/end, result counts, latency
- **warn**: Timeouts, retries, degradation
- **error**: Failures, validation errors

### Metrics (Optional v1.1)

Track operational health:
```typescript
interface Metrics {
  operationCount: { [tool: string]: number };
  errorCount: { [code: string]: number };
  latency: { [tool: string]: number[] };  // Percentiles
  uptime: number;                          // Seconds
}
```

---

## Testing Requirements

### Pre-Ship Checklist

Before ANY commit/PR:

**Code**:
- [ ] Compiles without errors (tsc)
- [ ] No TypeScript warnings (strict mode)
- [ ] No eslint violations
- [ ] No console.log or debugger statements
- [ ] No commented-out code

**Tests**:
- [ ] Contract tests: input/output schemas validated
- [ ] Happy path: each tool works end-to-end
- [ ] Error cases: all error codes triggered and tested
- [ ] Path validation: symlinks rejected, traversal blocked
- [ ] Queue lifecycle: write → wait → response → cleanup
- [ ] Concurrent: multiple writes handled safely
- [ ] Permissions: queue directory 0700 enforced

**Security**:
- [ ] No hardcoded paths
- [ ] No unvalidated input in file paths
- [ ] No SQL injection surface (using prepared statements)
- [ ] No PII in logs

**Documentation**:
- [ ] All exported functions have JSDoc
- [ ] Error codes documented in taxonomy
- [ ] Tool descriptions match PRD
- [ ] Configuration documented

### Test Organization

```
tests/
├── unit/
│   ├── validators.test.ts     # Input validation
│   ├── database-reader.test.ts # DB queries
│   └── queue-writer.test.ts   # File operations
├── integration/
│   ├── tools.test.ts          # Tool contracts
│   ├── error-handling.test.ts # Error paths
│   └── queue-lifecycle.test.ts # Full write flow
└── fixtures/
    ├── sample-db.sql         # Test DB schema
    └── sample-prompts.json   # Test data
```

---

## Banned Patterns

**These are NOT allowed**:

```typescript
// ❌ any types
const data: any = parseInput();

// ❌ Silent catches
try {
  await operation();
} catch {}

// ❌ console.log
console.log('debug:', value);

// ❌ Magic numbers
setTimeout(() => {}, 5000);  // What does 5000 mean?

// ❌ Global state
let globalCache = {};

// ❌ Commented code
// const oldLogic = () => { ... };

// ❌ Unclear names
function fn(x, y) { return x + y; }

// ❌ Clever shortcuts
const active = !!(user && user.active === true);  // Just: !!user?.active

// ❌ No error handling
await database.query(sql);

// ❌ Hardcoded paths
const dbPath = '/Users/robert/...';

// ❌ Unvalidated input in file operations
fs.writeFileSync(path + userInput, data);
```

---

## Naming Conventions

| Style | Usage | Examples |
|-------|-------|----------|
| `camelCase` | Variables, functions | `promptCount`, `createPrompt()` |
| `PascalCase` | Types, classes, interfaces | `Prompt`, `DatabaseReader` |
| `UPPER_SNAKE` | Constants | `DEFAULT_TIMEOUT`, `MAX_PAYLOAD_SIZE` |
| `kebab-case` | Files, directories | `database-reader.ts`, `mcp-tools.ts` |

**Good Names**:
- `createPrompt` - verb + noun, clear action
- `folderNotFound` - error case clear
- `validateInput` - obvious responsibility
- `queueWriter` - class purpose evident

**Bad Names**:
- `process` - too generic
- `temp` - unclear purpose
- `x`, `data` - meaningless
- `helper` - not a responsibility

---

## File Organization

**Max file sizes**:
- Source: < 200 lines
- Tests: < 300 lines

**If file exceeds limit**: Split by responsibility.

```
TOO BIG:
tools.ts (500 lines)
  - Read tool implementations
  - Write tool implementations
  - Validation logic
  - Response formatting

GOOD:
tools/
├── read-tools.ts (150 lines)
├── write-tools.ts (200 lines)
└── response.ts (80 lines)
```

---

## Success Metrics

Code is production-ready when:

1. ✅ **Works** - Tested, verified, no guessing
2. ✅ **Safe** - Path validation, input validation, explicit errors
3. ✅ **Maintainable** - Anyone can understand in 5 minutes
4. ✅ **Observable** - Structured logs, clear error codes
5. ✅ **Efficient** - No wasted resources, no bugs
6. ✅ **Consistent** - Same patterns everywhere
7. ✅ **Documented** - Why, not just what

---

## References

- SOLID Principles: https://en.wikipedia.org/wiki/SOLID
- Effective TypeScript: https://effectivetypescript.com/
- Clean Code: Robert C. Martin
- MCP Specification: https://modelcontextprotocol.io/

---

**Remember**: This is a tool for managing prompts. Get the basics right:
1. Read data safely ✓
2. Write data safely ✓
3. Communicate errors clearly ✓
4. Make debugging easy ✓

Everything else is noise.
