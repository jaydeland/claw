# Fix TypeScript Errors

**Created:** 2026-03-07
**Priority:** High
<<<<<<< Updated upstream
**Status:** In Progress (461 errors - type exports fixed, implicit `any` revealed)
**Last Updated:** 2026-03-09
=======
**Status:** Nearly Complete (2 errors remaining)
**Last Updated:** 2026-03-08
>>>>>>> Stashed changes
**Area:** Code Quality

## Problem

Running `bunx tsc --noEmit` reveals **461 TypeScript errors** across the codebase. These errors indicate type safety issues that could lead to runtime bugs and make refactoring harder.

## Current Status (2026-03-09)

**Progress:** Fixed original 88 errors + type export issues + 52 implicit `any` errors
**Remaining:** 409 errors (all TS7006 implicit `any` in callbacks)

### Completed Files (error-free)
- [x] `agents-providers-tab.tsx` (13 errors fixed)
- [x] `agents-slack-tab.tsx` (9 errors fixed)
- [x] `agents-advanced-settings-tab.tsx` (6 errors fixed)
- [x] `agents-debug-tab.tsx` (10 errors fixed)
- [x] `whatsapp-bridge-manager.tsx` (9 errors fixed)
- [x] `agents-thinking-dialog.tsx` (import path fixes)

### Summary of Changes Made

1. **Fixed devspace-tab.tsx** (line 87): Changed `trpc.terminal.isSessionAlive({...})` to `trpcClient.terminal.isSessionAlive.query(...)` and imported `trpcClient`
2. **Fixed chat-input-area.tsx**: Added missing `onRetryAfterApiError` to props destructuring
3. **Fixed type exports in tRPC routers** (required for proper type inference):
   - `analyzer.ts`: Exported `DiagramUpdate` and `JobUpdate` interfaces
   - `tasks.ts`: Exported `EnhancedTask` interface
   - `commands.ts`: Exported `FileCommand` interface
   - `skills.ts`: Exported `FileSkill` interface
   - `gitnexus.ts`: Exported `GitNexusRepo` interface
   - `gsd.ts`: Exported `GsdCommand` interface
   - `loaded-context.ts`: Exported `LoadedContextData` interface
4. **Fixed trpc.ts**: Added explicit type annotation `CreateTRPCReact<AppRouter, unknown, null>`
5. **Fixed many component files** with type annotations for event handlers and props

### Error Category Breakdown

After fixing the type export issues, TypeScript can now properly type-check the entire codebase, revealing **461 implicit `any` errors**. These are primarily:
- `TS7006: Parameter 'x' implicitly has an 'any' type` in `.catch()`, `.then()`, `.map()`, `.filter()`, `.forEach()` callbacks
- Missing type annotations on function parameters in array methods

### Top Error Patterns

| Pattern | Count |
|---------|-------|
| `Parameter 'error' implicitly has an 'any' type` | 68 |
| `Parameter 'p' implicitly has an 'any' type` | 41 |
| `Parameter 'err' implicitly has an 'any' type` | 26 |
| `Parameter 'result' implicitly has an 'any' type` | 21 |
| `Parameter 'data' implicitly has an 'any' type` | 21 |

### Top Files by Error Count

| File | Errors |
|------|--------|
| `src/renderer/features/sidebar/components/workspaces-tab-content.tsx` | 27 |
| `src/renderer/features/sidebar/agents-sidebar.tsx` | 16 |
| `src/renderer/features/sidebar/components/history-tab-content.tsx` | 14 |
| `src/renderer/features/gsd/ui/gsd-planning-right-panel.tsx` | 13 |
| `src/renderer/components/dialogs/settings-tabs/agents-providers-tab.tsx` | 13 |
| `src/renderer/features/workflows/ui/workflow-mcp-view.tsx` | 12 |
| `src/renderer/features/agents/components/project-selector.tsx` | 12 |
| `src/renderer/components/dialogs/settings-tabs/agents-slack-tab.tsx` | 12 |
| `src/renderer/components/dialogs/settings-tabs/agents-advanced-settings-tab.tsx` | 11 |
| `src/renderer/features/gsd/ui/gsd-content.tsx` | 10 |

## Current Status (2026-03-08)

**Progress:** 86/88 errors fixed (97.7% complete)

