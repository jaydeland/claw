# Architecture

**Analysis Date:** 2025-01-30

## Pattern Overview

**Overall:** Three-tier Electron Architecture with tRPC IPC

**Key Characteristics:**
- Main process handles business logic, database, external APIs, Claude SDK integration
- Preload scripts provide secure bridge between main and renderer processes
- Renderer is a React SPA with feature-based module organization
- tRPC provides type-safe communication across process boundaries
- SQLite (Drizzle ORM) for local-first data persistence

## Layers

**Main Process (`src/main/`):**
- Purpose: Electron main process - app lifecycle, window management, backend logic
- Location: `src/main/`
- Contains: App entry, auth, database, tRPC routers, Claude SDK, git operations, terminal PTY
- Depends on: Electron APIs, better-sqlite3, @anthropic-ai/claude-agent-sdk
- Used by: Renderer (via tRPC IPC), system (via IPC handlers)

**Preload Scripts (`src/preload/`):**
- Purpose: Secure bridge exposing limited APIs to renderer
- Location: `src/preload/index.ts`
- Contains: contextBridge exposures for window.desktopApi, tRPC IPC setup
- Depends on: Electron's contextBridge, ipcRenderer
- Used by: Renderer (via window.desktopApi)

**Renderer (`src/renderer/`):**
- Purpose: React 19 UI with feature-based organization
- Location: `src/renderer/`
- Contains: Components, features, state management (Jotai + Zustand), tRPC client
- Depends on: React, Radix UI, Tailwind, Jotai, Zustand, React Query
- Used by: User (direct interaction)

## Data Flow

**Chat Message Flow:**

1. User types message in `ChatInputArea` component
2. Component dispatches via tRPC mutation (`claude.streamMessage`)
3. Main process receives via tRPC router (`src/main/lib/trpc/routers/claude.ts`)
4. Router spawns Claude SDK session with configured environment
5. SDK streams messages back via tRPC observable
6. Renderer transforms chunks via `createTransformer()` and updates UI
7. Messages persisted to SQLite (sub_chats.messages as JSON)

**State Management:**

- **Jotai:** UI state atoms (selected chat, sidebar, preferences) - persisted via atomWithStorage
- **Zustand:** Complex state with actions (sub-chat tabs, pinning) - localStorage persistence
- **React Query (via tRPC):** Server state caching, automatic invalidation

**IPC Communication:**

1. Renderer calls `trpc.{router}.{procedure}.{query|mutate|subscribe}()`
2. tRPC-electron serializes via superjson over IPC
3. Main process receives, executes procedure, returns result
4. Native features use `window.desktopApi.{method}()` (direct ipcRenderer.invoke)

## Key Abstractions

**Projects:**
- Purpose: Represents a local repository/workspace
- Examples: `src/main/lib/db/schema/index.ts` (projects table), `src/main/lib/trpc/routers/projects.ts`
- Pattern: CRUD via tRPC, selected project stored in Jotai atom

**Chats:**
- Purpose: A workspace/branch context within a project
- Examples: `src/main/lib/db/schema/index.ts` (chats table), `src/main/lib/trpc/routers/chats.ts`
- Pattern: Contains worktree path, branch, PR info; has many sub-chats

**SubChats:**
- Purpose: Individual Claude conversation threads within a chat
- Examples: `src/main/lib/db/schema/index.ts` (sub_chats table), `src/main/lib/trpc/routers/claude.ts`
- Pattern: Contains messages (JSON), sessionId for resume, mode (plan/agent)

**tRPC Routers:**
- Purpose: Type-safe API endpoints for main process operations
- Examples: `src/main/lib/trpc/routers/` (22+ routers)
- Pattern: Each router handles a domain (projects, chats, claude, terminal, git, etc.)

## Entry Points

**Main Process Entry:**
- Location: `src/main/index.ts`
- Triggers: Electron app.whenReady()
- Responsibilities: Database init, auth manager, window creation, protocol registration, background tasks

**Renderer Entry:**
- Location: `src/renderer/App.tsx`
- Triggers: Electron loadURL/loadFile
- Responsibilities: Provider setup (Jotai, Theme, tRPC), routing based on onboarding state

**Window Creation:**
- Location: `src/main/windows/main.ts`
- Triggers: createMainWindow() from main index
- Responsibilities: BrowserWindow config, IPC handler registration, tRPC IPC setup

## Error Handling

**Strategy:** Mixed - exceptions bubble up, UI shows user-friendly errors

**Patterns:**
- tRPC procedures throw errors with structured shape (code, message, data)
- Renderer catches via React Query error states or try/catch
- Claude SDK errors emit special `auth-error` type for OAuth re-auth flow
- Background tasks track status in database, notify on completion/failure

## Cross-Cutting Concerns

**Logging:** Console logging throughout with prefixes ([App], [Auth], [DB], [claude], etc.)

**Validation:** Zod schemas for tRPC inputs, runtime type checking

**Authentication:**
- Desktop auth via OAuth flow (21st.dev)
- Claude Code auth via OAuth or API key (stored encrypted with safeStorage)
- AWS Bedrock auth via SSO flow

**Configuration:**
- Claude Code settings in SQLite (`claude_code_settings` table)
- MCP server config consolidated from multiple sources
- Preferences stored in Jotai atoms (atomWithStorage to localStorage)

## Database Layer

**ORM:** Drizzle with better-sqlite3

**Location:** `{userData}/data/agents.db`

**Schema:** `src/main/lib/db/schema/index.ts`

**Tables:**
- `projects` - Local repositories/workspaces
- `chats` - Workspace contexts with worktree/branch info
- `sub_chats` - Individual Claude conversations (messages as JSON)
- `claude_code_credentials` - Encrypted OAuth token
- `claude_code_settings` - Binary path, MCP settings, auth mode
- `background_tasks` - Tracks long-running commands from Claude
- `app_settings` - Migration tracking, app-level config
- `mcp_credentials` - Encrypted MCP server credentials
- `config_sources` - Custom MCP/plugin config file paths

**Migrations:** Auto-run on app start from `drizzle/` folder (dev) or `resources/migrations` (packaged)

## Claude SDK Integration

**Package:** `@anthropic-ai/claude-agent-sdk`

**Entry:** `src/main/lib/trpc/routers/claude.ts`

**Pattern:**
- Dynamic ESM import (cached after first load)
- Session management with AbortController
- Message streaming via tRPC observable
- Transform layer converts SDK events to UI chunks

**Environment:**
- Built via `buildClaudeEnv()` in `src/main/lib/claude/env.ts`
- Includes OAuth token, MCP config, working directory, custom settings

**Modes:**
- `plan` - Read-only (blocks Bash, NotebookEdit tools)
- `agent` - Full permissions

## Git Integration

**Location:** `src/main/lib/git/`

**Features:**
- Worktree creation/management for branch isolation
- Status tracking with file watcher (`src/main/lib/git/watcher/`)
- Diff parsing and staging operations
- GitHub integration (PR creation, comments)

**Pattern:** Git operations exposed via `changes` tRPC router

## Terminal Integration

**Location:** `src/main/lib/terminal/`

**Features:**
- PTY session management with node-pty
- Port scanning for dev server detection
- History tracking

**Pattern:** Terminal operations exposed via `terminal` tRPC router

---

*Architecture analysis: 2025-01-30*
