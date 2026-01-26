# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What is this?

**21st Agents** - A local-first Electron desktop app for AI-powered code assistance. Users create chat sessions linked to local project folders, interact with Claude in Plan or Agent mode, and see real-time tool execution (bash, file edits, web search, etc.).

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

## Remote Debugging

The app enables remote debugging on port **9223** in development mode for MCP server access.

**Test debugger endpoint:**
```bash
curl http://localhost:9223/json
```

**Configure electron-mcp-server:**

Add to your MCP config file:
- **Devyard mode:** `$VIDYARD_PATH/devyard/claude/mcp.json`
- **Standard mode:** `~/.claude/mcp.json`

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

**Architecture:** Vite Dev (5174) → Electron Main → Remote Debug (9223) → MCP Server

## Development Environment

This project uses **Flox** for reproducible development environments. The claw environment inherits from the devyard environment (TypeScript tooling, Node.js, Python, etc.) and adds app-specific dependencies (bun, electron).

### Inheritance Pattern

```
devyard/.flox/env/manifest.toml
  ├─ TypeScript language server
  ├─ Node.js, Python, etc.
  └─ Claude Code LSP integration

claw/.flox/env/manifest.toml
  ├─ [include] → devyard (via symlink)
  ├─ bun (package manager)
  └─ electron (desktop framework)
```

This follows the same pattern as the avatar project. TypeScript LSP is available via inheritance.

### First-time Setup

```bash
# Install Flox (if not already installed)
curl -fsSL https://install.flox.dev | bash

# Activate the Claw environment (inherits from devyard)
cd /Users/jdeland/claw
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
- Inherited from devyard: TypeScript LSP, Node.js, Python, kubectl, etc.
- package.json manages: React, Electron libraries, UI components, all npm packages
- Run `flox activate` once per terminal session (or use direnv for auto-activation)
- The environment sets `ELECTRON_SKIP_BINARY_DOWNLOAD=1` to prevent duplicate electron binaries

**Without Flox:** The app will try to use system-installed bun/electron, which may have version mismatches. Always activate Flox before development.

## Devyard Integration

The app automatically detects and integrates with Vidyard's Devyard development environment when available. This provides AWS and Kubernetes configuration for Claude agents and terminals.

**Authentication Method:**
- Available as "Devyard" option in the authentication selector (onboarding and settings)
- Shows automatically when `$VIDYARD_PATH` environment variable is set
- Disabled if Devyard is not detected

**Detection:**
- Checks for `$VIDYARD_PATH/devyard` directory
- If found, automatically loads AWS/Kubernetes configuration

**Loaded Environment Variables:**
- `KUBECONFIG` - Points to `.kube.config` in devyard
- `AWS_PROFILE_OPERATIONS` - Operations account profile (SSO-Operations-075505783641)
- `AWS_PROFILE_STAGING` - Staging account profile (SSO-Staging-075505783641)
- `AWS_REGION` - Default region (us-east-1)
- `AWS_STAGING_CLUSTER` - EKS staging cluster ARN
- `AWS_SHARED_CREDENTIALS_FILE` - Points to `.aws-creds` in devyard
- `AWS_CONFIG_FILE` - Points to `.aws-profile` in devyard
- `CLAUDE_CONFIG_DIR` - Points to `claude/` in devyard (for skills, agents, commands)
- `CLAUDE_PLUGIN_DIR` - Points to `claude/plugin/` in devyard

**Claude Configuration:**
When Devyard auth mode is selected, Claude automatically uses `$VIDYARD_PATH/devyard/claude` as its configuration directory. This allows:
- Shared access to Claude skills across the team
- Shared Claude agents and commands
- Shared MCP plugins in `claude/plugin/`
- Consistent Claude configuration across all developers

**Where It's Used:**
- Claude SDK environments (`buildClaudeEnv` in `src/main/lib/claude/env.ts`)
- Terminal environments (`buildTerminalEnv` in `src/main/lib/terminal/env.ts`)
- Claude config directory (`getClaudeCodeSettings` in `src/main/lib/trpc/routers/claude.ts`)
- Available to all Claude agents when "Devyard" auth mode is selected

**Configuration Module:** `src/main/lib/devyard-config.ts`

The configuration is detected once at first use and cached for the app lifetime. Missing configuration files will generate warnings but won't prevent the app from running.

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
│       ├── devyard-config.ts # Devyard environment detection
│       ├── claude/env.ts    # Claude SDK environment (includes Devyard)
│       └── terminal/env.ts  # Terminal environment (includes Devyard)
│
├── preload/                 # IPC bridge (context isolation)
│   └── index.ts             # Exposes desktopApi + tRPC bridge
│
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
projects    → id, name, path (local folder), timestamps
chats       → id, name, projectId, worktree fields, timestamps
sub_chats   → id, name, chatId, sessionId, mode, messages (JSON)
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
   DB_PATH="/Users/jdeland/Library/Application Support/Agents Dev/data/agents.db"
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
- Uses **tRPC** with `trpc-electron` for type-safe main↔renderer communication
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

When testing auth flows or behavior for new users, you need to simulate a fresh install:

```bash
# 1. Clear all app data (auth, database, settings)
rm -rf ~/Library/Application\ Support/Agents\ Dev/

