# Prompteka MCP Server

**Model Context Protocol server for Prompteka** - enables AI assistants to read and write your prompt library.

Connect any MCP-compatible AI assistant to access and manage your Prompteka prompts programmatically.

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

## How It Works

### Architecture Overview

The Prompteka MCP Server operates in two modes:

**Read Operations** (Fast, Direct Database Access)
- Connects directly to your Prompteka SQLite database
- Uses WAL (Write-Ahead Logging) mode for safe concurrent access
- Returns results in < 100ms
- Does NOT interfere with Prompteka app operations

**Write Operations** (Safe, Async Queue)
- Creates JSON operation files in the Prompteka import queue
- Prompteka app watches this folder and processes operations
- Changes appear in Prompteka app within 1-2 seconds
- Fully validated and atomic

This two-mechanism approach ensures:
- ✅ No database lock conflicts
- ✅ App Store sandbox compliance
- ✅ Real-time UI updates in Prompteka
- ✅ Safe automatic recovery on crashes

### Database Location

Prompteka stores its data at:
```
~/Library/Application Support/prompteka/prompts.db
```

The MCP server accesses this file to read your prompts and folders.

### Queue Operations

When you use write tools (create_prompt, update_prompt, etc.), here's what happens:

1. MCP server creates a JSON file in:
   ```
   ~/Library/Application Support/prompteka/import-queue/{uuid}.json
   ```

2. Prompteka app detects the file and processes it

3. After validation, Prompteka writes a response:
   ```
   ~/Library/Application Support/prompteka/import-queue/.response-{uuid}.json
   ```

4. MCP server reads the response and returns it to you

5. Response file is automatically cleaned up

This all happens in 200-500ms, completely transparent to you.

---

## Quick Reference: All Tools

| Tool | Type | Description |
|------|------|-------------|
| `list_folders` | Read | Get all folders with metadata |
| `list_prompts` | Read | Get prompts from folder (paginated) |
| `get_prompt` | Read | Get single prompt by ID |
| `search_prompts` | Read | Full-text search across prompts |
| `create_prompt` | Write | Create new prompt in folder |
| `update_prompt` | Write | Modify existing prompt |
| `delete_prompt` | Write | Delete prompt (idempotent) |
| `create_folder` | Write | Create new folder |
| `update_folder` | Write | Modify folder properties |
| `delete_folder` | Write | Delete folder with safety checks |
| `move_prompt` | Write | Move prompt to different folder |
| `export_prompts` | Write | Export to JSON/CSV/Markdown |
| `backup_prompts` | Write | Export entire library as ZIP |
| `restore_prompts` | Write | Import library from backup |

**Response Times:**
- Read tools: < 100ms (direct database)
- Write tools: 200-500ms (queued, validated)

**All operations are logged** with detailed status, errors, and timing information.

---

## Installation

### Prerequisites

- **Prompteka app** installed and has been opened at least once
- **Node.js** 18.0.0 or newer
- **npm** 9.0.0 or newer

Check your versions:
```bash
node --version   # Should be 18.0.0 or higher
npm --version    # Should be 9.0.0 or higher
```

### Step 1: Install Prompteka MCP Server

**Option A: From npm (once published)**

```bash
npm install -g prompteka-mcp
```

**Option B: From source (development)**

```bash
# Clone the repository
git clone https://github.com/webdevguyrg/prompteka-mcp.git
cd prompteka-mcp

# Install dependencies
npm install

# Build TypeScript to JavaScript
npm run build

# Install globally on your system
npm install -g .

# Verify installation
prompteka-mcp --version
```

### Step 2: Configure Your MCP Client

The MCP server is now installed. Next, configure your MCP-compatible AI tool to use it.

**For MCP Desktop/CLI Tools:**

Locate your MCP configuration file:
- Common locations: `~/.config/mcp/config.json` or `~/.mcp/config.json`
- Tool-specific: Check your tool's documentation

Add this configuration:

