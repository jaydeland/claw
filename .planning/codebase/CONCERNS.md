# Codebase Concerns

**Analysis Date:** 2025-01-30

## Tech Debt

**Mock API Bridge Still in Use:**
- Issue: `src/renderer/lib/mock-api.ts` described as "DEPRECATED" in CLAUDE.md, but actively imported by 6+ components
- Files:
  - `src/renderer/lib/mock-api.ts`
  - `src/renderer/features/sidebar/agents-subchats-sidebar.tsx:77`
  - `src/renderer/features/agents/mentions/agents-file-mention.tsx:4`
  - `src/renderer/features/agents/main/active-chat.tsx:91`
  - `src/renderer/features/agents/ui/agents-content.tsx:30`
  - `src/renderer/features/agents/ui/agent-diff-view.tsx:73`
  - `src/renderer/features/agents/ui/sub-chat-selector.tsx:43`
- Impact: Adds complexity with transformation layer between real tRPC and components
- Fix approach: Complete migration to direct tRPC calls, remove mock-api.ts

**Deprecated Atoms Still Exported:**
- Issue: Multiple deprecated atoms exported from atoms files
- Files:
  - `src/renderer/lib/atoms/index.ts:27-29` - `agentsSubChatsSidebarModeAtom`, `agentsSubChatsSidebarWidthAtom`
  - `src/renderer/lib/atoms/index.ts:231` - Legacy single config atom
  - `src/renderer/lib/atoms/index.ts:573` - Legacy backwards compatibility atom
  - `src/renderer/features/agents/atoms/index.ts:349-355` - Same deprecated atoms
  - `src/renderer/features/workflows/atoms/index.ts:199-204` - Deprecated drawer state
- Impact: Code bloat, confusion for developers
- Fix approach: Audit usages, remove if unused, or migrate consumers

**Deprecated Files Not Removed:**
- Issue: File marked as deprecated but still exists
- Files:
  - `src/main/lib/aws/oauth-server.ts` - Contains only `export {}`, marked "can be safely deleted"
- Impact: Unnecessary file in codebase
- Fix approach: Delete the file

**Monster Component:**
- Issue: `active-chat.tsx` at 5798 lines is extremely large
- Files: `src/renderer/features/agents/main/active-chat.tsx`
- Impact: Difficult to maintain, test, and reason about; slow IDE performance
- Fix approach: Extract sub-components, hooks documented in file header show refactoring path

## Known Issues

**Unimplemented TODO Features:**
- `src/renderer/features/terminal/terminal.tsx:156` - "TODO: Open file in editor" not implemented
- `src/renderer/features/terminal/terminal.tsx:224` - "TODO: Set tab title" not implemented
- `src/renderer/features/terminal/terminal.tsx:289` - "TODO: Set focused pane" not implemented
- `src/renderer/features/agents/main/active-chat.tsx:4265` - "TODO: Need to add endpoint that accepts worktreePath directly"
- `src/renderer/features/session-flow/ui/session-flow-sidebar.tsx:73` - "TODO: Implement proper PNG export"
- `src/renderer/features/agents/hooks/use-desktop-notifications.ts:6,9` - Desktop notifications not implemented
- `src/main/lib/analytics.ts:161` - First launch tracking not implemented
- `src/main/lib/trpc/routers/gsd.ts:413,432` - GSD progress not persisted

**MCP Feature Issues (documented in TODO.md):**
- `src/main/lib/trpc/routers/mcp.ts:60` - AUTH pattern too broad, matches AUTHOR, AUTHENTICATE_URL
- `src/renderer/features/mcp/ui/mcp-auth-modal.tsx` - No error toast notifications on failures
- `src/renderer/features/mcp/ui/mcp-auth-modal.tsx:57` - useEffect dependency creates new array each render

**Re-enable Required:**
- `src/renderer/features/agents/main/new-chat-form.tsx:201` - "TODO: Re-enable with better validation logic"
- `src/renderer/features/layout/agents-layout.tsx:122` - "TODO: Re-enable with better logic that doesn't clear on every render"

## Security Considerations

**Base64 Fallback for Credentials:**
- Risk: When `safeStorage.isEncryptionAvailable()` returns false, MCP credentials stored as base64
- Files: `src/main/lib/trpc/routers/mcp.ts:85-91`
- Current mitigation: Uses Electron's safeStorage when available
- Recommendations: Document this limitation; consider refusing to store if encryption unavailable

**TLS Verification Disabled:**
- Risk: Kubernetes connections disable TLS verification
- Files: `src/main/lib/kubernetes/kubernetes-service.ts:78`
- Current mitigation: Only for local development clusters
- Recommendations: Add clear warning in UI; consider user opt-in

**Environment Variable Exposure:**
- Risk: Sensitive env vars could leak to terminals/child processes
- Files: `src/main/lib/terminal/env.ts:164,352`
- Current mitigation: Uses allowlist to filter env vars
- Recommendations: Audit allowlist regularly; add tests for sensitive var filtering

## Performance Bottlenecks

