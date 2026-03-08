# Fix TypeScript Errors

**Created:** 2026-03-07
**Priority:** High
**Status:** In Progress
**Area:** Code Quality

## Problem

Running `bunx tsc --noEmit` reveals **88 TypeScript errors** across the codebase. These errors indicate type safety issues that could lead to runtime bugs and make refactoring harder.

## Error Categories

| Category | Count | Files Affected |
|----------|-------|----------------|
| Type mismatches (null/undefined) | ~30 | Multiple UI components |
| Missing required props | ~20 | Component interfaces |
| Implicit any types | ~5 | Event handlers, callbacks |
| Module resolution | ~5 | Missing router exports |
| Component prop errors | ~15 | Invalid component props |
| Union type errors | ~10 | Type comparisons with no overlap |
| Generic type errors | ~5 | Generic inference issues |

## Affected Files (by error count)

1. `src/renderer/features/sidebar/agents-sidebar.tsx` - 7 errors
2. `src/renderer/features/analyze/ui/analyze-panel.tsx` - 7 errors
3. `src/renderer/features/analyze/lib/useAnalysisService.ts` - 5 errors
4. `src/renderer/features/github/components/visualize-view.tsx` - 6 errors
5. `src/renderer/features/clusters/ui/devspace-tab.tsx` - 6 errors
6. `src/renderer/features/mcp/ui/mcp-server-detail.tsx` - 5 errors
7. `src/renderer/features/prompts/ui/prompts-view.tsx` - 5 errors
8. `src/renderer/features/workflows/ui/workflow-detail.tsx` - 4 errors
9. `src/renderer/features/agents/ui/agent-diff-view.tsx` - 1 error (complex)
10. `src/renderer/features/agents/main/new-chat-form.tsx` - 1 error
11. Other files - ~20 errors

## Acceptance Criteria

- [ ] `bunx tsc --noEmit` completes with zero errors
- [ ] No `any` types introduced to bypass errors
- [ ] Type changes are semantically correct (not just type assertions)
- [ ] All component interfaces are properly defined
- [ ] Missing modules are exported correctly

## Execution Plan

### Phase 1: Module Resolution (Foundation)
Fix missing exports first so other files can import correctly.
- [ ] `src/renderer/features/analyze/lib/analysis-task-runner.ts` - fix type definition
- [ ] `src/renderer/features/shared/index.ts` - fix export
- [ ] `src/renderer/features/analyze/index.ts` - create/fix analyzer router exports

### Phase 2: Component Prop Types
Fix component interface definitions and prop mismatches.
- [ ] `src/renderer/features/ui/agent-todo-tool.tsx` - fix TodoState type
- [ ] `src/renderer/features/mcp/ui/mcp-server-detail.tsx` - fix isEditing state
- [ ] `src/renderer/features/mcp/ui/mcp-server-dialog.tsx` - fix props
- [ ] `src/renderer/features/gsd/ui/planning-doc-editor.tsx` - fix markdown prop
- [ ] `src/renderer/features/terminal/terminal-tabs.tsx` - fix onCreateTerminal prop

### Phase 3: Null/Undefined Handling
Fix type mismatches with null/undefined values.
- [ ] `src/renderer/features/agents/ui/session-status-bar.tsx` - fix null vs undefined
- [ ] `src/renderer/features/session-flow/ui/session-flow-panel.tsx` - fix null handling
- [ ] `src/renderer/features/github/components/github-tree-pane.tsx` - fix undefined
- [ ] `src/renderer/features/github/components/github-content-pane.tsx` - fix number undefined

### Phase 4: Type Assertions and Generics
Fix unsafe type assertions and generic issues.
- [ ] `src/renderer/features/analyze/ui/analyze-panel.tsx` - fix FlowEdge conversion
- [ ] `src/renderer/features/github/components/visualize-view.tsx` - fix FlowEdge conversion
- [ ] `src/renderer/features/workflows/atoms/index.ts` - fix instanceof and arguments

### Phase 5: Event Handler Types
Add proper types to event handlers and callbacks.
- [ ] `src/renderer/features/github/components/github-chat-pane.tsx` - fix implicit any
- [ ] `src/renderer/features/mcp/ui/mcp-server-dialog.tsx` - fix config param type
- [ ] `src/renderer/features/sidebar/components/execution-history-viewer.tsx` - fix implicit any

### Phase 6: Complex Component Errors
Multi-error files requiring careful refactoring.
- [ ] `src/renderer/features/sidebar/agents-sidebar.tsx` - 7 errors
- [ ] `src/renderer/features/analyze/lib/useAnalysisService.ts` - 5 errors
- [ ] `src/renderer/features/clusters/ui/devspace-tab.tsx` - 6 errors
- [ ] `src/renderer/features/prompts/ui/prompts-view.tsx` - 5 errors
- [ ] `src/renderer/features/workflows/ui/workflow-detail.tsx` - 4 errors

### Phase 7: Remaining Single Errors
- [ ] `src/renderer/features/agents/main/new-chat-form.tsx` - agent vs swarm type
- [ ] `src/renderer/features/agents/ui/agent-diff-view.tsx` - DiffHighlighter type
- [ ] `src/renderer/features/analyze/atoms/index.ts` - Set type
- [ ] `src/renderer/features/analyze/ui/analyze-node-details.tsx` - ReactNode type
- [ ] `src/renderer/features/analyze/ui/analyze-sidebar.tsx` - null check
- [ ] `src/renderer/features/claws/components/claw-chat-view.tsx` - missing prop
- [ ] `src/renderer/features/clusters/ui/dashboard/*.tsx` - recharts formatter types
- [ ] `src/renderer/features/onboarding/*.tsx` - LogoProps fill
- [ ] `src/renderer/features/session-flow/ui/use-paginated-output.ts` - trpc types

## Verification

```bash
# Run type check - should show 0 errors
bunx tsc --noEmit
```

## Notes

- Errors were identified on 2026-03-07 with `bunx tsc --noEmit`
- Some errors may be related to missing type definitions in shared files
- Priority should be given to errors that block other fixes (module exports first)