**Remaining Errors:**
1. `src/renderer/features/clusters/ui/dashboard/resource-chart.tsx:51` - Recharts formatter type mismatch (name param can be undefined)
2. `src/renderer/features/terminal/terminal-main-view.tsx:231` - Missing `onCreateTerminal` prop on TerminalTabs component

## Error Categories

| Category | Count | Files Affected |
|----------|-------|----------------|
| Implicit any types (TS7006) | ~440 | Event handlers, callbacks, array methods |
| Type mismatches (TS2345) | ~5 | Argument type mismatches |
| Type assignability (TS2322) | ~5 | Type 'unknown' not assignable |
| Generic type errors (TS2314) | ~1 | Missing type arguments |
| Other | ~10 | Various edge cases |

## Affected Files (by error count - top 20)

1. `src/renderer/features/sidebar/components/workspaces-tab-content.tsx` - 27 errors
2. `src/renderer/features/sidebar/agents-sidebar.tsx` - 16 errors
3. `src/renderer/features/sidebar/components/history-tab-content.tsx` - 14 errors
4. `src/renderer/features/gsd/ui/gsd-planning-right-panel.tsx` - 13 errors
5. `src/renderer/components/dialogs/settings-tabs/agents-providers-tab.tsx` - 13 errors
6. `src/renderer/features/workflows/ui/workflow-mcp-view.tsx` - 12 errors
7. `src/renderer/features/agents/components/project-selector.tsx` - 12 errors
8. `src/renderer/components/dialogs/settings-tabs/agents-slack-tab.tsx` - 12 errors
9. `src/renderer/components/dialogs/settings-tabs/agents-advanced-settings-tab.tsx` - 11 errors
10. `src/renderer/features/gsd/ui/gsd-content.tsx` - 10 errors
11. `src/renderer/features/github/components/github-content-pane.tsx` - 10 errors
12. `src/renderer/components/dialogs/settings-tabs/agents-debug-tab.tsx` - 10 errors
13. `src/renderer/features/workflows/ui/workflow-tree.tsx` - 9 errors
14. `src/renderer/features/sidebar/components/claw-form.tsx` - 9 errors
15. `src/renderer/features/sidebar/components/cc-settings-tab-content.tsx` - 9 errors
16. `src/renderer/features/mcp/ui/mcp-auth-modal.tsx` - 9 errors
17. `src/renderer/components/dialogs/settings-tabs/whatsapp-bridge-manager.tsx` - 9 errors
18. `src/renderer/features/prompts/ui/prompts-view.tsx` - 8 errors
19. `src/renderer/features/onboarding/select-repo-page.tsx` - 8 errors
20. `src/renderer/features/gitnexus/components/gitnexus-view.tsx` - 8 errors

## Acceptance Criteria

- [ ] `bunx tsc --noEmit` completes with zero errors
- [ ] No `any` types introduced to bypass errors
- [ ] Type changes are semantically correct (not just type assertions)
- [ ] All component interfaces are properly defined
- [ ] Missing modules are exported correctly

## Execution Plan

### Phase 1: Settings Dialog Tabs (High Impact)
These files have the most errors and fixing them will clear a large portion of issues.
- [ ] `agents-providers-tab.tsx` - 13 errors (error callbacks, map params)
- [ ] `agents-slack-tab.tsx` - 12 errors (error callbacks, data params)
- [ ] `agents-advanced-settings-tab.tsx` - 11 errors (error callbacks, config params)
- [ ] `agents-debug-tab.tsx` - 10 errors (error/data callbacks)
- [ ] `whatsapp-bridge-manager.tsx` - 9 errors (error/data callbacks)

### Phase 2: Sidebar Components (High Impact)
- [ ] `workspaces-tab-content.tsx` - 27 errors (mostly `p`, `chat`, `project` params)
- [ ] `agents-sidebar.tsx` - 16 errors (error callbacks, destructuring)
- [ ] `history-tab-content.tsx` - 14 errors (error/data callbacks)
- [ ] `claw-form.tsx` - 9 errors
- [ ] `cc-settings-tab-content.tsx` - 9 errors

### Phase 3: Feature Components (Medium Impact)
- [ ] `gsd-planning-right-panel.tsx` - 13 errors
- [ ] `gsd-content.tsx` - 10 errors
- [ ] `workflow-mcp-view.tsx` - 12 errors
- [ ] `workflow-tree.tsx` - 9 errors
- [ ] `project-selector.tsx` - 12 errors

