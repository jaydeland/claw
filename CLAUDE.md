# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What is this?

**Claw** - A local-first Electron desktop app for AI-powered code assistance. Users create chat sessions linked to local project folders, interact with Claude in Plan or Agent mode, and see real-time tool execution (bash, file edits, web search, etc.).

## Commands

```bash
# Development
bun run dev              # Start Electron with hot reload

# Build
bun run build            # Compile app
bun run package          # Package for current platform (dir)
bun run package:mac      # Build macOS (DMG + ZIP)
bun run package:win      # Build Windows (NSIS + portable)
bun run package:linux    # Build Linux (AppImage + DEB)

# Database (Drizzle + SQLite)
bun run db:generate      # Generate migrations from schema
bun run db:push          # Push schema directly (dev only)
```

## Troubleshooting

### Architecture Mismatch (better-sqlite3)

**Symptom:** App crashes with error:
```
ERR_DLOPEN_FAILED: mach-o file, but is an incompatible architecture
(have 'x86_64', need 'arm64e' or 'arm64')
```

**Cause:** The better-sqlite3 native module was compiled for the wrong CPU architecture (x86_64/Intel instead of arm64/Apple Silicon, or vice versa).

**Fix:**
```bash
# Clean reinstall better-sqlite3 for correct architecture
rm -rf node_modules/better-sqlite3
bun install

# The postinstall script will automatically run electron-rebuild
# which compiles native modules for your current architecture
```

**When this happens:**
- After pulling code from another machine with different architecture
- After switching between Rosetta and native mode
- After npm/bun cache corruption

## Remote Debugging

The app enables remote debugging on port **9223** in development mode for MCP server access.

**Test debugger endpoint:**
```bash
curl http://localhost:9223/json
```

**Configure electron-mcp-server:**

Add to your MCP config file (`~/.claude/mcp.json`):

```json
{
  "mcpServers": {
    "electron": {
      "command": "npx",
      "args": ["-y", "electron-mcp-server"],
      "env": {
        "SCREENSHOT_ENCRYPTION_KEY": "your-32-byte-hex-key",
        "SECURITY_LEVEL": "balanced"
      },
      "disabled": false,
      "autoApprove": []
    }
  }
}
```

**Generate encryption key:** `openssl rand -hex 32`
**Note:** Server auto-scans ports 9222-9225. The encryption key is only needed in the MCP server config, not in the app code.

**Architecture:** Vite Dev (5174) -> Electron Main -> Remote Debug (9223) -> MCP Server

## Development Environment

This project uses **Flox** for reproducible development environments.

### First-time Setup

```bash
# Install Flox (if not already installed)
curl -fsSL https://install.flox.dev | bash

# Activate the Claw environment
cd /path/to/claw
flox activate
```

### Daily Workflow

```bash
# Activate environment (once per terminal session)
flox activate

# Then use normal commands
bun install
bun run dev
```

**Key points:**
- Flox manages: bun runtime, electron binary
- package.json manages: React, Electron libraries, UI components, all npm packages
- Run `flox activate` once per terminal session (or use direnv for auto-activation)
- The environment sets `ELECTRON_SKIP_BINARY_DOWNLOAD=1` to prevent duplicate electron binaries

**Without Flox:** The app will try to use system-installed bun/electron, which may have version mismatches. Always activate Flox before development.

## Architecture

```
src/
├── main/                    # Electron main process
│   ├── index.ts             # App entry, window lifecycle
│   ├── auth-manager.ts      # OAuth flow, token refresh
│   ├── auth-store.ts        # Encrypted credential storage (safeStorage)
│   ├── windows/main.ts      # Window creation, IPC handlers
│   └── lib/
│       ├── db/              # Drizzle + SQLite
│       │   ├── index.ts     # DB init, auto-migrate on startup
│       │   ├── schema/      # Drizzle table definitions
│       │   └── utils.ts     # ID generation
│       ├── trpc/routers/    # tRPC routers (projects, chats, claude)
│       ├── claude/env.ts    # Claude SDK environment
│       └── terminal/env.ts  # Terminal environment

├── preload/                 # IPC bridge (context isolation)
│   └── index.ts             # Exposes desktopApi + tRPC bridge

└── renderer/                # React 19 UI
    ├── App.tsx              # Root with providers
    ├── features/
    │   ├── agents/          # Main chat interface
    │   │   ├── main/        # active-chat.tsx, new-chat-form.tsx
    │   │   ├── ui/          # Tool renderers, preview, diff view
    │   │   ├── commands/    # Slash commands (/plan, /agent, /clear)
    │   │   ├── atoms/       # Jotai atoms for agent state
    │   │   └── stores/      # Zustand store for sub-chats
    │   ├── sidebar/         # Chat list, archive, navigation
    │   ├── sub-chats/       # Tab/sidebar sub-chat management
    │   └── layout/          # Main layout with resizable panels
    ├── components/ui/       # Radix UI wrappers (button, dialog, etc.)
    └── lib/
        ├── atoms/           # Global Jotai atoms
        ├── stores/          # Global Zustand stores
        ├── trpc.ts          # Real tRPC client
        └── mock-api.ts      # DEPRECATED - being replaced with real tRPC
```

