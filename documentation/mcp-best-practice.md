# Prompteka MCP Server - Senior Level Best Practices

> **Golden Rule**: "Should work" ≠ "does work". Assume nothing. Test everything.

This document defines the non-negotiable standards for the Prompteka MCP server implementation. These practices ensure the server is maintainable, scalable, and production-ready.

## Architecture Principles

### 1. SOLID Principles (Enforced)

**Single Responsibility** - Each module has ONE reason to change
- `DatabaseReader` - Only reads from database
- `QueueWriter` - Only writes JSON files to queue
- `MCPTools` - Only bridges between MCP protocol and readers/writers
- No mixing concerns (no reader that also writes, no writer that also queries)

**Open/Closed** - Open for extension, closed for modification
- New MCP tools added without modifying existing ones
- New database operations added without changing reader interface
- Use interfaces/traits, not concrete implementations

**Liskov Substitution** - Implementations must be substitutable
- All database readers implement same interface
- All operation types follow same pattern
- Error handling consistent across boundaries

**Interface Segregation** - Small, focused interfaces
- DatabaseReader interface only has read methods
- QueueWriter interface only has write methods
- MCPTools only expose what they need

**Dependency Inversion** - Depend on abstractions, not concretions
- MCP tools depend on DatabaseReader trait, not specific implementation
- Database path injected, not hardcoded
- Easy to swap implementations for testing

### 2. DRY (Don't Repeat Yourself)

**File Layout**:
```
src/
  core/
    reader.ts       # DatabaseReader implementation
    writer.ts       # QueueWriter implementation
    types.ts        # Shared types (Operation, Response, etc.)
  tools/
    index.ts        # Tool registration and routing
    read.ts         # Read-only tools (list, get, search)
    write.ts        # Write tools (create, update, delete)
  server.ts         # MCP server setup and initialization
```

**No Code Duplication**:
- Validation logic shared, not duplicated across tools
- Error responses follow standard format everywhere
- File operations use shared utilities
- Database queries use shared reader interface

### 3. YAGNI (You Aren't Gonna Need It)

**What we implement**:
- ✅ Read-only tools (Phase 1)
- ✅ Write tools via queue (Phase 2)
- ✅ Error handling for real scenarios
- ✅ Response validation

**What we DON'T implement** (it's not needed):
- ❌ Caching layer (databases are fast enough)
- ❌ GraphQL, REST API, or multiple interfaces
- ❌ Bulk operations beyond what MCP allows
- ❌ Change notifications (files exist for that)
- ❌ Transaction support (import queue handles that)
- ❌ Clustering or distributed features
- ❌ Configuration files or settings (environment variables only)

### 4. KISS (Keep It Simple, Stupid)

**Complexity indicators** (red flags):
- If explanation takes more than 3 sentences, too complex
- If function is more than 40 lines, needs splitting
- If conditional nesting > 3 levels, refactor
- If type signature is hard to read, simplify

**Simple patterns**:
- Linear execution flow (no clever async tricks)
- Explicit error handling (no silent failures)
- Clear naming (function names describe action, not implementation)
- Small files (< 200 lines each)

## Code Quality Standards

### Error Handling (Mandatory)

**Every error must be**:
1. Logged with context
2. Wrapped in appropriate error type
3. Propagated or handled explicitly
4. Tested for that specific case

**NO Silent Failures**:
```typescript
// ❌ WRONG - Silent error
try {
  await operation();
} catch {}

// ✅ RIGHT - Handle explicitly
try {
  await operation();
} catch (error) {
  logger.error('Operation failed', { error, context });
  throw new OperationError('Create prompt failed', { cause: error });
}
```

### Type Safety (Enforced)

- TypeScript strict mode ON
- No `any` types (use `unknown` with guards)
- All function parameters and returns typed
- Exported types documented

### Testing (Before Shipping)

**Minimum testing**:
- Happy path works
- Each error condition tested
- File system operations verified
- Response format validated

**What needs tests**:
- Reader queries against real database
- Writer file operations
- Tool parameter validation
- Error cases

**What doesn't need tests**:
- Framework code (MCP SDK, Node.js)
- Trivial getters/setters
- Pure configuration

### Logging (Production Ready)