### Phase 4: GitHub & MCP Components
- [ ] `github-content-pane.tsx` - 10 errors
- [ ] `mcp-auth-modal.tsx` - 9 errors
- [ ] `prompts-view.tsx` - 8 errors
- [ ] `gitnexus-view.tsx` - 8 errors

### Phase 5: Onboarding Pages
- [ ] `select-repo-page.tsx` - 8 errors
- [ ] `api-key-onboarding-page.tsx` - 7 errors
- [ ] `anthropic-onboarding-page.tsx` - 6 errors

**Current Progress: 461 → 409 errors (52 fixed)**

<<<<<<< Updated upstream
### Completed (Error-Free)
| File | Errors Fixed |
|------|--------------|
| `agents-providers-tab.tsx` | 13 |
| `agents-slack-tab.tsx` | 9 |
| `agents-advanced-settings-tab.tsx` | 6 |
| `agents-debug-tab.tsx` | 10 |
| `whatsapp-bridge-manager.tsx` | 9 |
| `agents-thinking-dialog.tsx` | Import paths |

### Remaining Top Files
| File | Errors | Priority |
|------|--------|----------|
| `workspaces-tab-content.tsx` | 27 | High |
| `agents-sidebar.tsx` | 16 | High |
| `history-tab-content.tsx` | 14 | High |
| `gsd-planning-right-panel.tsx` | 13 | Medium |
| `workflow-mcp-view.tsx` | 12 | Medium |
| `project-selector.tsx` | 12 | Medium |

## Recommended Approach

Given the repetitive nature of these errors, I recommend using **sed/awk scripts** for bulk fixing:

### Pattern 1: Error callbacks in mutations
```bash
find src -name "*.tsx" -exec sed -i '' 's/onError: (error) =>/onError: (error: Error) =>/g' {} \;
```

### Pattern 2: Common map/filter parameters
```bash
# For project parameters
find src -name "*.tsx" -exec sed -i '' 's/\.map(project =>/\.map((project: { id: string; name: string; path: string }) =>/g' {} \;

# For chat parameters
find src -name "*.tsx" -exec sed -i '' 's/\.map(chat =>/\.map((chat: { id: string; name: string }) =>/g' {} \;
```

### Pattern 3: tRPC onSuccess data callbacks
Add explicit types based on the router return types (requires checking each router).

**Continue fixing remaining files?** (This will take significant time due to 357 remaining errors across 60+ files)

## Execution Plan Options

### Option A: Continue Manual Fixes (Time: ~2-3 hours)
I can continue fixing files one by one. Most productive for high-impact files first.

### Option B: Automated Bulk Fix (Time: ~30 min)
Create and run sed scripts for common patterns, then manually fix remaining edge cases.

### Option C: Disable strict mode temporarily (Time: 5 min)
Set `"noImplicitAny": false` in `tsconfig.json` to unblock development, fix errors gradually.

## Next Steps
=======
### Phase 7: Remaining Single Errors
- [x] `src/renderer/features/agents/main/new-chat-form.tsx` - agent vs swarm type
- [x] `src/renderer/features/agents/ui/agent-diff-view.tsx` - DiffHighlighter type
- [x] `src/renderer/features/analyze/atoms/index.ts` - Set type
- [x] `src/renderer/features/analyze/ui/analyze-node-details.tsx` - ReactNode type
- [x] `src/renderer/features/analyze/ui/analyze-sidebar.tsx` - null check
- [x] `src/renderer/features/claws/components/claw-chat-view.tsx` - missing prop
- [ ] `src/renderer/features/clusters/ui/dashboard/resource-chart.tsx` - recharts formatter types (1 error remaining)
- [x] `src/renderer/features/onboarding/*.tsx` - LogoProps fill
- [x] `src/renderer/features/session-flow/ui/use-paginated-output.ts` - trpc types

### Phase 8: Final Errors
- [ ] `src/renderer/features/terminal/terminal-main-view.tsx` - Missing `onCreateTerminal` prop
- [ ] `src/renderer/features/clusters/ui/dashboard/resource-chart.tsx` - Recharts formatter `name` parameter can be undefined
>>>>>>> Stashed changes

## Verification

```bash
# Run type check - should show 0 errors
bunx tsc --noEmit
```

## Notes

- Errors were identified on 2026-03-07 with `bunx tsc --noEmit`
- Some errors may be related to missing type definitions in shared files
- Priority should be given to errors that block other fixes (module exports first)