```json
{
  "mcpServers": {
    "prompteka": {
      "command": "prompteka-mcp",
      "args": [],
      "env": {
        "LOG_LEVEL": "info"
      }
    }
  }
}
```

Then restart your MCP client.

### Step 3: Verify Installation

Test the connection:

```bash
# MCP client should now show Prompteka tools available
# Try running: list_folders
# Should return your Prompteka folders without errors
```

---

## Advanced Configuration

### Custom Database Path

If Prompteka is installed in a non-standard location:

```bash
export PROMPTEKA_DB_PATH="/custom/path/prompts.db"
prompteka-mcp
```

Or in your MCP config:

```json
{
  "mcpServers": {
    "prompteka": {
      "command": "prompteka-mcp",
      "env": {
        "PROMPTEKA_DB_PATH": "/custom/path/prompts.db"
      }
    }
  }
}
```

### Custom Queue Path

If you need a different import queue location:

```json
{
  "mcpServers": {
    "prompteka": {
      "command": "prompteka-mcp",
      "env": {
        "PROMPTEKA_QUEUE_PATH": "/custom/path/import-queue"
      }
    }
  }
}
```

### Logging Level

Control verbosity:

```json
{
  "mcpServers": {
    "prompteka": {
      "command": "prompteka-mcp",
      "env": {
        "LOG_LEVEL": "debug"  # or: info, warn, error
      }
    }
  }
}
```

Log output appears in your MCP tool's console.

---

## Available Tools (14 Total)

### Read-Only Tools (Immediate)

**`list_folders`**
Get all your folders with hierarchy and metadata.

**`list_prompts`**
Get prompts from a specific folder with pagination.

**`get_prompt`**
Get full details of a single prompt by ID.

**`search_prompts`**
Full-text search across all prompt titles and content.

### Write Tools (Async, Via Queue)

**`create_prompt`**
Create a new prompt in a folder with emoji, color, and optional URL.

**`update_prompt`**
Modify an existing prompt (title, content, folder, emoji, color, URL).

**`delete_prompt`**
Delete a prompt.

**`create_folder`**
Create a new folder with optional emoji and color.

**`update_folder`**
Rename or reorganize a folder.

**`delete_folder`**
Delete a folder (with safety checks to prevent accidental data loss).

### Organization & Export Tools

**`move_prompt`**
Move a prompt to a different folder.
- Move single prompt to new folder
- Target can be any folder (or null for root)
- Updates folder references automatically

**`export_prompts`**
Export prompts to various formats.
- Formats: JSON (full data), CSV (tabular), Markdown (formatted)
- Optional: Export entire library or just one folder
- Includes metadata and folder structure

### Data Management & Backup Tools

**`backup_prompts`**
Export your entire prompt library as a ZIP file.
- Includes all prompts, folders, and metadata
- Compressed for easy backup/sharing
- Can be used to migrate between systems

**`restore_prompts`**
Import a previously exported prompt library from a backup file.
- Merges with existing library (doesn't overwrite by default)
- Option to overwrite conflicting prompts
- Full validation before import

## Response Times

- **Read operations**: < 100ms (direct database)
- **Write operations**: 200-500ms (queued, validated by Prompteka)

## Use Cases

### UC1: Capture Prompts Quickly

An MCP client can automatically save generated prompts directly to your Prompteka library without manual copy-paste.

### UC2: Organize Your Library

MCP clients can help organize and reorganize your prompt library, move prompts between folders, and apply consistent tagging.

### UC3: Audit Your Prompts

Analyze your prompt library - count prompts by color, folder, age; identify unused prompts; find duplicates.

### UC4: Clone & Customize

Create variations of existing prompts with MCP integration - modify content, category, metadata in one operation.

### UC5: Backup & Migrate

Export your entire library for backup purposes or migrate between systems/devices.

### UC6: Batch Operations

Perform bulk changes - update colors, reorganize folders, or apply metadata to multiple prompts at once.

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
│   AI    │ (MCP-compatible assistant)
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
