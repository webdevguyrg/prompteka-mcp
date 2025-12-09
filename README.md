# Prompteka MCP Server

**Model Context Protocol server for Prompteka** - enables AI assistants to read and write your prompt library.

Connect any MCP-compatible AI tool (Claude, Claude Code, Claude Desktop) to access and manage your Prompteka prompts programmatically.

## Features

✅ **Read Your Prompts**
List, search, and retrieve all your prompts and folders with full content.

✅ **Create & Organize**
Create new prompts in specific folders with emojis, colors, and links.

✅ **Update & Delete**
Modify existing prompts or organize your library through AI.

✅ **Safe & Local-Only**
Operates entirely locally in `~/Library/Application Support/prompteka/`.
No network calls, no telemetry, no data sent anywhere.

✅ **App Store Compliant**
Works with macOS Prompteka app via safe file-based import queue.

## Quick Start

### Installation

```bash
npm install -g prompteka-mcp
```

Or install from source:

```bash
git clone https://github.com/webdevguyrg/prompteka-mcp.git
cd prompteka-mcp
npm install
npm run build
npm install -g .
```

### Configuration in Claude Desktop

Edit `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "prompteka": {
      "command": "prompteka-mcp",
      "args": []
    }
  }
}
```

Restart Claude Desktop. The Prompteka MCP tools will be available.

### Configuration in Claude Code

Prompteka MCP is configured as an MCP server. Add to your Claude Code workspace:

```bash
# In Claude Code settings
claude code install prompteka-mcp
```

### Configuration with Environment Variables

Override default paths:

```bash
export PROMPTEKA_DB_PATH="/custom/path/prompts.db"
export PROMPTEKA_QUEUE_PATH="/custom/path/import-queue"
export LOG_LEVEL="debug"  # or info, warn, error

prompteka-mcp
```

Or create `.env` file in project root:

```
PROMPTEKA_DB_PATH=/custom/path/prompts.db
LOG_LEVEL=info
```

## Available Tools

### Read-Only Tools (Immediate)

**`list_folders`**
Get all your folders with hierarchy and metadata.

```
User: "How many folders do I have?"
AI: list_folders() → [Engineering, Security, Testing, ...]
```

**`list_prompts`**
Get prompts from a specific folder with pagination.

```
User: "Show me all prompts in my Engineering folder"
AI: list_prompts(folderId: "...", limit: 100)
```

**`get_prompt`**
Get full details of a single prompt by ID.

```
User: "Show me my API review prompt"
AI: get_prompt(id: "...")
```

**`search_prompts`**
Full-text search across all prompt titles and content.

```
User: "Find all my security-related prompts"
AI: search_prompts(query: "security") → [3 matching prompts]
```

### Write Tools (Async, Via Queue)

**`create_prompt`**
Create a new prompt in a folder.

```
User: "Save this as a new prompt in my Engineering folder"
AI: create_prompt(
  title: "API Request Validation",
  content: "...",
  folderId: "...",
  emoji: "📋",
  color: "blue"
)
→ Prompt appears in Prompteka within 1 second
```

**`update_prompt`**
Modify an existing prompt.

```
User: "Change the color of my API review to red"
AI: update_prompt(id: "...", color: "red")
```

**`delete_prompt`**
Delete a prompt.

```
User: "Delete the old version of my prompt"
AI: delete_prompt(id: "...")
```

**`create_folder`**
Create a new folder.

```
User: "Create a folder called 'Experiments'"
AI: create_folder(name: "Experiments", emoji: "🧪", color: "purple")
```

**`update_folder`**
Rename or reorganize a folder.

```
User: "Rename my QA folder to Testing"
AI: update_folder(id: "...", name: "Testing")
```

**`delete_folder`**
Delete a folder (with safety checks).

```
User: "Delete my empty archive folder"
AI: delete_folder(id: "...")
```

## Response Times

- **Read operations**: < 100ms (direct database)
- **Write operations**: 200-500ms (queued, validated by Prompteka)

## Use Cases

### UC1: Capture Prompts Quickly

```
User: "Save this prompt to my Engineering folder"
AI: Creates prompt, you see it in Prompteka immediately
```

### UC2: Organize Your Library

```
User: "Move all my testing prompts to the QA folder"
AI: Searches for testing prompts, moves them one by one
```

### UC3: Audit Your Prompts

```
User: "How many prompts do I have by color?"
AI: Lists all folders → lists prompts in each → counts by color
```

### UC4: Clone & Customize

```
User: "Make a REST API version of my API review prompt"
AI: Gets original, creates new one with modified content
```

