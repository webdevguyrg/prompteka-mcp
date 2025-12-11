# Prompteka MCP Server

**Model Context Protocol server for Prompteka** - enables AI assistants to read and write your prompt library.

---

## TL;DR

**What is Prompteka?**
[Prompteka](https://prompteka.net) is a native macOS app (available on the [App Store](https://apps.apple.com/app/prompteka/id6738107425)) that lets you organize, search, and manage your AI prompt library locally on your Mac. Think of it as a smart folder system for all your prompts with tagging, emojis, colors, and full-text search.

**What does this MCP Server do?**
This server enables any MCP-compatible AI assistant (Claude Desktop, Cursor, and others) to directly access and manage your Prompteka library programmatically. Instead of manually copying prompts in and out, your AI assistant can:
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

The MCP server connects directly to your Prompteka database, so changes made by the AI are persisted immediately to the database. Refresh the Prompteka app to see updates in the UI. No syncing, no copying - single source of truth.

**Installation:**
1. Have [Prompteka app](https://apps.apple.com/app/prompteka/id6738107425) installed
2. `npm install -g prompteka-mcp` (once published)
3. Configure your MCP client (Claude Desktop, Cursor, etc.)
4. Start using: "Add this prompt to my Security folder"

**Ready to dive in?** Jump to [Workflow Scenarios](#workflow-scenarios--support-matrix) to see what you can do with MCP + Prompteka.

---

## Table of Contents

1. [Features](#features)
2. [How It Works](#how-it-works)
3. [Installation](#installation)
4. [Configuration](#advanced-configuration)
5. [Available Tools](#available-tools-12-total)
6. [Workflow Scenarios](#workflow-scenarios--support-matrix)
7. [Security & Privacy](#security--privacy)
8. [Troubleshooting](#troubleshooting)
9. [Support & Resources](#support--resources)

---

> 🚨 **Regular Backups Recommended**
>
> Your prompt library is valuable! We strongly encourage you to regularly backup your Prompteka library. Backups are fully supported through the Prompteka app itself and protect you against accidental deletions or data loss. You can export your entire library as a backup file directly from Prompteka - this is a safe, built-in feature that ensures you never lose your prompts.

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

- **Database-Level Persistence**: Changes made by the AI are committed to the database immediately (< 10ms)
- **Single Source of Truth**: The local SQLite database is the only copy of your data
- **Concurrent Safe**: Both Prompteka app and MCP server can operate simultaneously without conflicts
- **App-Independent**: The MCP server doesn't depend on the Prompteka app being running
- **UI Refresh Required**: Refresh the Prompteka app (⌘R or Refresh button) to see changes in the UI

### Architecture Overview

The Prompteka MCP Server operates in two modes:

**Read Operations** (Fast, Direct Database Access)
- Connects directly to your Prompteka SQLite database at `~/Library/Application Support/prompteka/prompts.db`
- Uses WAL (Write-Ahead Logging) mode for safe concurrent access with Prompteka app
- Returns results in < 100ms
- Does NOT interfere with Prompteka app operations

**Write Operations** (Immediate Database Persistence)
- Writes directly to Prompteka SQLite database using WAL mode
- Uses atomic transactions with full ACID guarantees
- Changes committed immediately (< 10ms)
- Available to other MCP read operations and SQLite clients immediately
- Prompteka app UI updates upon refresh (⌘R or Refresh button)
- SQLite handles concurrent access safely

This unified approach ensures:
- ✅ Sub-10ms database persistence (immediate data availability)
- ✅ No app dependency - MCP server operates standalone
- ✅ Safe concurrent read-write with WAL mode
- ✅ Automatic atomic rollback on errors
- ✅ Zero orphaned operations or cleanup needed
- ✅ Single source of truth - the local SQLite database

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

6. **Visibility**: Changes are immediately available to:
   - Other MCP read operations (instant)
   - Prompteka app database queries (instant)
   - Prompteka app UI (upon refresh with ⌘R or Refresh button)
   - Any other SQLite clients accessing the database (instant)

This all happens in < 10ms at the database level. No app required to be running. Refresh the Prompteka app to see changes reflected in the UI.

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
which prompteka-mcp  # Should show path to installed binary
```

### Step 2: Configure Your MCP Client

The MCP server is now installed. Next, configure your MCP-compatible AI tool to use it.

Add this server configuration to your MCP client:

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

**Common MCP client configuration locations:**

| Client | Config File Location |
|--------|---------------------|
| Claude Desktop (macOS) | `~/Library/Application Support/Claude/claude_desktop_config.json` |
| Claude Desktop (Windows) | `%AppData%\Claude\claude_desktop_config.json` |
| Cursor | Check Settings → MCP |
| Other clients | Refer to your client's MCP documentation |

After adding the configuration, **fully restart your MCP client** (quit and reopen, not just close the window).

### Step 3: Verify Installation

Verify the binary is installed:

```bash
which prompteka-mcp  # Should show path to installed binary
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
Get all your folders with metadata (name, parent hierarchy, timestamps).

**`list_prompts`**
Get prompts from a specific folder with pagination.

**`get_prompt`**
Get full details of a single prompt by ID.

**`search_prompts`**
Full-text search across all prompt titles and content.

**`health_check`**
Verify MCP server and database are operational. Returns server version and connectivity status.

### Write Tools (7 tools, Direct Database Access)

**`create_prompt`**
Create a new prompt in a folder with emoji, color, and optional URL. Defaults to 🤖 emoji and blue color if not specified.

**`update_prompt`**
Modify an existing prompt (title, content, folder, emoji, color, URL).

**`delete_prompt`**
Delete a prompt (requires explicit `confirmDelete=true` safety confirmation, idempotent - safe to retry).

**`create_folder`**
Create a new folder with optional parent folder for nesting.

**`update_folder`**
Rename or reorganize a folder.

**`delete_folder`**
Delete a folder (requires explicit `confirmDelete=true` safety confirmation).
- Can delete empty folders instantly
- Can delete folder with all contents using `recursive=true`
- AI will ask for confirmation before deleting folders with contents

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

Use the **Prompteka app's built-in export feature** to backup your entire library or migrate between systems. The MCP server provides read access for automation purposes, but full backup/restore operations are safely handled by the Prompteka app itself to ensure data integrity.

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
| ✨ **Save Generated Prompt** | "Save this as 'Security Checklist' in Security folder" | Folder exists | ❌ New | AI calls `create_prompt` with title, content, folderId | ✅ YES |
| ✨ **Save Without Folder** | "Save that as 'Quick Test'" | ❌ Must choose or create | ❌ New | AI calls `list_folders`, user picks, then `create_prompt` | ✅ YES |
| ✨✨ **Save & Create Folder** | "Save as 'Testing' in new folder 'QA'" | ❌ Doesn't exist | ❌ New | AI calls `create_folder`, then `create_prompt` | ✅ YES |
| 📖 **Find & Run Prompt** | "Run my code review prompt" | ✅ Single exists | ✅ Single match | AI calls `search_prompts("code review")`, gets result, executes it | ✅ YES |
| 📖 **Ambiguous Search** | "Run code review prompt" | ✅ Exists | ✅ Multiple matches (General, Security, Performance) | AI calls `search_prompts`, shows numbered list, user picks, executes | ✅ YES |
| 📖 **Run from Folder** | "Run all testing prompts" | ✅ Testing folder exists | ✅ Multiple (5 prompts) | AI calls `list_prompts(folderId)`, shows all 5, user selects or runs all sequentially | ✅ YES |
| 📖 **Search All Prompts** | "Find prompts about authentication" | N/A | ✅ Found 3 matches | AI calls `search_prompts("authentication")`, shows: Password Auth, OAuth, SAML | ✅ YES |
| ✨ **Save Prompt Variation** | "Save this variant as 'Code Review v2'" in existing folder | ✅ Exists | ❌ New (variation) | AI calls `create_prompt` in same folder, user can now switch between v1 and v2 | ✅ YES |
| 🔨 **Update Existing Prompt** | "Update my security prompt with this new content" | ✅ Exists | ✅ Single found | AI calls `search_prompts`, confirms ID, calls `update_prompt` | ✅ YES |
| 🔨 **Move Prompt** | "Move this prompt from Personal to Work" | ✅ Both exist | ✅ Found | AI calls `move_prompt` to change folderId | ✅ YES |
| ✨✨✨ **Organize by Folder** | "Create folders for Work, Personal, Testing" | ❌ Don't exist | N/A | AI calls `create_folder` 3 times with different names | ✅ YES |
| 📖 **List Everything** | "Show me all my prompts organized by folder" | ✅ Multiple | ✅ Multiple | AI calls `list_folders`, then `list_prompts` for each folder | ✅ YES |
| 📖 **Batch Review** | "Run all security prompts against this code" | ✅ Security folder exists | ✅ Multiple (5 security prompts) | AI calls `list_prompts(securityFolderId)`, runs each one, compares results | ✅ YES |
| 📖 **Prompt Chain** | "Walk me through: Setup > Configure > Deploy" | ✅ Exists | ✅ 3 prompts in sequence | AI calls `search_prompts` for each, executes in order with context passed between | ✅ YES |
| 🗑️ **Delete Old Prompt** | "Remove the old password prompt" | ✅ Exists | ✅ Single found | AI calls `search_prompts("password")`, confirms ID, calls `delete_prompt` | ✅ YES |
| 🔨 **Rename Folder** | "Rename Security folder to SecOps" | ✅ Exists | N/A | AI calls `update_folder` with new name | ✅ YES |
| 🗑️ **Delete Empty Folder** | "Clean up old Test folder" | ✅ Empty folder exists | N/A (folder empty) | AI calls `delete_folder` | ✅ YES |
| 🗑️ **Delete with Contents** | "Remove Testing folder and all prompts in it" | ✅ Exists with prompts | ✅ Multiple | AI asks user to confirm, then calls `delete_folder(recursive=true, confirmDelete=true)` | ✅ YES (with confirmation) |
| ✅ **Health Check** | "Is the MCP server running?" | N/A | N/A | AI calls `health_check`, gets server version and connectivity status | ✅ YES |

---

### Key Workflow Patterns

#### Pattern 1: Save Iteration
```
User: "Save that as 'Review v2' in Security"
AI: list_folders() → create_prompt(title, content, folderId)
Result: New version saved, can switch between v1 and v2 later
```
**Support**: ✅ Full (create_prompt tool)

#### Pattern 2: Search & Execute
```
User: "Run my code review prompt"
AI: search_prompts("code review")
  → If 1 match: execute
  → If multiple: show numbered list, user picks
Result: Prompt retrieved and executed instantly
```
**Support**: ✅ Full (search_prompts + get_prompt tools)

#### Pattern 3: Batch Run
```
User: "Run all security prompts against this code"
AI: list_prompts(securityFolderId) → shows 5 prompts
AI: For each prompt: execute sequentially
Result: Comprehensive security analysis from multiple angles
```
**Support**: ✅ Full (list_prompts + get_prompt tools)

#### Pattern 4: Organize
```
User: "Move testing prompts to a QA folder"
AI: search_prompts() → create_folder("QA") → move_prompt() × N
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

### "Database file not found"

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

### Changes via MCP not showing in Prompteka app

If you've made changes to your prompts through MCP (via Claude, Cursor, etc.) and the Prompteka app is open, you may need to refresh the app to see the latest data.

**Solution**: Refresh the Prompteka app:
- **Click the "Refresh" button** in the top toolbar
- **Keyboard shortcut**: Press `⌘R` (Command+R)

The MCP server writes directly to the database, so changes are persistent immediately. The app refresh simply reloads the UI to display the updated data.


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
