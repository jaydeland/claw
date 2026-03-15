# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What is this?

**Claw** - A local-first Electron desktop app for AI-powered code assistance. Users create chat sessions linked to local project folders, interact with Claude in Plan or Agent mode, and see real-time tool execution (bash, file edits, web search, etc.).

## Development Guidelines

**Always load the Claude API skill** when working with this codebase. Since Claw integrates deeply with the Claude SDK (`@anthropic-ai/claude-code`), the skill provides essential patterns for:
- Streaming responses and tool use
- Session resumption and message handling
- Extended thinking / adaptive thinking
- Error handling with typed exceptions

Use `/claude-api` to load the skill before implementing or modifying Claude-related functionality.

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
    │   ├── claws/           # Claw automations (settings, files, execution)
    │   └── layout/          # Main layout with resizable panels
    ├── components/ui/       # Radix UI wrappers (button, dialog, etc.)
    └── lib/
        ├── atoms/           # Global Jotai atoms
        ├── stores/          # Global Zustand stores
        ├── trpc.ts          # Real tRPC client
        └── mock-api.ts      # DEPRECATED - being replaced with real tRPC
```

## UI Architecture

This section provides a comprehensive map of the UI components, state management, and navigation patterns. When making UI changes, **you MUST update this section** to keep the documentation synchronized with the codebase.

### Visual Layout Overview

```
┌─ WindowsTitleBar (Windows only) ─────────────────────────────────────┐
├─ Header Bar ──────────────────────────────────────────────────────────┤
│  ├─ TrafficLights (macOS)                                             │
│  ├─ "{C}law" branding                                                 │
│  └─ Settings button (right)                                           │
├─ Main Content Grid ──────────────────────────────────────────────────┤
│  ┌─────────┬────────────────┬──────────────────────┬──────────────┐  │
│  │ Sidebar │ Sidebar        │ Main Content Area    │ Right Icon   │  │
│  │ Tab Bar │ Content        │ (AgentsContent)      │ Bar          │  │
│  │ (icons) │ (w-64)         │ (flex-1)             │ (toggles)    │  │
│  │         │                │                      │              │  │
│  │ - chats │ Context-based: │ Routed view:         │ - Preview    │  │
│  │ - hist  │ • WorkspacesTC │ • ChatView           │ - Diff       │  │
│  │ - agents│ • HistoryTC    │ • NewChatForm        │ - Terminal   │  │
│  │ - skills│ • AgentsTC     │ • TerminalMainView   │ - Flow       │  │
│  │ - mcps  │ • SkillsTC     │ • HistoryChatView    │ - Context    │  │
│  │ - term  │ • McpsTC       │ • ProjectDetailPage  │ - GSD        │  │
│  │ - clust │ • TerminalTC   │ • PromptsView        │              │  │
│  │ - gsd   │ • ClawsTC      │ • WorkflowsContent   │              │  │
│  │ - github│ • SettingsTC   │ • McpContent         │              │  │
│  │ - promts│                │ • ClustersContent    │              │  │
│  │ - claws │                │ • GsdContent         │              │  │
│  │ - settng│                │ • GitHubView         │              │  │
│  └─────────┴────────────────┴──────────────────────┴──────────────┘  │
├─ Update Banner (conditional) ─────────────────────────────────────────┤
└─ AWS Status Bar (conditional) ───────────────────────────────────────┘
```

### Feature-to-Component Mapping

| User Feature | Component Location | Key Files |
|--------------|-------------------|-----------|
| **Main Chat Interface** | `features/agents/main/` | `active-chat.tsx` (219KB), `chat-input-area.tsx` |
| **Sub-Chat Tabs** | Top of chat area | `sub-chat-store.ts`, `sub-chat-tabs.tsx` |
| **Preview Sidebar** | Right sidebar | `agent-preview.tsx`, preview atoms in `atoms/index.ts` |
| **Diff/Changes View** | Right sidebar | `agent-diff-view.tsx` (75KB), changes panel |
| **Terminal** | Right sidebar + dedicated view | `terminal/terminal.tsx`, `terminal-sidebar.tsx` |
| **Session Flow Visualization** | Right sidebar | `session-flow/session-flow-renderer.tsx` |
| **Workspace List** | Sidebar content (chats tab) | `sidebar/components/workspaces-tab-content.tsx` |
| **New Chat Form** | Main area (no chat selected) | `new-chat-form.tsx` (73KB) |
| **Chat Search** | Sidebar overlay | `search/chat-search.tsx` |
| **Archive/History** | Sidebar tab (history) | `history/history-view.tsx` |
| **Quick Switch Dialogs** | Modal overlays | `agents-quick-switch-dialog.tsx`, `subchats-quick-switch-dialog.tsx` |
| **Settings Dialog** | Modal | `components/dialogs/agents-settings-dialog.tsx` |
| **Project Settings** | Main area (via detail icon) | `ui/project-detail-page.tsx` |
| **Workflows** | Main area (settings > workflows) | `workflows/ui/workflows-content.tsx` |
| **MCP Servers** | Main area (mcps tab) | `mcp/ui/mcp-content.tsx` |
| **Kubernetes Clusters** | Main area (clusters tab) | `clusters/ui/clusters-content.tsx` |
| **GSD Planning** | Main area (gsd tab) + right sidebar | `gsd/ui/gsd-content.tsx`, `gsd-chat-sidebar.tsx` |
| **GitHub Integration** | Main area (github tab) | `github/components/github-view.tsx` |
| **System Prompts** | Main area (prompts tab) | `prompts/ui/prompts-view.tsx` |
| **Thinking Controls** | Right of model selector | `components/dialogs/agents-thinking-dialog.tsx` |
| **Claws (Automations)** | Sidebar + main area (claws tab) | `sidebar/components/claws-tab-content.tsx`, `ui/claw-detail-page.tsx` |

### State Management Quick Reference

**Source of Truth:** `src/renderer/features/agents/atoms/index.ts`

**Core Jotai Atoms:**

```typescript
// Chat Selection
selectedAgentChatIdAtom           // Current workspace ID (null = new chat)
selectedDraftIdAtom               // Draft restoration
previousAgentChatIdAtom           // For post-archive navigation

