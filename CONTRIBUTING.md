# Contributing to Prompteka MCP Server

Thank you for your interest in contributing! This document provides guidelines and instructions for developers.

## Development Setup

### Prerequisites

- Node.js 18.0.0 or newer
- npm 9.0.0 or newer
- Prompteka app installed locally

### Installation

```bash
git clone https://github.com/webdevguyrg/prompteka-mcp.git
cd prompteka-mcp
npm install
```

### Building

```bash
npm run build
```

Compiles TypeScript to JavaScript in the `dist/` folder.

### Development Mode

```bash
npm run dev
```

Runs the server directly with ts-node, useful for testing changes without rebuilding.

### Testing

```bash
npm test              # Run all tests
npm run test:watch   # Watch mode
npm run test:coverage # Coverage report
```

### Code Quality

```bash
npm run lint          # Check code style
npm run type-check    # TypeScript type checking
```

## Project Structure

```
src/
├── core/
│   ├── database-reader.ts    # SQLite read operations
│   ├── queue-writer.ts       # Import queue handling
│   └── types.ts              # Domain types
├── tools/
│   ├── index.ts              # Tool registry
│   ├── read-tools.ts         # 4 read-only tools
│   └── write-tools.ts        # 10 write tools
├── validation/
│   ├── input-validator.ts    # Input validation
│   ├── schemas.ts            # JSON schemas
│   └── error-taxonomy.ts     # Error definitions
├── observability/
│   └── logger.ts             # Structured logging
└── server.ts                 # MCP server entry point
```

## Code Standards

### TypeScript

- Strict mode enabled (`noImplicitAny: true`)
- Full type annotations required
- No `any` types
- Exported types must be documented

### Naming Conventions

- **Files**: kebab-case (`database-reader.ts`)
- **Classes**: PascalCase (`DatabaseReader`, `ImportQueueWriter`)
- **Functions**: camelCase (`validateUUID`, `handleCreatePrompt`)
- **Constants**: UPPER_SNAKE_CASE (`ErrorCodes`, `Schemas`)
- **Interfaces**: PascalCase with optional `I` prefix (`DatabaseReader`, `IReader`)

### Coding Principles

1. **SOLID Principles** - Single responsibility, open/closed, etc.
2. **DRY** - Don't repeat yourself; share validation, errors, logging
3. **YAGNI** - You aren't gonna need it; only implement what's needed
4. **Explicit** - Clear contracts, comprehensive error handling
5. **Tested** - New features include tests

### Error Handling

All errors must use the error taxonomy:

```typescript
import { PromptekaMCPError, ErrorCodes } from "./validation/error-taxonomy.js";

// Throw with specific error code
throw new PromptekaMCPError(
  ErrorCodes.INVALID_INPUT,
  "Field 'title' is required"
);
```

### Logging

Always use structured logging:

```typescript
import { getLogger } from "./observability/logger.js";

const logger = getLogger();
const timer = logger.startTimer();

try {
  // Do work
  logger.logSuccess("tool-name", timer(), { metadata });
} catch (error) {
  logger.logError("tool-name", ErrorCode, timer(), error.message);
}
```

Never log:
- Full prompt content (log length instead)
- User email addresses
- Personal information
- API keys or secrets

### Testing

Tests follow the pattern:

```typescript
import { describe, it, expect } from "vitest";

describe("validateUUID", () => {
  it("accepts valid UUIDs", () => {
    const result = validateUUID("550e8400-e29b-41d4-a716-446655440000");
    expect(result).toBe("550e8400-e29b-41d4-a716-446655440000");
  });

  it("rejects invalid UUIDs", () => {
    expect(() => validateUUID("not-a-uuid")).toThrow();
  });
});
```

## Adding a New Tool

1. **Create the tool** in `src/tools/write-tools.ts` or `read-tools.ts`:

```typescript
export function createMyToolTool(): Tool {
  return {
    name: "my_tool",
    description: "What this tool does",
    inputSchema: { /* JSON Schema */ },
  };
}

export async function handleMyTool(input: unknown) {
  // Implementation
}
```

2. **Export** from `src/tools/index.ts`:

```typescript
export { createMyToolTool, handleMyTool } from "./write-tools.js";
```

3. **Register** in `src/server.ts`:

```typescript
tools.set("my_tool", {
  tool: createMyToolTool(),
  handler: handleMyTool,
});
```

4. **Document** in `documentation/PRD.md` with:
   - Tool description
   - Input schema
   - Response examples
   - Timeout
   - Error cases

5. **Add tests** in `tests/my-tool.test.ts`

## Pull Request Process

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Make your changes
4. Run tests: `npm test`
5. Check types: `npm run type-check`
6. Lint: `npm run lint`
7. Commit with clear message
8. Push to your fork
9. Create Pull Request with description

### PR Description Template

```markdown
## Description
What does this PR do?

## Related Issue
Fixes #(issue number)

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Documentation update
- [ ] Breaking change

## Testing
How was this tested?

## Checklist
- [ ] Code follows style guidelines
- [ ] Tests pass
- [ ] Documentation updated
- [ ] No breaking changes (or documented)
```

## Documentation

All changes should update relevant documentation:

- **Code changes**: Update docstrings and comments
- **New tools**: Update `documentation/PRD.md`
- **Configuration**: Update `README.md`
- **Architecture**: Update `documentation/mcp-best-practice.md`

## Release Process

1. Update version in `package.json`
2. Update `CHANGELOG.md` (if exists)
3. Create git tag: `git tag v1.0.0`
4. Push tag: `git push origin v1.0.0`
5. Publish to npm: `npm publish`

## Questions?

- Open an issue on GitHub
- Check existing documentation
- Review code in `src/` folder

## Code of Conduct

- Be respectful and inclusive
- Provide constructive feedback
- No harassment or discrimination
- Report issues through appropriate channels

Thank you for contributing!
