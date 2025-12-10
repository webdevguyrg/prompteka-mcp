# Prompteka MCP Server

**Model Context Protocol server for Prompteka** - enables AI assistants to read and write your prompt library.

---

## TL;DR

**What is Prompteka?**
[Prompteka](https://prompteka.net) is a native macOS app (available on the [App Store](https://apps.apple.com/app/prompteka/id6738107425)) that lets you organize, search, and manage your AI prompt library locally on your Mac. Think of it as a smart folder system for all your prompts with tagging, emojis, colors, and full-text search.

**What does this MCP Server do?**
This server enables AI assistants (like Claude in Claude Desktop or Claude Code) to directly access and manage your Prompteka library programmatically. Instead of manually copying prompts in and out, your AI assistant can:
- 📖 Read and search your entire prompt library
- ✍️ Create new prompts and organize them
- 🎨 Update existing prompts with new content
- 🗑️ Organize your library by moving prompts between folders

**How do they work together?**
```
Your Mac
├── Prompteka App (native macOS app on App Store)
│   └── SQLite Database at ~/Library/Application Support/prompteka/prompts.db
│       ↑ (reads/writes)
└── This MCP Server (Node.js process)
    └── Connects to same database via MCP protocol
        ↑ (AI assistants read/write through MCP)
```

The MCP server connects directly to your Prompteka database, so changes made by the AI show up instantly in Prompteka, and vice versa. No syncing, no copying - everything is live.

**Installation:**
1. Have [Prompteka app](https://apps.apple.com/app/prompteka/id6738107425) installed
2. `npm install -g prompteka-mcp`
3. Configure in Claude Desktop/Code with the MCP config
4. Start using: "Add this prompt to my Security folder"

---

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

✅ **Independent Operation**
Works with or without Prompteka app running. Direct database access means zero dependencies.

## How It Works

### Integration with Prompteka

The MCP server connects directly to the same SQLite database that the Prompteka app uses. This means:

- **Live Synchronization**: Changes made by the AI show up instantly in Prompteka (and vice versa)
- **No Syncing Required**: Single source of truth - the local SQLite database
- **Concurrent Safe**: Both Prompteka app and MCP server can operate simultaneously without conflicts
- **Database Agnostic**: The MCP server doesn't depend on the Prompteka app being running

### Architecture Overview

The Prompteka MCP Server operates in two modes:

**Read Operations** (Fast, Direct Database Access)
- Connects directly to your Prompteka SQLite database at `~/Library/Application Support/prompteka/prompts.db`
- Uses WAL (Write-Ahead Logging) mode for safe concurrent access with Prompteka app
- Returns results in < 100ms
- Does NOT interfere with Prompteka app operations

**Write Operations** (Instant, Direct Database Access)
- Writes directly to Prompteka SQLite database using WAL mode
- Uses atomic transactions with full ACID guarantees
- Changes committed immediately (< 10ms)
- Visible instantly to Prompteka app and other MCP clients
- SQLite handles concurrent access safely

This unified approach ensures:
- ✅ Sub-10ms response times (instant feedback)
- ✅ No app dependency - MCP server operates standalone
- ✅ Safe concurrent read-write with WAL mode
- ✅ Automatic atomic rollback on errors
- ✅ Zero orphaned operations or cleanup needed
- ✅ Live updates between app and MCP server

### Database Location

Prompteka stores its data at:
```
~/Library/Application Support/prompteka/prompts.db
```

The MCP server accesses this file to read your prompts and folders.

### Write Operations (Direct Database)

When you use write tools (create_prompt, update_prompt, etc.), here's what happens:

1. **Validation**: MCP server validates your input against JSON schemas (local, instant)

2. **Transaction**: Opens atomic SQLite transaction with implicit locking

3. **Execution**: Executes INSERT/UPDATE/DELETE operation against prompts.db

4. **Commit**: Transaction commits automatically (or rolls back if error)

5. **Response**: Returns success/error response immediately (< 10ms typical)

6. **Visibility**: Changes are immediately visible to:
   - Other MCP read operations
   - Prompteka app via SQLite WAL mechanism
   - Any other SQLite clients accessing the database

This all happens in < 10ms, completely transparent to you. No app required to be running.

---

## Quick Reference: All Tools

| Tool | Type | Description |
|------|------|-------------|
| `list_folders` | Read | Get all folders with metadata |
| `list_prompts` | Read | Get prompts from folder (paginated) |
| `get_prompt` | Read | Get single prompt by ID |
| `search_prompts` | Read | Full-text search across prompts |
| `health_check` | Read | Verify MCP server and database operational |
| `create_prompt` | Write | Create new prompt in folder |
| `update_prompt` | Write | Modify existing prompt |
| `delete_prompt` | Write | Delete prompt (idempotent) |
| `create_folder` | Write | Create new folder |
| `update_folder` | Write | Modify folder properties |
| `delete_folder` | Write | Delete folder with safety checks |
| `move_prompt` | Write | Move prompt to different folder |

**Response Times:**
- Read tools: < 100ms (direct database)
- Write tools: < 10ms (direct database, atomic transactions)

**All operations are logged** with detailed status, errors, and timing information.

---

## Installation

### Prerequisites

- **[Prompteka app](https://apps.apple.com/app/prompteka/id6738107425)** from the App Store installed on your Mac
  - (Just needs to have been opened once to create the database)
  - The app does NOT need to stay running - the MCP server accesses the database directly
- **Node.js** 18.0.0 or newer
- **npm** 9.0.0 or newer

*Note: You can have Prompteka app and this MCP server running simultaneously with zero conflicts. They share the same SQLite database safely via WAL mode.*

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

## Available Tools (12 Total)

### Read-Only Tools (5 tools, Direct Database Access)

**`list_folders`**
Get all your folders with hierarchy and metadata.

**`list_prompts`**
Get prompts from a specific folder with pagination.

**`get_prompt`**
Get full details of a single prompt by ID.

**`search_prompts`**
Full-text search across all prompt titles and content.

**`health_check`**
Verify MCP server and database are operational. Returns server version, available tools, and connectivity status.

### Write Tools (7 tools, Direct Database Access)

**`create_prompt`**
Create a new prompt in a folder with emoji, color, and optional URL.

**`update_prompt`**
Modify an existing prompt (title, content, folder, emoji, color, URL).

**`delete_prompt`**
Delete a prompt (idempotent - safe to retry).

**`create_folder`**
Create a new folder with optional emoji and color.

**`update_folder`**
Rename or reorganize a folder.

**`delete_folder`**
Delete a folder (with safety checks to prevent accidental data loss).

**`move_prompt`**
Move a prompt to a different folder.
- Move single prompt to new folder
- Target can be any folder (or null for root)
- Updates folder references automatically

## Response Times

- **Read operations**: < 100ms (direct database)
- **Write operations**: < 10ms (direct database, atomic transactions)

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

---

## Workflow Scenarios & Support Matrix

Real-world scenarios showing different states (no prompts, one prompt, multiple prompts) and whether they're currently supported:

**Legend**:
- ✨ = Create new prompt/folder(s)
- 📖 = Read/search/retrieve existing
- 🔨 = Modify/update existing
- 🗑️ = Delete
- ✅ = System check

| Scenario | User Action | Folder State | Prompt State | What Happens | Currently Supported |
|----------|-------------|--------------|--------------|--------------|---------------------|
| ✨ **Save Generated Prompt** | "Save this as 'Security Checklist' in Security folder" | Folder exists | ❌ New | Claude calls `create_prompt` with title, content, folderId | ✅ YES |
| ✨ **Save Without Folder** | "Save that as 'Quick Test'" | ❌ Must choose or create | ❌ New | Claude calls `list_folders`, user picks, then `create_prompt` | ✅ YES |
| ✨✨ **Save & Create Folder** | "Save as 'Testing' in new folder 'QA'" | ❌ Doesn't exist | ❌ New | Claude calls `create_folder`, then `create_prompt` | ✅ YES |
| 📖 **Find & Run Prompt** | "Run my code review prompt" | ✅ Single exists | ✅ Single match | Claude calls `search_prompts("code review")`, gets result, executes it | ✅ YES |
| 📖 **Ambiguous Search** | "Run code review prompt" | ✅ Exists | ✅ Multiple matches (General, Security, Performance) | Claude calls `search_prompts`, shows numbered list, user picks, executes | ✅ YES |
| 📖 **Run from Folder** | "Run all testing prompts" | ✅ Testing folder exists | ✅ Multiple (5 prompts) | Claude calls `list_prompts(folderId)`, shows all 5, user selects or runs all sequentially | ✅ YES |
| 📖 **Search All Prompts** | "Find prompts about authentication" | N/A | ✅ Found 3 matches | Claude calls `search_prompts("authentication")`, shows: Password Auth, OAuth, SAML | ✅ YES |
| ✨ **Save Prompt Variation** | "Save this variant as 'Code Review v2'" in existing folder | ✅ Exists | ❌ New (variation) | Claude calls `create_prompt` in same folder, user can now switch between v1 and v2 | ✅ YES |
| 🔨 **Update Existing Prompt** | "Update my security prompt with this new content" | ✅ Exists | ✅ Single found | Claude calls `search_prompts`, confirms ID, calls `update_prompt` | ✅ YES |
| 🔨 **Move Prompt** | "Move this prompt from Personal to Work" | ✅ Both exist | ✅ Found | Claude calls `move_prompt` to change folderId | ✅ YES |
| ✨✨✨ **Organize by Folder** | "Create folders for Work, Personal, Testing" | ❌ Don't exist | N/A | Claude calls `create_folder` 3 times with different names | ✅ YES |
| 📖 **List Everything** | "Show me all my prompts organized by folder" | ✅ Multiple | ✅ Multiple | Claude calls `list_folders`, then `list_prompts` for each folder | ✅ YES |
| 📖 **Batch Review** | "Run all security prompts against this code" | ✅ Security folder exists | ✅ Multiple (5 security prompts) | Claude calls `list_prompts(securityFolderId)`, runs each one, compares results | ✅ YES |
| 📖 **Prompt Chain** | "Walk me through: Setup > Configure > Deploy" | ✅ Exists | ✅ 3 prompts in sequence | Claude calls `search_prompts` for each, executes in order with context passed between | ✅ YES |
| 🗑️ **Delete Old Prompt** | "Remove the old password prompt" | ✅ Exists | ✅ Single found | Claude calls `search_prompts("password")`, confirms ID, calls `delete_prompt` | ✅ YES |
| 🔨 **Rename Folder** | "Rename Security folder to SecOps" | ✅ Exists | N/A | Claude calls `update_folder` with new name | ✅ YES |
| 🗑️ **Delete Empty Folder** | "Clean up old Test folder" | ✅ Empty folder exists | N/A (folder empty) | Claude calls `delete_folder` | ✅ YES |
| 🗑️ **Delete with Contents** | "Remove Testing folder and all prompts in it" | ✅ Exists with prompts | ✅ Multiple | Claude needs to `delete_prompt` for each, then `delete_folder` | ✅ YES (manual but supported) |
| ✅ **Health Check** | "Is the MCP server running?" | N/A | N/A | Claude calls `health_check`, gets server version, tool count, connectivity status | ✅ YES |

---

### Key Workflow Patterns

#### Pattern 1: Save Iteration
```
User: "Save that as 'Review v2' in Security"
Claude: list_folders() → create_prompt(title, content, folderId)
Result: New version saved, can switch between v1 and v2 later
```
**Support**: ✅ Full (create_prompt tool)

#### Pattern 2: Search & Execute
```
User: "Run my code review prompt"
Claude: search_prompts("code review")
  → If 1 match: execute
  → If multiple: show numbered list, user picks
Result: Prompt retrieved and executed instantly
```
**Support**: ✅ Full (search_prompts + get_prompt tools)

#### Pattern 3: Batch Run
```
User: "Run all security prompts against this code"
Claude: list_prompts(securityFolderId) → shows 5 prompts
Claude: For each prompt: execute sequentially
Result: Comprehensive security analysis from multiple angles
```
**Support**: ✅ Full (list_prompts + get_prompt tools)

#### Pattern 4: Organize
```
User: "Move testing prompts to a QA folder"
Claude: search_prompts() → create_folder("QA") → move_prompt() × N
Result: Prompts reorganized, visible in Prompteka app immediately
```
**Support**: ✅ Full (search_prompts + create_folder + move_prompt tools)

---

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

### "Database file not found" or "Queue directory not found"

This means the Prompteka app hasn't created its database yet. Ensure Prompteka is installed and has been opened at least once:

```bash
# Download from App Store: https://apps.apple.com/app/prompteka/id6738107425
# Or open if already installed:
open /Applications/Prompteka.app
```

Once you've opened Prompteka once, check the database exists:

```bash
ls -la ~/Library/Application\ Support/prompteka/prompts.db
```

### "Database is locked" or "SQLITE_BUSY"

The database write lock timed out after 5 seconds. This is rare but can happen if:
- Prompteka app is performing a large operation
- Database corruption scan is running
- Another MCP client is also writing

**Solution**: Retry the operation. Automatic retry is built-in, but if you still see this error:

```bash
# Check database file exists and is readable
ls -la ~/Library/Application\ Support/prompteka/prompts.db*
```


## API Reference

See [`documentation/PRD.md`](./documentation/PRD.md) for complete API specification including:

- Tool schemas and validation rules
- Error taxonomy with recovery strategies
- Database contract (WAL mode, transactions, concurrency)
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

The MCP server uses a **read-direct, write-direct** pattern with SQLite WAL mode:

```
┌─────────┐
│   AI    │ (MCP-compatible assistant)
└────┬────┘
     │ MCP Protocol
     ▼
┌─────────────────────────┐
│  Prompteka MCP Server   │
├─────────────────────────┤
│ Read Operations (5):    │ (Direct DB access)
│ ├─ list_folders         │ < 100ms
│ ├─ list_prompts         │
│ ├─ get_prompt           │
│ ├─ search_prompts       │
│ └─ health_check         │
│                         │
│ Write Operations (7):   │ (Direct DB access)
│ ├─ create_prompt        │ < 10ms
│ ├─ update_prompt        │ (atomic transactions)
│ ├─ delete_prompt        │
│ ├─ create_folder        │
│ ├─ update_folder        │
│ ├─ delete_folder        │
│ └─ move_prompt          │
└────┬──────────────────┬─┘
     │ Direct Read      │ Direct Write
     │ (WAL mode)       │ (WAL mode)
     ▼                  ▼
┌──────────────────────────────────────┐
│ Prompteka SQLite Database            │
├──────────────────────────────────────┤
│ WAL File: prompts.db-wal             │
│ Shared Memory: prompts.db-shm        │
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

## Support & Resources

### About Prompteka
- **Official Website**: [prompteka.net](https://prompteka.net)
- **App Store**: [Prompteka on Mac App Store](https://apps.apple.com/app/prompteka/id6738107425)
- **Prompteka Support**: [prompteka.net/support.html](https://prompteka.net/support.html)
- **Privacy Policy**: [prompteka.net/privacy-policy.html](https://prompteka.net/privacy-policy.html)

### About This MCP Server
- **Documentation**: See [`documentation/PRD.md`](./documentation/PRD.md) for complete API specification
- **GitHub Issues**: [Report bugs or request features](https://github.com/webdevguyrg/prompteka-mcp/issues)
- **Contributing**: See `CONTRIBUTING.md` for developer guidelines

## Privacy Policy

The Prompteka MCP Server is local-only and does not collect any data. For Prompteka app privacy details, see: https://prompteka.net/privacy-policy.html

---

**Made with ❤️ for Prompteka users**

Questions? Open an issue on GitHub.