// Sidebar Navigation
selectedSidebarTabAtom            // Active tab ("chats" | "history" | "agents" | etc.)
agentsSidebarOpenAtom             // Sidebar visibility
sidebarContentCollapsedAtom       // Content panel collapsed (icon-only mode)
selectedProjectDetailIdAtom       // Project settings view

// Preview (per-chat via atomFamily)
previewPathAtomFamily(chatId)     // Current preview path
viewportModeAtomFamily(chatId)    // Desktop vs mobile preview
previewScaleAtomFamily(chatId)    // Zoom level
mobileDeviceAtomFamily(chatId)    // Device dimensions

// Diff View (per-chat via atomFamily)
diffSidebarOpenAtomFamily(chatId) // Diff sidebar visibility
diffViewDisplayModeAtom           // "side-peek" | "center-peek" | "full-page"
filteredDiffFilesAtom             // File path filter
selectedDiffFilePathAtom          // Highlighted file
filteredSubChatIdAtom             // Filter by sub-chat
viewedFilesAtomFamily(chatId)     // GitHub-style "Viewed" tracking

// Mode & Preferences
agentModeAtom                     // "agent" | "plan"
lastSelectedAgentIdAtom           // Default agent selection
lastSelectedModelIdAtom           // Default model selection
lastSelectedWorkModeAtom          // "local" | "worktree"

// UI State
loadingSubChatsAtom               // Map<subChatId, parentChatId>
pendingUserQuestionsAtom          // AskUserQuestion dialogs
pendingPlanApprovalsAtom          // Sub-chats awaiting plan approval
pendingPrMessageAtom              // PR creation message
pendingReviewMessageAtom          // Review message

