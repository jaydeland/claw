# Technology Stack

**Analysis Date:** 2026-02-05

## Languages

**Primary:**
- TypeScript 5.4.5 - All application code (`package.json`)
- TSX/JSX - React components throughout `src/renderer/`

**Secondary:**
- SQL - Drizzle ORM migrations in `drizzle/`
- CSS - Tailwind with custom utilities in `src/renderer/styles/`

## Runtime

**Environment:**
- Node.js 20.x (via Electron main process)
- Chromium (via Electron renderer process)
- Electron 33.4.5 - Desktop app shell (`package.json`)

**Package Manager:**
- bun - Primary package manager (evident from scripts and lockfile)

## Frameworks

**Core:**
- Electron 33.4.5 - Desktop application framework
- React 19.2.1 - UI framework (`package.json`)

**State Management:**
- Jotai 2.11.1 - Atomic state management for UI
- Zustand 5.0.3 - Sub-chat store with persistence
- TanStack Query (React Query) 5.90.10 - Server state caching

**Data Layer:**
- Drizzle ORM 0.45.1 - Type-safe SQL ORM
- better-sqlite3 11.8.1 - SQLite database (native module)
- tRPC 11.7.1 - Type-safe IPC between main/renderer
- trpc-electron 0.1.2 - Electron tRPC adapter

**Build/Dev:**
- electron-vite 3.0.0 - Vite-based Electron build
- Vite 6.3.4 - Development server and bundling
- TypeScript 5.4.5 - Type checking and compilation
- Tailwind CSS 3.4.17 - Utility-first CSS

**Testing:**
- Vitest (via electron-vite) - Test runner
- Tests co-located with source in `__tests__/` directories

## Key Dependencies

**Critical:**
- `@anthropic-ai/claude-agent-sdk` 0.2.12 - Claude Code integration (ESM module, dynamically imported)
- `ai` 6.0.14 + `@ai-sdk/react` 3.0.14 - AI SDK for streaming
- `node-pty` 1.1.0 - Pseudo-terminal for shell integration (native module)
- `zod` 4.0.0 - Schema validation

**Infrastructure:**
- `electron-updater` 6.7.3 - Auto-update functionality
- `simple-git` 3.28.0 - Git operations
- `mermaid` 11.12.2 - Diagram generation
- `shiki` 1.24.4 - Syntax highlighting
- `reactflow` 11.11.4 - Node-based UI flows

**External Integrations:**
- AWS SDK packages (EKS, SSO, STS) - AWS Bedrock and EKS support
- `@xterm/*` packages - Terminal emulator addons

## Configuration

**Environment:**
- No `.env` file in repository (all settings stored in SQLite DB)
- Environment variables for build: `ELECTRON_RENDERER_URL` (dev mode)
- Claude Code credentials stored encrypted with Electron `safeStorage`

**Build:**
- `electron.vite.config.ts` - Vite configuration for main/preload/renderer
- `tsconfig.json` - TypeScript configuration with path alias `@/*` → `src/renderer/*`
- `tailwind.config.ts` - Tailwind with custom theme
- `drizzle.config.ts` - Database migration configuration

## Platform Requirements

**Development:**
- macOS/Windows/Linux (Electron is cross-platform)
- Flox environment available (`.flox/` directory) for reproducible dev setup
- Native modules require compilation: `better-sqlite3`, `node-pty`
- Python 3 required for `electron-rebuild`

**Production:**
- Packaged with electron-builder
- macOS: DMG + ZIP (arm64, x64)
- Windows: NSIS installer + portable
- Linux: AppImage + DEB
- Auto-updater configured (disabled for dev builds)

**Special Build Considerations:**
- Native modules must be rebuilt for Electron: `electron-rebuild -f -w better-sqlite3,node-pty`
- Architecture-specific binaries bundled in `resources/bin/${platform}-${arch}/`
- GSD resources bundled from `resources/gsd/`
- MCP config and plugins bundled

---

*Stack analysis: 2026-02-05*
*Update after major dependency changes*
