# Codebase Structure

**Analysis Date:** 2026-02-05

## Directory Layout

```
claw/
├── src/
│   ├── main/                    # Electron main process (backend)
│   │   ├── index.ts             # App entry point
│   │   ├── lib/
│   │   │   ├── db/              # Drizzle ORM + SQLite
│   │   │   ├── trpc/routers/    # tRPC API routes
│   │   │   ├── claude/          # Claude SDK integration
│   │   │   ├── git/             # Git operations + worktrees
│   │   │   ├── terminal/        # PTY terminal management
│   │   │   ├── background-tasks/# Task tracking + watching
│   │   │   ├── conductor/       # Conductor multi-agent system
│   │   │   ├── config/          # MCP config consolidation
│   │   │   ├── mcp/             # MCP server integration
│   │   │   ├── aws/             # AWS SSO/EKS integration
│   │   │   ├── kubernetes/      # Kubernetes service
│   │   │   └── swarm/           # Swarm agent management
│   │   └── windows/
│   │       └── main.ts          # Main window creation
│   ├── preload/                 # IPC bridge (context isolation)
│   │   └── index.ts             # Exposes desktopApi + tRPC
│   ├── renderer/                # React UI (frontend)
│   │   ├── App.tsx              # Root component
│   │   ├── components/          # Shared UI components
│   │   ├── features/            # Feature modules
│   │   │   ├── agents/          # Main chat interface
│   │   │   ├── conductor/       # Conductor job UI
│   │   │   ├── terminal/        # Terminal UI
│   │   │   ├── changes/         # Git changes panel
│   │   │   ├── sub-chats/       # Sub-chat management
│   │   │   ├── sidebar/         # Navigation sidebar
│   │   │   └── workflows/       # Workflow/linter utilities
│   │   ├── lib/                 # Utilities + stores + atoms
│   │   └── styles/              # CSS + Tailwind
│   └── shared/                  # Shared types (main/renderer)
├── drizzle/                     # Database migrations (30+ files)
├── resources/                   # Bundled resources
│   ├── agents/swarm/            # Swarm agent definitions
│   ├── gsd/                     # GSD system files
│   └── bin/                     # Platform-specific binaries
├── build/                       # Build resources (icons, entitlements)
├── out/                         # Build output (gitignored)
└── release/                     # Packaged app output (gitignored)
```

## Directory Purposes

**src/main/:**
- Purpose: Electron main process - Node.js backend
- Contains: App lifecycle, native APIs, database, tRPC server
- Key files: `index.ts` (entry), `lib/trpc/routers/*.ts` (API)
- Subdirectories: All backend functionality organized by domain

**src/preload/:**
- Purpose: Secure bridge between main and renderer
- Contains: IPC context bridge, tRPC link setup
- Key files: `index.ts` (exposes safe APIs to renderer)

**src/renderer/:**
- Purpose: React frontend - user interface
- Contains: Components, features, state management
- Key files: `App.tsx` (root), `features/agents/main/active-chat.tsx` (main UI)
- Subdirectories: Organized by feature domains

**src/renderer/features/agents/:**
- Purpose: Core chat functionality
- Contains: Message display, input handling, Claude integration UI
- Key files: `main/active-chat.tsx`, `main/chat-input-area.tsx`

**src/renderer/features/conductor/:**
- Purpose: Multi-agent orchestration UI
- Contains: Kanban board, job management, detail panels
- Key files: `ui/conductor-kanban.tsx`, `ui/conductor-detail-panel.tsx`

**drizzle/:**
- Purpose: Database schema migrations
- Contains: 30+ SQL migration files
- Key files: `meta/` (migration journal)
- Pattern: Drizzle Kit generates, app auto-migrates on startup

**resources/:**
- Purpose: Files bundled with packaged app
- Contains: GSD commands, swarm agents, binaries
- Key files: Copied to `resources/` in packaged app

## Key File Locations

**Entry Points:**
- `src/main/index.ts` - Electron main process entry
- `src/preload/index.ts` - Preload script entry
- `src/renderer/index.tsx` - React entry point

**Configuration:**
- `package.json` - Dependencies, scripts, electron-builder config
- `electron.vite.config.ts` - Vite build configuration
- `tsconfig.json` - TypeScript configuration
- `tailwind.config.ts` - Tailwind CSS configuration
- `drizzle.config.ts` - Database migration configuration

**Core Logic:**
- `src/main/lib/db/schema/index.ts` - Database schema (source of truth)
- `src/main/lib/trpc/routers/claude.ts` - Claude SDK integration
- `src/main/lib/claude/index.ts` - Claude session management
- `src/main/lib/git/worktree.ts` - Worktree operations

**UI Components:**
- `src/renderer/features/agents/main/active-chat.tsx` - Main chat interface
- `src/renderer/components/ui/*.tsx` - Radix UI wrapper components

**Tests:**
- `src/main/lib/**/__tests__/*.test.ts` - Unit tests co-located with source
- Pattern: 7 test files found in background-tasks, migrations, trpc routers

## Naming Conventions

**Files:**
- `kebab-case.ts` - Utility files, config files
- `PascalCase.tsx` - React components
- `*.test.ts` - Test files (co-located with source)
- `index.ts` - Barrel exports

**Functions/Variables:**
- `camelCase` - Functions, variables
- `PascalCase` - React components, TypeScript types/interfaces
- `UPPER_SNAKE_CASE` - Constants, environment variable names

**Directories:**
- `kebab-case` - All directories
- Feature directories plural: `features/`, `components/`, `lib/`

**Special Patterns:**
- `active-*.tsx` - Main feature components
- `use-*.ts` - React hooks
- `*-store.ts` - Zustand stores
- `*-atom.ts` / `*Atom` - Jotai atoms
- `*.router.ts` / `router.ts` - tRPC routers

## Where to Add New Code

**New Feature:**
- Backend logic: `src/main/lib/{feature}/`
- UI components: `src/renderer/features/{feature}/`
- Types: Add to existing schema or create `src/shared/types/`

**New tRPC Router:**
- Router file: `src/main/lib/trpc/routers/{name}.ts`
- Registration: Add to `src/main/lib/trpc/index.ts`

**New Database Table:**
- Schema: `src/main/lib/db/schema/index.ts` or `src/main/lib/db/schema/{domain}.ts`
- Migration: `bun run db:generate` creates file in `drizzle/`

**New UI Component:**
- Shared: `src/renderer/components/ui/{name}.tsx`
- Feature-specific: `src/renderer/features/{feature}/components/{name}.tsx`

**New Test:**
- Location: `__tests__/` directory adjacent to source file
- Naming: `{source-file}.test.ts`

## Special Directories

**out/:**
- Purpose: Build artifacts (main, preload, renderer compiled output)
- Source: electron-vite build
- Committed: No (in .gitignore)

**release/:**
- Purpose: Packaged application output
- Source: electron-builder
- Committed: No (in .gitignore)

**resources/bin/:**
- Purpose: Platform-specific Claude Code binaries
- Source: Downloaded via `scripts/download-claude-binary.mjs`
- Committed: No (binaries are large, downloaded on build)

**drizzle/meta/:**
- Purpose: Migration journal tracking
- Source: Drizzle Kit
- Committed: Yes (required for migration state)

---

*Structure analysis: 2026-02-05*
*Update when directory structure changes*
