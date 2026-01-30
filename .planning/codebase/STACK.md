# Technology Stack

**Analysis Date:** 2025-01-30

## Languages

**Primary:**
- TypeScript 5.4.5 - All source code (main, preload, renderer)

**Secondary:**
- JavaScript - Build scripts in `scripts/` directory
- SQL - Database migrations in `drizzle/` directory

## Runtime

**Environment:**
- Electron 33.4.5 - Desktop application framework
- Node.js (via Electron) - Main process runtime
- Chromium (via Electron) - Renderer process runtime

**Package Manager:**
- Bun ~1.2 (managed by Flox)
- Lockfile: `bun.lockb` present

**Dev Environment:**
- Flox - Reproducible development environment
- Flox provides: bun runtime, electron binary, python311 (for node-gyp)
- Config: `.flox/env/manifest.toml`

## Frameworks

**Core:**
- React 19.2.1 - UI framework for renderer process
- Electron 33.4.5 - Desktop application shell

**Build/Dev:**
- electron-vite 3.0.0 - Electron-specific Vite wrapper (handles main/preload/renderer)
- Vite 6.3.4 - Underlying bundler for renderer
- electron-builder 25.1.8 - Packaging and distribution

**Data:**
- Drizzle ORM 0.45.1 - Database ORM with SQLite
- tRPC 11.7.1 - Type-safe main<->renderer IPC

## Key Dependencies

**Critical:**
- `@anthropic-ai/claude-agent-sdk` ^0.2.12 - Claude AI integration (ESM module, requires dynamic import)
- `better-sqlite3` 11.8.1 - SQLite database driver (native module, needs electron-rebuild)
- `node-pty` ^1.1.0 - Terminal PTY for shell sessions (native module)
- `trpc-electron` ^0.1.2 - tRPC adapter for Electron IPC

**State Management:**
- `jotai` ^2.11.1 - Atomic state management (UI state, selections)
- `zustand` ^5.0.3 - Store-based state (sub-chat tabs, persisted state)
- `@tanstack/react-query` ^5.90.10 - Server state via tRPC

**UI Components:**
- Radix UI (multiple packages) - Headless accessible components
- `lucide-react` ^0.468.0 - Icon library
- `tailwindcss` ^3.4.17 - Utility CSS framework
- `motion` ^11.15.0 - Animation library
- `sonner` ^1.7.1 - Toast notifications
- `reactflow` ^11.11.4 - Flow diagram visualization
- `xterm` ^5.3.0 - Terminal emulator for renderer

**Infrastructure:**
- `simple-git` ^3.28.0 - Git operations
- `chokidar` ^5.0.0 - File system watching
- `electron-log` ^5.4.3 - Logging
- `electron-updater` ^6.7.3 - Auto-updates
- `zod` ^4.0.0 - Schema validation

## Configuration

**Environment Variables:**
- `MAIN_VITE_*` - Main process variables (Sentry DSN, PostHog, API URL)
- `VITE_*` - Renderer process variables (PostHog, feedback URL)
- `.env.example` - Template with all optional variables

**Build Configuration:**
- `electron.vite.config.ts` - Entry points, bundling, CSS
- `tailwind.config.js` - Theme customization
- `tsconfig.json` - TypeScript with bundler module resolution
- `drizzle.config.ts` - Database schema location

**Path Aliases:**
- `@/*` -> `./src/renderer/*` - Renderer imports

## Platform Requirements

**Development:**
- macOS/Linux (Flox environment)
- Bun 1.2+ (via `flox activate`)
- Git for source control
- Python 3.11 for native module compilation (node-gyp)

**Production:**
- macOS: arm64 (Apple Silicon) and x64 (Intel)
- Windows: x64 (NSIS installer + portable)
- Linux: x64 (AppImage + DEB)

**Native Module Handling:**
- `electron-rebuild` runs in postinstall
- `better-sqlite3` and `node-pty` are unpacked from ASAR
- Architecture-specific compilation required

## Build Outputs

**Development:**
- `out/` - Compiled TypeScript (main, preload, renderer)
- Dev server on port 5174

**Production:**
- `release/` - Packaged applications
- `resources/bin/` - Bundled Claude binary per platform
- `resources/migrations/` - Database migrations
- `resources/gsd/` - GSD agent resources

---

*Stack analysis: 2025-01-30*
