# Codebase Structure

**Analysis Date:** 2025-01-30

## Directory Layout

```
wt-claw-11/
├── src/
│   ├── main/                    # Electron main process
│   │   ├── index.ts             # App entry, lifecycle, protocol handling
│   │   ├── auth-manager.ts      # OAuth flow management
│   │   ├── auth-store.ts        # Encrypted credential storage
│   │   ├── windows/             # Window creation and IPC handlers
│   │   └── lib/                 # Main process libraries
│   │       ├── db/              # Drizzle ORM + SQLite
│   │       ├── trpc/            # tRPC router definitions
│   │       ├── claude/          # Claude SDK integration
│   │       ├── git/             # Git operations
│   │       ├── terminal/        # PTY terminal management
│   │       ├── aws/             # AWS SSO integration
│   │       ├── kubernetes/      # K8s cluster operations
│   │       ├── background-tasks/# Long-running task tracking
│   │       ├── config/          # MCP config consolidation
│   │       ├── migrations/      # Data migrations
│   │       ├── mcp/             # MCP tool queries
│   │       └── ollama/          # Offline mode detection
│   ├── preload/
│   │   └── index.ts             # IPC bridge, desktopApi exposure
│   └── renderer/                # React 19 UI
│       ├── App.tsx              # Root component, providers
│       ├── components/          # Shared UI components
│       │   ├── ui/              # Radix UI primitives
│       │   └── dialogs/         # Modal dialogs
│       ├── contexts/            # React contexts
│       ├── features/            # Feature modules
│       │   ├── agents/          # Main chat interface
│       │   ├── sidebar/         # Navigation sidebar
│       │   ├── changes/         # Git diff/staging UI
│       │   ├── terminal/        # Terminal emulator
│       │   ├── layout/          # App layout components
│       │   ├── workflows/       # Workflow automation
│       │   ├── clusters/        # Kubernetes clusters
│       │   ├── session-flow/    # Session visualization
│       │   └── onboarding/      # Onboarding screens
│       └── lib/                 # Renderer utilities
│           ├── atoms/           # Global Jotai atoms
│           ├── stores/          # Zustand stores
│           ├── hooks/           # Custom React hooks
│           ├── themes/          # VS Code theme system
│           └── trpc.ts          # tRPC client setup
├── drizzle/                     # Database migrations
├── resources/                   # App resources (icons, bin)
├── build/                       # Electron builder config
├── scripts/                     # Build/release scripts
└── .planning/                   # GSD planning docs
```

## Directory Purposes

**`src/main/`:**
- Purpose: All Electron main process code
- Contains: Business logic, database access, external API calls
- Key files: `index.ts` (entry), `windows/main.ts` (window setup)

**`src/main/lib/db/`:**
- Purpose: Database layer with Drizzle ORM
- Contains: Schema definitions, init/migration logic, utilities
- Key files: `schema/index.ts` (all tables), `index.ts` (init + getDatabase)

**`src/main/lib/trpc/routers/`:**
- Purpose: All tRPC API endpoints
- Contains: 22+ routers for different domains
- Key files: `index.ts` (router composition), `claude.ts` (main chat), `projects.ts`, `chats.ts`

**`src/main/lib/claude/`:**
- Purpose: Claude SDK integration utilities
- Contains: Environment builder, message transformer, background sessions
- Key files: `env.ts` (buildClaudeEnv), `transform.ts` (createTransformer)

**`src/main/lib/git/`:**
- Purpose: Git operations and file watching
- Contains: Status, staging, diff, worktree, GitHub integration
- Key files: `index.ts` (createGitRouter), `watcher/` (file change detection)

**`src/preload/`:**
- Purpose: Secure IPC bridge for renderer
- Contains: Single entry file exposing desktopApi and tRPC
- Key files: `index.ts` (contextBridge.exposeInMainWorld)

**`src/renderer/features/`:**
- Purpose: Feature-based module organization
- Contains: Self-contained feature modules with their own atoms/stores/components
- Key files: Each feature has `atoms/`, `components/`, `ui/`, `lib/` subdirs

**`src/renderer/features/agents/`:**
- Purpose: Main chat interface (core feature)
- Contains: Chat input, message rendering, tool displays, mentions
- Key files: `main/active-chat.tsx`, `atoms/index.ts`, `ui/agents-content.tsx`

**`src/renderer/features/sidebar/`:**
- Purpose: Left navigation sidebar with tabs
- Contains: Tab bar, workspace list, history, commands, MCP servers
- Key files: `components/` (tab content components)

**`src/renderer/features/changes/`:**
- Purpose: Git diff and staging UI
- Contains: File list, diff viewer, commit UI, merge dialogs
- Key files: `components/file-list/`, `components/diff-full-page-view/`