# 2. Reset macOS protocol handler registration (if testing deep links)
/System/Library/Frameworks/CoreServices.framework/Versions/A/Frameworks/LaunchServices.framework/Versions/A/Support/lsregister -kill -r -domain local -domain system -domain user

# 3. Clear app preferences
defaults delete dev.21st.agents.dev  # Dev mode
defaults delete dev.21st.agents      # Production

# 4. Run in dev mode with clean state
cd apps/desktop
bun run dev
```

**Common First-Install Bugs:**
- **OAuth deep link not working**: macOS Launch Services may not immediately recognize protocol handlers on first app launch. User may need to click "Sign in" again after the first attempt.
- **Folder dialog not appearing**: Window focus timing issues on first launch. Fixed by ensuring window focus before showing `dialog.showOpenDialog()`.

**Dev vs Production App:**
- Dev mode uses `twentyfirst-agents-dev://` protocol
- Dev mode uses separate userData path (`~/Library/Application Support/Agents Dev/`)
- This prevents conflicts between dev and production installs

## Releasing a New Version

### Prerequisites for Notarization

- Keychain profile: `21st-notarize`
- Create with: `xcrun notarytool store-credentials "21st-notarize" --apple-id YOUR_APPLE_ID --team-id YOUR_TEAM_ID`

### Release Commands

```bash
# Full release (build, sign, submit notarization, upload to CDN)
bun run release

# Or step by step:
bun run build              # Compile TypeScript
bun run package:mac        # Build & sign macOS app
bun run dist:manifest      # Generate latest-mac.yml manifests
./scripts/upload-release-wrangler.sh  # Submit notarization & upload to R2 CDN
```

### Bump Version Before Release

```bash
npm version patch --no-git-tag-version  # 0.0.27 → 0.0.28
```

### After Release Script Completes

1. Wait for notarization (2-5 min): `xcrun notarytool history --keychain-profile "21st-notarize"`
2. Staple DMGs: `cd release && xcrun stapler staple *.dmg`
3. Re-upload stapled DMGs to R2 and GitHub (see RELEASE.md for commands)
4. Update changelog: `gh release edit v0.0.X --notes "..."`
5. **Upload manifests (triggers auto-updates!)** — see RELEASE.md
6. **Update Homebrew cask:** `bun run release:homebrew`
7. Sync to public: `./scripts/sync-to-public.sh`

### Homebrew Distribution

Users can install via Homebrew:
```bash
brew install jaydeland/claw/claw
```

The `release:homebrew` script updates the [homebrew-claw](https://github.com/jaydeland/homebrew-claw) tap with the new version and SHA256 hashes. Run this after uploading the stapled DMGs to CDN.

### Files Uploaded to CDN

| File | Purpose |
|------|---------|
| `latest-mac.yml` | Manifest for arm64 auto-updates |
| `latest-mac-x64.yml` | Manifest for Intel auto-updates |
| `Claw-{version}-arm64-mac.zip` | Auto-update payload (arm64) |
| `Claw-{version}-mac.zip` | Auto-update payload (Intel) |
| `Claw-{version}-arm64.dmg` | Manual download (arm64) |
| `Claw-{version}.dmg` | Manual download (Intel) |

### Auto-Update Flow

1. App checks `https://cdn.21st.dev/releases/desktop/latest-mac.yml` on startup and when window regains focus (with 1 min cooldown)
2. If version in manifest > current version, shows "Update Available" banner
3. User clicks Download → downloads ZIP in background
4. User clicks "Restart Now" → installs update and restarts

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