**Log these events**:
- MCP server startup/shutdown
- Tool invocations (with input params sanitized)
- Database queries (count, type, duration)
- File operations (path, action, result)
- Errors (with full context)

**Don't log**:
- Every line of execution
- User prompt content (too much data)
- Sensitive paths or configs

## Performance Standards

### Database Access

- Direct SQLite connection (read-only)
- Single connection, reused
- Query results processed in memory
- No pagination needed (dataset is small)

### File Operations

- Atomic writes only (write to temp, rename)
- No unnecessary re-reads
- Directories pre-created on startup
- Response files kept minimal

### Memory

- Loaded entire database fits in RAM (< 100MB)
- No streaming or chunking needed
- No unnecessary object copies

## Documentation Standards

### Code Comments

Only when:
- ❌ "What" is unclear (use better names instead)
- ✅ "Why" is non-obvious (business logic, edge cases)
- ✅ Complex algorithms (with references/explanations)

**Bad comment**:
```typescript
// get user by id
const user = getUser(id);
```

**Good comment**:
```typescript
// Wait for response file with 5s timeout
// MCP server writes here; we poll until present or timeout
const response = await waitForResponse(opId);
```

### Function Documentation

Every exported function has JSDoc:
```typescript
/**
 * List all prompts, optionally filtered by folder
 * @param folderId - Optional folder ID to filter by
 * @returns Promise resolving to array of prompts
 * @throws {DatabaseError} If database query fails
 */
export async function listPrompts(folderId?: number): Promise<Prompt[]>
```

## Operational Standards

### Configuration

- No config files
- Environment variables only
- Sensible defaults for everything
- Documented in README

### Logging

- Use standard logger (not console.log)
- Structured logging where possible
- Appropriate log levels (info, warn, error)

### Error Messages

- Clear and actionable
- Include context (file path, operation type, etc.)
- Suggest resolution if possible

## Testing Checklist

Before any pull request/commit:

- [ ] Code compiles without errors
- [ ] No TypeScript warnings or any types
- [ ] All functions have JSDoc
- [ ] Error cases tested manually
- [ ] Database reads verified
- [ ] File operations verified
- [ ] Happy path tested end-to-end
- [ ] No console.log or debug code
- [ ] No commented-out code
- [ ] File sizes reasonable (< 200 lines each)

## Banned Patterns

**These are not allowed**:

```typescript
// ❌ any types
const data: any = response;

// ❌ silent catches
try { ... } catch {}

// ❌ console.log
console.log('debug:', value);

// ❌ magic numbers
const timeout = 5000; // ← BAD: what does 5000 mean?

// ❌ global state
let globalCache = {};

// ❌ commented code
// const old_code = () => { ... };

// ❌ unnecessary complexity
const value = !!(user && user.active === true);  // just: !!user?.active

// ❌ clever code instead of clear code
// DON'T: tricks that make you feel smart
// DO: code that makes readers understand instantly
```

## Naming Conventions

**Variables & Functions**: camelCase
```typescript
const promptCount = 5;
function listPrompts() {}
```

**Types & Classes**: PascalCase
```typescript
interface Prompt {}
class DatabaseReader {}
```

**Constants**: UPPER_SNAKE_CASE
```typescript
const DEFAULT_TIMEOUT = 5000;
```

**Files**: kebab-case with clear purpose
```typescript
database-reader.ts      // not: DBReader.ts or databaseReader.ts
mcp-tools.ts            // not: tools.ts (too generic)
operation-types.ts      // not: types.ts (too generic)
```

## Metrics of Success

The code is good when:

1. ✅ **Works** - Tested and verified
2. ✅ **Maintainable** - Anyone can understand in 5 minutes
3. ✅ **Efficient** - No wasted resources
4. ✅ **Safe** - Explicit error handling
5. ✅ **Documented** - Clear why, not just what
6. ✅ **Consistent** - Follows patterns everywhere
7. ✅ **Focused** - Does ONE thing well

## References

- SOLID Principles: https://en.wikipedia.org/wiki/SOLID
- Effective TypeScript: https://effectivetypescript.com/
- Clean Code practices: Robert C. Martin

---

**Remember**: This is a tool that helps people manage prompts for AI. Get the basics right. Make it work. Make it clear. Keep it simple. Everything else is noise.