**`src/renderer/lib/atoms/`:**
- Purpose: Global Jotai atoms and re-exports
- Contains: Settings, preferences, onboarding state
- Key files: `index.ts` (re-exports from features/agents/atoms + global atoms)

**`src/renderer/lib/stores/`:**
- Purpose: Zustand stores for complex state
- Contains: Sub-chat tab management
- Key files: `sub-chat-store.ts`

**`src/renderer/components/ui/`:**
- Purpose: Radix UI primitive wrappers
- Contains: Button, Dialog, Dropdown, Tabs, etc.
- Pattern: Thin wrappers with Tailwind styling

## Key File Locations

**Entry Points:**
- `src/main/index.ts`: Main process entry
- `src/preload/index.ts`: Preload script
- `src/renderer/App.tsx`: Renderer entry
- `src/renderer/main.tsx`: React DOM render

**Configuration:**
- `electron.vite.config.ts`: Build config for main/preload/renderer
- `package.json`: Dependencies and scripts
- `drizzle.config.ts`: Drizzle ORM config
- `tailwind.config.js`: Tailwind CSS config

**Core Logic:**
- `src/main/lib/trpc/routers/claude.ts`: Claude SDK streaming
- `src/main/lib/db/schema/index.ts`: All database tables
- `src/renderer/features/agents/main/active-chat.tsx`: Main chat component
- `src/renderer/features/agents/atoms/index.ts`: Agent UI state

**Testing:**
- `src/main/lib/**/__tests__/`: Main process tests (vitest)
- Pattern: Co-located `__tests__/` folders

## Naming Conventions

**Files:**
- Components: PascalCase (`ActiveChat.tsx`, `AgentsSidebar.tsx`)
- Utilities/hooks: camelCase (`useFileUpload.ts`, `formatters.ts`)
- Stores: kebab-case (`sub-chat-store.ts`)
- Atoms: camelCase with collection suffix (`index.ts` in atoms folders)

**Directories:**
- Features: kebab-case (`agents/`, `session-flow/`)
- Sub-modules: kebab-case (`main/`, `ui/`, `atoms/`)

**Exports:**
- Atoms: camelCase with `Atom` suffix (`selectedAgentChatIdAtom`)
- Stores: `use{Name}Store` pattern (`useAgentSubChatStore`)
- Components: PascalCase (`AgentsLayout`)

## Where to Add New Code

**New Feature:**
- Create directory: `src/renderer/features/{feature-name}/`
- Add subdirs: `atoms/`, `components/`, `ui/`, `lib/`, `hooks/`
- Create atoms in `atoms/index.ts`
- Export main component from `ui/{feature-name}-content.tsx`
- Add tRPC router: `src/main/lib/trpc/routers/{feature}.ts`
- Register router in `src/main/lib/trpc/routers/index.ts`

**New Database Table:**
- Add schema: `src/main/lib/db/schema/index.ts`
- Run `bun run db:generate` to create migration
- Migration auto-applies on next app start

**New tRPC Router:**
- Create file: `src/main/lib/trpc/routers/{name}.ts`
- Export router using `router()` and `publicProcedure`
- Register in `src/main/lib/trpc/routers/index.ts`

**New UI Component:**
- Shared: `src/renderer/components/ui/{name}.tsx`
- Feature-specific: `src/renderer/features/{feature}/components/{name}.tsx`

**New Atom:**
- Global: `src/renderer/lib/atoms/index.ts`
- Feature-specific: `src/renderer/features/{feature}/atoms/index.ts`

**New IPC Handler:**
- Add to `src/main/windows/main.ts` in `registerIpcHandlers()`
- Expose in `src/preload/index.ts` via `contextBridge.exposeInMainWorld`
- Add types to `DesktopApi` interface in preload

**New Main Process Library:**
- Create directory: `src/main/lib/{name}/`
- Add `index.ts` for exports
- Import in routers or main index as needed

## Special Directories

**`drizzle/`:**
- Purpose: Database migration SQL files
- Generated: Yes (via `bun run db:generate`)
- Committed: Yes

**`resources/`:**
- Purpose: App resources bundled with packaged app
- Generated: Partially (VERSION file, migrations copied at build)
- Committed: Yes (bin/, icons)

**`build/`:**
- Purpose: Electron builder icon resources
- Generated: No
- Committed: Yes

**`release/`:**
- Purpose: Build output (DMGs, ZIPs)
- Generated: Yes (via packaging)
- Committed: No (gitignored)

**`node_modules/`:**
- Purpose: Dependencies
- Generated: Yes (via `bun install`)
- Committed: No (gitignored)

**`out/`:**
- Purpose: Compiled output
- Generated: Yes (via `bun run build`)
- Committed: No (gitignored)

**`.planning/`:**
- Purpose: GSD planning and codebase analysis docs
- Generated: By GSD tools
- Committed: Yes

---

*Structure analysis: 2025-01-30*