// Claws (per-claw via atomFamily)
selectedClawIdAtom                // Current selected claw ID
selectedClawDetailIdAtom          // Claw detail page view (null = list view)
expandedClawIdsAtom               // Set of expanded claw IDs in tree view
clawDetailActiveTabAtom           // Active tab in claw detail ("general" | "trigger" | "history" | "files")
clawSearchQueryAtom               // Search query for claws list
clawFilesRefreshAtom              // Trigger for refreshing files list
editingClawFileAtom               // Currently editing file {clawId, fileName, fileType}
```

**Zustand Stores:**

```typescript
// Sub-Chat Tab Management (src/renderer/lib/stores/sub-chat-store.ts)
useAgentSubChatStore
  - chatId                        // Current workspace
  - allSubChats                   // All sub-chats metadata
  - openSubChatIds                // Tab order
  - activeSubChatId               // Currently visible tab
  - pinnedSubChatIds              // Pinned tabs

  // Methods
  - setChatId(id)                 // Switch workspace
  - setActiveSubChat(id)          // Switch tab
  - addToOpenSubChats(id)         // Open new tab
  - togglePinSubChat(id)          // Pin/unpin
```

### Sidebar Tab Routing

**How Tabs Work:**
1. User clicks tab icon in `SidebarTabBar` (vertical icons)
2. `selectedSidebarTabAtom` updates
3. `AgentsLayout` shows corresponding sidebar content (if not collapsed)
4. `AgentsContent` routes to corresponding main view

**Tab → Sidebar Content → Main View:**

| Tab ID | Sidebar Content | Main Content | Notes |
|--------|----------------|--------------|-------|
| `"chats"` | WorkspacesTabContent | ChatView / NewChatForm | Default tab, shows workspace list |
| `"history"` | HistoryTabContent | HistoryChatView | Read-only archive view |
| `"agents"` | AgentsTabContent | (detail view) | Available agents list |
| `"skills"` | SkillsTabContent | (detail view) | Skills/commands list |
| `"mcps"` | McpsTabContent | McpContent | MCP servers |
| `"terminal"` | TerminalTabContent | TerminalMainView | Terminal sessions |
| `"clusters"` | (no sidebar) | ClustersContent | Kubernetes management |
| `"gsd"` | (no sidebar) | GsdContent | GSD planning framework |
| `"github"` | (no sidebar) | GitHubView | GitHub integration |
| `"prompts"` | (no sidebar) | PromptsView | System prompts |
| `"claws"` | ClawsTabContent | ClawDetailPage / ExecutionHistoryViewer | Claw automation management |
| `"settings"` | CcSettingsTabContent | CcSettingsContent | App settings |

### Right Sidebar Display Modes

The right sidebar supports 3 display modes (controlled by `RightIconBar`):

1. **side-peek** (sidebar) - Resizable sidebar panel, state persisted across sessions
2. **center-peek** (dialog) - Modal overlay, runtime state only (doesn't auto-restore)
3. **full-page** (fullscreen) - Fullscreen view, runtime state only

**Applicable to:**
- Preview (`agentsPreviewSidebarOpenAtom`)
- Diff View (`diffSidebarOpenAtomFamily` + `diffViewDisplayModeAtom`)
- GSD Planning (`gsdChatSidebarOpenAtom` + `gsdDisplayModeAtom`)

### Reusable UI Components

**Location:** `src/renderer/components/ui/`

All components are Radix UI wrappers with Tailwind styling:

| Component | Purpose | Key Props |
|-----------|---------|-----------|
| Button | Primary action buttons | variant, size, onClick |
| Dialog | Modal dialogs | open, onOpenChange |
| DropdownMenu | Context menus | trigger, items, onSelect |
| Tabs | Tab navigation | defaultValue, onValueChange |
| Input/Textarea | Form inputs | value, onChange, placeholder |
| Select | Dropdown select | value, onValueChange, items |
| Checkbox/Switch | Toggle controls | checked, onCheckedChange |
| Tooltip | Hover tooltips | content, delayDuration |
| Card | Content containers | className, children |
| Badge | Tag labels | variant, children |
| Accordion | Collapsible sections | type, items |
| ScrollArea | Custom scrollbars | className, children |
| Kbd | Keyboard key labels | children |
| Skeleton | Loading placeholders | className |

**Custom Components:**
- **ResizableSidebar** - Draggable resizable sidebar with width persistence
- **PromptInput** - Main chat input with attachments, slash commands, image paste
- **ButtonGroup** - Grouped button controls
- **NetworkStatus** - Connection indicator
- **Canvas Icons** - Large icon library (lucide-react based)
- **Text Shimmer** - Animated text effect
- **Typewriter Text** - Typing animation for AI responses

### Finding UI Elements (Quick Reference)

**"Where do I find...?"**

| UI Element | Location | File Path |
|------------|----------|-----------|
| Main chat input box | ChatView → ChatInputArea | `features/agents/main/chat-input-area.tsx` |
| Model selector | Chat input toolbar | `features/agents/main/chat-input-area.tsx` (lines 1019-1073) |
| Thinking controls | Right of model selector | `components/dialogs/agents-thinking-dialog.tsx` |
| Message list | ChatView → MessagesListWrapper | `features/agents/main/messages-list.tsx` |
| Sub-chat tabs | Top of ChatView | `features/sub-chats/sub-chat-tabs.tsx` |
| Workspace list | Sidebar → WorkspacesTabContent | `features/sidebar/components/workspaces-tab-content.tsx` |
| New chat button | Sidebar header | `features/sidebar/agents-sidebar.tsx` |
| Settings dialog | Modal | `components/dialogs/agents-settings-dialog.tsx` |
| Traffic lights (macOS) | Header bar | `features/agents/components/traffic-light-spacer.tsx` |
| Preview iframe | Right sidebar | `features/agents/ui/agent-preview.tsx` |
| File diff viewer | Right sidebar | `features/agents/ui/agent-diff-view.tsx` |
| Terminal panel | Right sidebar + main view | `features/terminal/terminal.tsx` |
| Session flow tree | Right sidebar | `features/session-flow/session-flow-renderer.tsx` |
| Tool renderers | Message list | `features/ui/agent-*-tool.tsx` files |
| Slash commands | ChatInputArea | `features/agents/commands/` |
| Quick switch (workspaces) | Modal overlay | `features/agents/components/agents-quick-switch-dialog.tsx` |
| Quick switch (tabs) | Modal overlay | `features/agents/components/subchats-quick-switch-dialog.tsx` |
| Archive view | Main area (history tab) | `features/history/history-view.tsx` |
| GitHub integration | Main area (github tab) | `features/github/components/github-view.tsx` |
| System prompts | Main area (prompts tab) | `features/prompts/ui/prompts-view.tsx` |
| Claws list/tree | Sidebar (claws tab) | `features/sidebar/components/claws-tab-content.tsx` |
| Claw settings | Main area (claw detail) | `features/claws/ui/claw-detail-page.tsx` |
| Claw execution history | Main area (claw selected) | `features/sidebar/components/execution-history-viewer.tsx` |
| Claw file editor | Files tab (claw detail) | Coming soon |

### Component Organization Pattern

**Standard Feature Structure:**
```
features/<feature-name>/
├── ui/                  # Main UI components
├── components/          # Sub-components
├── atoms/               # Jotai atoms (feature-specific state)
├── stores/              # Zustand stores (if needed)
├── hooks/               # Custom React hooks
└── lib/                 # Utilities, helpers
```

### Maintaining This Documentation

**CRITICAL:** When making UI changes, you MUST update the relevant sections above:

1. **Add new components** → Update "Feature-to-Component Mapping" table
2. **Add new atoms/stores** → Update "State Management Quick Reference"
3. **Add new sidebar tabs** → Update "Sidebar Tab Routing" table
4. **Add new right sidebar panels** → Update "Right Sidebar Display Modes"
5. **Reorganize layout** → Update "Visual Layout Overview" diagram
6. **Add new features** → Update "Finding UI Elements" quick reference

**Why this matters:**
- CLAUDE.md is Claude Code's primary reference for understanding the codebase
- Outdated documentation leads to incorrect assumptions and wasted effort
- Keeping it current ensures Claude Code can leverage existing patterns

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

**CRITICAL: Single Statement Per Migration File**
Due to `better-sqlite3` limitations, each migration file can only contain **ONE SQL statement**. Files with multiple statements will fail with:
```
RangeError: The supplied SQL string contains more than one statement
```

If you need multiple operations (e.g., create table + create indexes), either:
1. Use `bun run db:generate` to generate properly formatted migrations with `--> statement-breakpoint` markers
2. Manually split into separate files: `0038_add_table.sql`, `0039_add_index1.sql`, `0040_add_index2.sql`
3. For manually written migrations, ensure only one `CREATE TABLE`, `CREATE INDEX`, `ALTER TABLE`, etc. per file

This restriction applies to all migrations in the `drizzle/` folder.

**Troubleshooting:**
```bash
# Check if database is locked
lsof "$DB_PATH"