**Large Component Renders:**
- Problem: `active-chat.tsx` (5798 lines) with 37 useEffect hooks may cause excessive re-renders
- Files: `src/renderer/features/agents/main/active-chat.tsx`
- Cause: Complex state management, many effect dependencies
- Improvement path: Continue hook consolidation (doc shows 30% reduction achieved); extract more sub-components

**Console Logging:**
- Problem: 1229 console.log/warn/error calls across 138 files
- Files: Throughout `src/` directory
- Cause: Debug statements left in production code
- Improvement path: Implement proper logging framework; strip console.* in production builds

**Icon Components:**
- Problem: Large icon files with many exports
- Files:
  - `src/renderer/components/ui/icons.tsx` (5743 lines)
  - `src/renderer/components/ui/canvas-icons.tsx` (5090 lines)
- Cause: All icons bundled together
- Improvement path: Consider code-splitting or lazy loading icons

## Fragile Areas

**Mock API Transformation Layer:**
- Files: `src/renderer/lib/mock-api.ts`
- Why fragile: Transforms message formats, tool invocation types between old and new formats
- Safe modification: Test thoroughly; compare message structures before/after changes
- Test coverage: No tests for transformation logic

**Message Format Migration:**
- Files: `src/renderer/lib/mock-api.ts:47-82`
- Why fragile: Migrates "tool-invocation" to "tool-{toolName}" format inline during queries
- Safe modification: Ensure backwards compatibility; test with old message formats
- Test coverage: No tests

**Database Schema:**
- Files: `src/main/lib/db/schema/index.ts:205`
- Why fragile: Contains deprecated `pid` column; schema changes require careful migration
- Safe modification: Follow migration process in CLAUDE.md
- Test coverage: Limited migration tests

## Test Coverage Gaps

**Critical Gap - Only 7 test files for 533 source files:**
- Test files:
  - `src/main/lib/background-tasks/__tests__/session-cleanup.test.ts`
  - `src/main/lib/background-tasks/__tests__/task-lifecycle.test.ts`
  - `src/main/lib/background-tasks/__tests__/watcher.test.ts`
  - `src/main/lib/migrations/__tests__/worktree-location-migration.test.ts`
  - `src/main/lib/trpc/routers/__tests__/pagination-integration.test.ts`
  - `src/main/lib/trpc/routers/__tests__/tasks.test.ts`
  - `src/renderer/features/workflows/lib/markdown-linter.test.ts`
- Risk: Changes to core functionality could break without detection
- Priority: High

**Untested Areas:**
- `src/renderer/features/agents/*` - Main chat interface (no tests)
- `src/main/lib/claude/*` - Claude SDK integration (no tests)
- `src/main/lib/git/*` - Git operations (no tests)
- `src/main/auth-manager.ts` - Authentication flow (no tests)
- `src/renderer/lib/mock-api.ts` - Critical data transformation (no tests)

**MCP Feature:**
- What's not tested: All MCP tRPC procedures
- Files: `src/main/lib/trpc/routers/mcp.ts`
- Risk: Credential handling, server config updates could fail silently
- Priority: Medium (documented in `src/renderer/features/mcp/TODO.md`)

## Type Safety Concerns

**Excessive Type Suppressions:**
- 50+ `@ts-expect-error` comments (mostly for WebKit-specific properties)
- 6+ `eslint-disable` for `@typescript-eslint/no-explicit-any`
- 206 occurrences of `as any)` type casts
- Files: Throughout renderer, especially `src/renderer/features/agents/ui/sub-chat-selector.tsx`
- Risk: Runtime errors from incorrect type assumptions
- Fix approach: Create proper types for WebKit properties; reduce `any` usage

## Dependencies at Risk

**Database Column Deprecation:**
- Package: Schema - `pid` column in tasks table
- Risk: Column marked deprecated but still in schema
- Impact: Confusion, potential data inconsistency
- Migration plan: Remove column after confirming no usage

## Incomplete Features

**Git Worktree Per Chat:**
- Problem: Mentioned in CLAUDE.md as "Planned" but not fully implemented
- Blocks: Full isolation between chat sessions

**ProjectSelector Component:**
- Problem: Marked "In Progress" in CLAUDE.md
- Blocks: Clean project/folder selection UX

**Desktop Notifications:**
- Problem: Placeholder implementations in `use-desktop-notifications.ts`
- Files: `src/renderer/features/agents/hooks/use-desktop-notifications.ts`
- Blocks: User awareness of agent completion

## Timer/Interval Management

**Multiple Background Tasks:**
- Concern: Many setInterval/setTimeout usages across codebase
- Files:
  - `src/main/lib/background-tasks/watcher-v2.ts:54` - setInterval
  - `src/main/lib/terminal/port-manager.ts:57` - setInterval
  - `src/main/lib/background-tasks/watcher-bashoutput.ts:48` - setInterval
  - `src/main/lib/background-tasks/cleanup.ts:288` - setInterval
  - `src/main/auth-manager.ts:166` - setTimeout for refresh timer
- Risk: Memory leaks if not properly cleaned up
- Recommendation: Audit cleanup on app close; ensure clearInterval/clearTimeout called

---

*Concerns audit: 2025-01-30*