## Security & Privacy

### Network & Data

- **Strictly local-only**: No network calls whatsoever
- **No telemetry**: No analytics, no error reporting
- **Your data stays yours**: All operations within `~/Library/Application Support/prompteka/`
- **No copies**: Prompt data never leaves your machine
- **Sandbox-safe**: Works within macOS sandbox restrictions

### Validation & Safety

- All inputs validated before writing
- Symlinks rejected (path traversal protection)
- File permissions: 0600 (user-only)
- Idempotent writes (safe to retry)

### Logging

Logs are structured JSON (no PII):

```json
{
  "timestamp": "2025-12-09T10:30:45.123Z",
  "tool": "create_prompt",
  "operationId": "...",
  "durationMs": 145,
  "status": "success"
}
```

- Prompt content: Never logged (only length tracked)
- Emails/URLs: Redacted
- Debug logs available with `LOG_LEVEL=debug`

## Troubleshooting

### "Queue directory not found"

Ensure Prompteka is installed and has been opened at least once:

```bash
open /Applications/Prompteka.app
```

Check the path:

```bash
ls -la ~/Library/Application\ Support/prompteka/
```

### "Timeout waiting for response"

Check Prompteka app is running:

```bash
pgrep -l prompteka
```

Check queue for stuck files:

```bash
ls -la ~/Library/Application\ Support/prompteka/import-queue/
```

Clean up orphaned files:

```bash
rm ~/Library/Application\ Support/prompteka/import-queue/.response-*
```

Retry the operation.

### "Permission denied"

Check queue directory permissions:

```bash
ls -ld ~/Library/Application\ Support/prompteka/import-queue/
```

Should be: `drwx------` (0700). Fix with:

```bash
chmod 700 ~/Library/Application\ Support/prompteka/import-queue/
```

### "Database locked"

Transient error. MCP will retry automatically.
If persists, close Prompteka app and try again.

## API Reference

See [`documentation/PRD.md`](./documentation/PRD.md) for complete API specification including:

- Tool schemas and validation rules
- Error taxonomy with recovery strategies
- Queue operation lifecycle
- Concurrency & limits policy
- Testing strategy

## Development

### Building from Source

```bash
npm install
npm run build
npm run type-check
npm test
```

### Development Mode

```bash
npm run dev
```

### Code Quality

```bash
npm run lint
npm run test:coverage
```

## Architecture

The MCP server uses a **read-direct, write-queue** pattern:

```
┌─────────┐
│   AI    │ (Claude, Claude Code, etc.)
└────┬────┘
     │ MCP Protocol
     ▼
┌─────────────────────────┐
│  Prompteka MCP Server   │
├─────────────────────────┤
│ Read Operations:        │ (Direct DB access)
│ ├─ list_folders         │ < 100ms
│ ├─ list_prompts         │
│ ├─ get_prompt           │
│ └─ search_prompts       │
│                         │
│ Write Operations:       │ (File-based queue)
│ ├─ create_prompt        │ 200-500ms
│ ├─ update_prompt        │ (validated by Prompteka)
│ ├─ delete_prompt        │
│ ├─ create_folder        │
│ ├─ update_folder        │
│ └─ delete_folder        │
└────┬──────────────────┬─┘
     │ Direct Read      │ Queued Write
     │ (WAL mode)       │ (Safe)
     ▼                  ▼
┌──────────────────────────────────────┐
│ Prompteka App                        │
├──────────────────────────────────────┤
│ SQLite Database (WAL)                │
│ Import Queue Watcher                 │
│ Validation & Persistence             │
└──────────────────────────────────────┘
```

## Minimum Requirements

| Requirement | Version | Notes |
| --- | --- | --- |
| macOS | 12.0+ (Monterey) | Prompteka requirement |
| Node.js | 18.0.0+ | LTS, ESM support |
| npm | 9.0.0+ | Bundled with Node 18+ |
| Prompteka | 1.6.2+ | WAL mode support |

## Contributing

This is a public project. Contributions welcome!

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-thing`)
3. Commit changes with clear messages
4. Push to branch (`git push origin feature/amazing-thing`)
5. Open a Pull Request

## License

MIT - See LICENSE file for details

## Support

- **Documentation**: See `documentation/PRD.md`
- **Issues**: GitHub Issues
- **Prompteka Support**: https://prompteka.net/support.html

## Privacy Policy

The Prompteka MCP Server is local-only and does not collect any data. For Prompteka app privacy details, see: https://prompteka.net/privacy-policy.html

---

**Made with ❤️ for Prompteka users**

Questions? Open an issue on GitHub.