# View migration journal
sqlite3 "$DB_PATH" "SELECT * FROM __drizzle_migrations"

# Check current schema
sqlite3 "$DB_PATH" ".schema"
```

### Migration Collisions (Duplicate Numbers)

**Symptom:** "no such column" errors after pulling new code, even though the migration file exists.

**Cause:** When two migration files share the same number prefix (e.g., `0060_add_chat_connection_type.sql` and `0060_add_chat_sessions_table.sql`), Drizzle only runs the **first one alphabetically**. Additional migrations with the same number are silently skipped.

**Check for collisions:**
```bash
ls drizzle/ | grep -E "^0060"
# If you see multiple files with the same number, that's the problem
```

**Fix manually:**
```bash
# 1. Identify which migrations were skipped
cat drizzle/meta/_journal.json | grep -E '"tag"' | tail -20

# 2. Apply skipped migrations manually
sqlite3 "$DB_PATH" "ALTER TABLE chats ADD COLUMN connection_type text DEFAULT 'none';"
sqlite3 "$DB_PATH" "ALTER TABLE chats ADD COLUMN connection_target text;"
sqlite3 "$DB_PATH" "ALTER TABLE chats ADD COLUMN connection_name text;"

# 3. Update _journal.json to include skipped entries
# Edit drizzle/meta/_journal.json and add entries for the skipped migrations
# Use sequential idx numbers (e.g., 60, 61, 62, 63) and unique timestamps
```

**Prevention:**
- Always use `bun run db:generate` instead of manually creating migrations - it handles sequencing
- Before creating a manual migration, check `drizzle/` for existing files with the same number
- If you must create manual migrations, use the next available number (check `_journal.json` for the highest idx)

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

### External Messaging Integration (WhatsApp/Slack 2-Way Sync)

Chats can be connected to external messaging platforms for 2-way synchronization:

**How it works:**
1. When creating a new chat, users can select "Connect to WhatsApp" or "Connect to Slack"
2. A new WhatsApp group or Slack channel is automatically created with the chat name
3. The chat is stored with `connectionType`, `connectionTarget` (group/channel ID), and `connectionName`

**2-Way Sync:**
- **Incoming → Claw:** When messages arrive in the WhatsApp group or Slack channel, configured Claws trigger and execute with the message content
- **Outgoing ← Claw:** When Claude responds in the chat, the response text is forwarded to the connected WhatsApp group or Slack channel (fire-and-forget)

**Key Files:**
- `src/main/lib/claws/whatsapp-trigger.ts` - WhatsApp Web integration using Baileys
- `src/main/lib/claws/slack-trigger.ts` - Slack API integration
- `src/main/lib/trpc/routers/claude.ts` - Forwards Claude responses to connected channels (lines ~1180, ~2165)
- `src/main/lib/trpc/routers/chats.ts` - Chat connection management (`updateConnection`)
- `src/renderer/features/agents/main/new-chat-form.tsx` - Connection setup during chat creation

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
- Drizzle ORM setup with schema (projects, chats, sub_chats, headless_claws)
- Auto-migration on app startup
- tRPC routers structure
- Claws UI restructure (tree view, detail page with tabs)
- Claws filesystem storage (.claw/ directory with living documents)
- clawsSoul database field for SDK system prompt injection

**In Progress:**
- Replacing `mock-api.ts` with real tRPC calls in renderer
- ProjectSelector component (local folder picker)
- Claws History tab implementation (execution log viewer)
- Claws Files tab implementation (living document editor)

**Planned:**
- Git worktree per chat (isolation)
- Claude Code execution in worktree path
- Full feature parity with web app

<<<<<<< Updated upstream
=======
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
>>>>>>> Stashed changes
