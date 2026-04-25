# Codebase Concerns

**Analysis Date:** 2026-02-05

## Tech Debt

**Large tRPC router files:**
- Issue: `src/main/lib/trpc/routers/claude.ts` is 1000+ lines with multiple concerns
- Files: `src/main/lib/trpc/routers/claude.ts`, `src/main/lib/trpc/routers/git.ts`
- Why: Rapid feature addition without refactoring
- Impact: Difficult to navigate, test, and maintain
- Fix approach: Extract handlers to `src/main/lib/handlers/` directory

**TODO comments throughout codebase:**
- Issue: 30+ TODOs indicating incomplete work
- Files: `src/main/lib/trpc/routers/gsd.ts:628`, `src/renderer/features/*/`
- Why: Feature flags for future work, temporary workarounds
- Impact: Unknown which TODOs are critical vs cosmetic
- Fix approach: Audit TODOs, create issues for important ones, remove stale ones

**Mixed auth implementations:**
- Issue: Three auth modes (OAuth, API key, AWS) with different credential handling
- Files: `src/main/lib/claude/index.ts`, `src/main/lib/aws/sso-service.ts`
- Why: Supporting multiple Claude providers
- Impact: Complex credential management, potential security gaps
- Fix approach: Abstract credential interface, consistent encryption

## Known Issues

**Native module architecture issues:**
- Symptoms: App crashes with "mach-o file, but is an incompatible architecture"
- Files: `node_modules/better-sqlite3/`, `node_modules/node-pty/`
- Trigger: Switching between Intel/Apple Silicon Macs, cache corruption
- Workaround: `rm -rf node_modules/better-sqlite3 && bun install`
- Root cause: Native modules compiled for wrong architecture

**MCP TODO documentation:**
- Issue: Dedicated TODO file for MCP feature
- File: `src/renderer/features/mcp/TODO.md`
- Impact: Indicates incomplete MCP implementation

**Disabled features with TODOs:**
- Issue: Code commented out with TODO for re-enabling
- Files: `src/renderer/features/agents/main/new-chat-form.tsx:189`
- Impact: Unclear if features should be enabled or removed

## Security Considerations

**Credential encryption:**
- Risk: Multiple credential types stored, encryption surface area large
- Current mitigation: Electron safeStorage for all sensitive data
- Files: `src/main/lib/db/schema/index.ts` (claudeCodeSettings, mcpCredentials)
- Recommendations: Audit all credential paths, add credential rotation

**Git operations without sandboxing:**
- Risk: Git commands execute in user environment with full permissions
- Current mitigation: Path validation in `src/main/lib/git/security/`
- Files: `src/main/lib/git/git-operations.ts`
- Recommendations: Continue hardening path validation, consider git hooks

**Terminal PTY spawning:**
- Risk: Full shell access via terminal feature
- Current mitigation: User's own shell, no privilege escalation
- Files: `src/main/lib/terminal/session.ts`
- Recommendations: Document security model clearly

## Performance Concerns

**Large JSON columns:**
- Issue: Messages stored as JSON text in SQLite
- Files: `src/main/lib/db/schema/index.ts` (subChats.messages)
- Measurement: Could grow large for long conversations
- Cause: Simpler schema, but poor query performance on message content
- Improvement path: Consider message pagination, separate table

**React re-renders:**
- Issue: Active chat component is large (4000+ lines)
- Files: `src/renderer/features/agents/main/active-chat.tsx`
- Measurement: Potential render performance issues
- Cause: Complex state management in single component
- Improvement path: Extract sub-components, optimize with memo

**Git status polling:**
- Issue: File watching may be resource intensive for large repos
- Files: `src/main/lib/git/watcher/git-watcher.ts`
- Cause: chokidar watching all files in project
- Improvement path: Debounce, exclude patterns

## Fragile Areas

**Native module dependencies:**
- Files: `better-sqlite3`, `node-pty`
- Why fragile: Require compilation, platform-specific, Electron version sensitive
- Common failures: Build failures, architecture mismatches
- Safe modification: Test on all platforms, use `electron-rebuild`

**Claude SDK integration:**
- Files: `src/main/lib/claude/index.ts`, `src/main/lib/trpc/routers/claude.ts`
- Why fragile: ESM-only module, requires dynamic import, streaming complex
- Common failures: Import errors, stream handling bugs
- Safe modification: Test thoroughly with all auth modes

**Worktree management:**
- Files: `src/main/lib/git/worktree.ts`
- Why fragile: Git worktrees can become orphaned, disk state mismatches
- Common failures: Orphaned worktrees, pruned while in use
- Safe modification: Add worktree health checks on startup

## Dependencies at Risk

**node-pty:**
- Risk: Native module maintenance, Node.js version compatibility
- Impact: Terminal feature breaks without it
- Mitigation: electron-rebuild handles compilation

**@anthropic-ai/claude-agent-sdk:**
- Risk: Proprietary SDK, version compatibility
- Impact: Core AI functionality
- Mitigation: Version pinned, bundled with app

**electron-updater:**
- Risk: Auto-update signature validation
- Impact: Security critical for updates
- Mitigation: Proper code signing configured

## Missing Critical Features

**Comprehensive test coverage:**
- Problem: Only 7 test files for large codebase
- Current workaround: Manual testing
- Blocks: Safe refactoring, CI/CD confidence
- Implementation complexity: High (native modules, Electron environment)

**E2E testing:**
- Problem: No automated E2E tests for critical flows
- Current workaround: Manual testing
- Blocks: Regression detection
- Implementation complexity: Medium (Playwright with Electron)

## Documentation Gaps

**Architecture documentation:**
- Gap: No high-level architecture diagram
- Impact: New contributors struggle to understand data flow
- Files: README.md has some, but incomplete

**Conductor feature:**
- Gap: Limited documentation for Conductor multi-agent system
- Files: `src/main/lib/conductor/`
- Impact: Complex feature hard to understand

---

*Concerns audit: 2026-02-05*
*Update as issues are fixed or new ones discovered*