## Database (Drizzle ORM)

**Location:** `{userData}/data/agents.db` (SQLite)

**Schema:** `src/main/lib/db/schema/index.ts`

```typescript
// Three main tables:
projects    -> id, name, path (local folder), timestamps
chats       -> id, name, projectId, worktree fields, timestamps
sub_chats   -> id, name, chatId, sessionId, mode, messages (JSON)
```

**Auto-migration:** On app start, `initDatabase()` runs migrations from `drizzle/` folder (dev) or `resources/migrations` (packaged).

**Queries:**
```typescript
import { getDatabase, projects, chats } from "../lib/db"
import { eq } from "drizzle-orm"

const db = getDatabase()
const allProjects = db.select().from(projects).all()
const projectChats = db.select().from(chats).where(eq(chats.projectId, id)).all()
```

### Handling Database Schema Changes

When modifying the database schema, follow these steps to ensure migrations work correctly:

1. **Update schema file**: Make changes in `src/main/lib/db/schema/index.ts`

2. **Generate migration**:
   ```bash
   bun run db:generate
   ```
   This creates a new SQL file in `drizzle/` folder (e.g., `0018_new_feature.sql`)

3. **Review migration**: Check the generated SQL to ensure it's correct

4. **Test in development**:
   ```bash
   # Stop the app if running
   bun run dev
   # Migrations run automatically on app startup via initDatabase()
   ```

5. **Manual migration** (if auto-migration fails):
   ```bash
   # Stop app first
   DB_PATH="$HOME/Library/Application Support/Claw/data/agents.db"
   sqlite3 "$DB_PATH" < drizzle/0018_new_feature.sql
   ```

6. **Verify schema**:
   ```bash
   sqlite3 "$DB_PATH" ".schema table_name"
   ```

**Important Notes:**
- The app auto-migrates on startup, reading from `drizzle/` in dev mode
- **DO NOT** modify the database directly without creating a migration
- **ALWAYS** test migrations by restarting the app to ensure they apply correctly
- If you see "no such column" errors, it means the migration didn't run - manually apply it
- Migration files must be sequential (0017, 0018, etc.)
- Packaged apps read migrations from `resources/migrations` (copied during build)

**Troubleshooting:**
```bash
# Check if database is locked
lsof "$DB_PATH"

# View migration journal
sqlite3 "$DB_PATH" "SELECT * FROM __drizzle_migrations"

# Check current schema
sqlite3 "$DB_PATH" ".schema"
```

## Key Patterns

### IPC Communication
- Uses **tRPC** with `trpc-electron` for type-safe main<->renderer communication
- All backend calls go through tRPC routers, not raw IPC
- Preload exposes `window.desktopApi` for native features (window controls, clipboard, notifications)

### State Management
- **Jotai**: UI state (selected chat, sidebar open, preview settings)
- **Zustand**: Sub-chat tabs and pinned state (persisted to localStorage)
- **React Query**: Server state via tRPC (auto-caching, refetch)

### Claude Integration
- Dynamic import of `@anthropic-ai/claude-code` SDK
- Two modes: "plan" (read-only) and "agent" (full permissions)
- Session resume via `sessionId` stored in SubChat
- Message streaming via tRPC subscription (`claude.onMessage`)

## Tech Stack

| Layer | Tech |
|-------|------|
| Desktop | Electron 33.4.5, electron-vite, electron-builder |
| UI | React 19, TypeScript 5.4.5, Tailwind CSS |
| Components | Radix UI, Lucide icons, Motion, Sonner |
| State | Jotai, Zustand, React Query |
| Backend | tRPC, Drizzle ORM, better-sqlite3 |
| AI | @anthropic-ai/claude-code |
| Package Manager | bun |

## File Naming

- Components: PascalCase (`ActiveChat.tsx`, `AgentsSidebar.tsx`)
- Utilities/hooks: camelCase (`useFileUpload.ts`, `formatters.ts`)
- Stores: kebab-case (`sub-chat-store.ts`, `agent-chat-store.ts`)
- Atoms: camelCase with `Atom` suffix (`selectedAgentChatIdAtom`)

## Important Files

