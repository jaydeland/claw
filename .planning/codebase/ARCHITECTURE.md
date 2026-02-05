# Architecture

**Analysis Date:** 2026-02-05

## Pattern Overview

**Overall:** Electron Desktop App with Layered Architecture

**Key Characteristics:**
- Multi-process: Main (Node.js) + Renderer (Chromium)
- Type-safe IPC via tRPC
- Local-first SQLite database
- Git worktree isolation per chat
- Plugin system via MCP servers

## Layers

**Main Process (Backend):**
- Purpose: Application lifecycle, native APIs, database, file system
- Contains: tRPC routers, database access, terminal management, git operations
- Location: `src/main/`
- Depends on: Node.js built-ins, Electron APIs, native modules
- Used by: Renderer process via tRPC

**Renderer Process (Frontend):**
- Purpose: React UI, user interactions, display
- Contains: React components, state management, feature modules
- Location: `src/renderer/`
- Depends on: tRPC client, React, state libraries
- Used by: User via Electron window

**IPC Layer (tRPC):**
- Purpose: Type-safe communication between processes
- Contains: Router definitions, procedure implementations
- Location: `src/main/lib/trpc/routers/`
- Depends on: tRPC server, database
- Used by: Renderer components calling API methods

**Data Layer (Drizzle + SQLite):**
- Purpose: Persistent storage with type-safe queries
- Contains: Schema definitions, database initialization
- Location: `src/main/lib/db/`
- Depends on: better-sqlite3, drizzle-orm
- Used by: tRPC routers, background tasks

**Git Layer:**
- Purpose: Repository operations, worktree management, watching
- Contains: Git commands, worktree abstraction, file watching
- Location: `src/main/lib/git/`
- Depends on: simple-git, chokidar (file watching)
- Used by: Chat operations, file browser, change tracking

**Terminal Layer:**
- Purpose: PTY-based shell integration
- Contains: Terminal sessions, port management, xterm.js integration
- Location: `src/main/lib/terminal/`
- Depends on: node-pty, @xterm addons
- Used by: Chat UI for integrated terminal

## Data Flow

**Chat Session Lifecycle:**

1. User creates new chat → `chats` table entry created
2. Sub-chat created per session → `sub_chats` table with messages JSON
3. Claude SDK initialized with project path, worktree, environment
4. User sends message → tRPC `claude.sendMessage` → SDK
5. SDK streams responses → tRPC observable → React state → UI
6. Messages persisted to `sub_chats.messages` JSON column

**Background Task Flow:**

1. Claude SDK spawns background bash task
2. Task metadata stored in `background_tasks` table
3. Task watcher polls for updates via SDK
4. Task status changes → events emitted → UI updates
5. Notifications shown on task completion

**Git Worktree Isolation:**

1. Chat created with associated project (git repository)
2. Worktree automatically created at `~/.21st/worktrees/{chat-id}/`
3. Claude operates in worktree directory (isolated from main working tree)
4. Changes tracked via git status, shown in Changes panel
5. Worktree pruned on chat archival

## Key Abstractions

**tRPC Router:**
- Purpose: API endpoint grouping
- Examples: `src/main/lib/trpc/routers/claude.ts`, `src/main/lib/trpc/routers/git.ts`
- Pattern: Procedures grouped by domain, exported from `src/main/lib/trpc/index.ts`

**Claude Session Manager:**
- Purpose: Manages Claude SDK lifecycle per sub-chat
- Location: `src/main/lib/claude/index.ts`
- Pattern: Dynamic SDK import, streaming transformer, credential injection

**Git Worktree:**
- Purpose: Isolated git working directory per chat
- Location: `src/main/lib/git/worktree.ts`
- Pattern: WorktreeConfig abstraction, auto-cleanup on chat deletion

**Terminal Session:**
- Purpose: Persistent PTY shell per chat
- Location: `src/main/lib/terminal/session.ts`
- Pattern: Port-based communication, shell env inheritance

**Database Repository:**
- Purpose: Type-safe database operations
- Location: `src/main/lib/db/repositories/`
- Pattern: Conductor job/log/checkpoint repositories

## Entry Points

**App Entry:**
- Location: `src/main/index.ts`
- Triggers: Electron app launch
- Responsibilities: Window creation, database init, menu setup, auto-updater

**Renderer Entry:**
- Location: `src/renderer/index.tsx` → `src/renderer/App.tsx`
- Triggers: Electron window loads
- Responsibilities: React mount, providers setup, routing

**tRPC Entry:**
- Location: `src/main/lib/trpc/index.ts`
- Responsibilities: Router composition, context creation, procedure types

**Preload Entry:**
- Location: `src/preload/index.ts`
- Responsibilities: Secure IPC bridge, exposes `desktopApi` + tRPC

## Error Handling

**Strategy:** Errors bubble to tRPC boundaries, logged to console, user notification via toast

**Patterns:**
- tRPC errors serialized and sent to client
- `TRPCProvider` catches errors and shows toast notifications
- Background task errors tracked via `background_tasks.sdk_status`
- Critical errors: database init failure shows dialog, app exits

## Cross-Cutting Concerns

**Logging:**
- `electron-log` for main process (file rotation)
- Console methods in renderer (dev tools)
- Structured logging with `[Component]` prefixes

**Validation:**
- Zod schemas for tRPC inputs
- Type inference from Drizzle schema
- No runtime validation on renderer (types only)

**Authentication:**
- Claude Code: OAuth via browser, token encrypted with `safeStorage`
- AWS Bedrock: SSO or profile credentials, cached with encryption
- MCP Servers: Per-server credentials encrypted in `mcpCredentials` table

**State Persistence:**
- Zustand stores persist to localStorage
- Database persists all application data
- Settings stored in `claudeCodeSettings` table (single row, id="default")

---

*Architecture analysis: 2026-02-05*
*Update when major patterns change*