- `electron.vite.config.ts` - Build config (main/preload/renderer entries)
- `src/main/lib/db/schema/index.ts` - Drizzle schema (source of truth)
- `src/main/lib/db/index.ts` - DB initialization + auto-migrate
- `src/renderer/features/agents/atoms/index.ts` - Agent UI state atoms
- `src/renderer/features/agents/main/active-chat.tsx` - Main chat component
- `src/main/lib/trpc/routers/claude.ts` - Claude SDK integration

## Debugging First Install Issues

When testing behavior for new users, you need to simulate a fresh install:

```bash
# 1. Clear all app data (database, settings)
rm -rf ~/Library/Application\ Support/Claw/

# 2. Clear app preferences
defaults delete com.claw.app.dev  # Dev mode
defaults delete com.claw.app      # Production

# 3. Run in dev mode with clean state
bun run dev
```

**Common First-Install Bugs:**
- **Folder dialog not appearing**: Window focus timing issues on first launch. Fixed by ensuring window focus before showing `dialog.showOpenDialog()`.

**Dev vs Production App:**
- Dev mode uses separate userData path (`~/Library/Application Support/Agents Dev/`)
- This prevents conflicts between dev and production installs

## Releasing a New Version

### Build Commands

```bash
# Build for development
bun run build              # Compile TypeScript

# Package for distribution
bun run package:mac        # Build macOS (DMG + ZIP)
bun run package:win        # Build Windows (NSIS + portable)
bun run package:linux      # Build Linux (AppImage + DEB)
```

### Bump Version Before Release

```bash
npm version patch --no-git-tag-version  # 0.0.27 -> 0.0.28
```

### Notes

- **Auto-updater is disabled** - users must manually download new versions
- External CDN upload scripts have been removed
- For distribution, manually upload the built packages to your preferred hosting

## Current Status (WIP)

**Done:**
- Drizzle ORM setup with schema (projects, chats, sub_chats)
- Auto-migration on app startup
- tRPC routers structure

**In Progress:**
- Replacing `mock-api.ts` with real tRPC calls in renderer
- ProjectSelector component (local folder picker)

**Planned:**
- Git worktree per chat (isolation)
- Claude Code execution in worktree path
- Full feature parity with web app

<!-- gitnexus:start -->
# GitNexus MCP

This project is indexed by GitNexus as **claw** (5376 symbols, 12691 relationships, 300 execution flows).

GitNexus provides a knowledge graph over this codebase — call chains, blast radius, execution flows, and semantic search.

## Always Start Here

For any task involving code understanding, debugging, impact analysis, or refactoring, you must:

1. **Read `gitnexus://repo/{name}/context`** — codebase overview + check index freshness
2. **Match your task to a skill below** and **read that skill file**
3. **Follow the skill's workflow and checklist**

> If step 1 warns the index is stale, run `npx gitnexus analyze` in the terminal first.

## Skills

| Task | Read this skill file |
|------|---------------------|
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus/impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus/debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus/refactoring/SKILL.md` |

## Tools Reference

| Tool | What it gives you |
|------|-------------------|
| `query` | Process-grouped code intelligence — execution flows related to a concept |
| `context` | 360-degree symbol view — categorized refs, processes it participates in |
| `impact` | Symbol blast radius — what breaks at depth 1/2/3 with confidence |
| `detect_changes` | Git-diff impact — what do your current changes affect |
| `rename` | Multi-file coordinated rename with confidence-tagged edits |
| `cypher` | Raw graph queries (read `gitnexus://repo/{name}/schema` first) |
| `list_repos` | Discover indexed repos |

## Resources Reference

Lightweight reads (~100-500 tokens) for navigation:

| Resource | Content |
|----------|---------|
| `gitnexus://repo/{name}/context` | Stats, staleness check |
| `gitnexus://repo/{name}/clusters` | All functional areas with cohesion scores |
| `gitnexus://repo/{name}/cluster/{clusterName}` | Area members |
| `gitnexus://repo/{name}/processes` | All execution flows |
| `gitnexus://repo/{name}/process/{processName}` | Step-by-step trace |
| `gitnexus://repo/{name}/schema` | Graph schema for Cypher |

## Graph Schema

**Nodes:** File, Function, Class, Interface, Method, Community, Process
**Edges (via CodeRelation.type):** CALLS, IMPORTS, EXTENDS, IMPLEMENTS, DEFINES, MEMBER_OF, STEP_IN_PROCESS

```cypher
MATCH (caller)-[:CodeRelation {type: 'CALLS'}]->(f:Function {name: "myFunc"})
RETURN caller.name, caller.filePath
```

<!-- gitnexus:end -->
