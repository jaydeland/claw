# Plan 02: Add and Remove Model Actions

## Overview

Implement the add/remove functionality that allows users to curate their My Models list by adding from Available Cloud Models and removing from My Models. This enables the core curation workflow of Phase 1.

## Goal-Backward Must-Haves

- User can click "+ Add" button on any Available Cloud Model to add it to My Models
- User can click "Remove" button on any My Model to remove it from their list
- Added models persist across app restarts (already handled by atomWithStorage)
- Model moves visually from Available to My section when added
- Model returns to Available section when removed
- Toast notifications confirm actions

---

## Frontmatter

```yaml
wave: 1
depends_on:
  - 01-cloud-models-ui.md
files_modified:
  - src/renderer/components/dialogs/settings-tabs/agents-models-tab.tsx
autonomous: true
```

---

## Tasks

<task id="1" dependencies="">
  <description>Refactor handleAddModel to accept pre-populated model data</description>
  <details>
    The existing handleAddModel function (lines 276-307) currently uses dialog state. Refactor it to accept a model parameter with id, name, description, and size. Update the logic to check for duplicates against userOllamaModels, then append to ollamaModels array in customClaudeConfigAtom. Keep toast notifications for success/error.
  </details>
  <acceptance_criteria>
    - Function signature accepts OllamaModelConfig or similar
    - Validates model doesn't already exist in userOllamaModels
    - Appends to customConfig.ollamaModels array
    - Updates customClaudeConfigAtom via setCustomConfig
    - Shows success toast on add
    - Shows error toast if duplicate
  </acceptance_criteria>
</task>

<task id="2" dependencies="">
  <description>Enhance handleRemoveModel to handle default model cleanup</description>
  <details>
    The existing handleRemoveModel function (lines 310-319) already removes from ollamaModels. Enhance it to: 1) If removed model was the default (customConfig.model), clear the default, 2) Show toast notification confirming removal, 3) Handle edge case where removing all models should clear default.
  </details>
  <acceptance_criteria>
    - Removes model from customConfig.ollamaModels
    - Clears default model if it was the removed one
    - Shows success toast with model name
    - Works when removing from My Models section
  </acceptance_criteria>
</task>

<task id="3" dependencies="1">
  <description>Add "+ Add" button to Available Cloud Models rows</description>
  <details>
    In the Available Cloud Models section, add a "+ Add" button to each model row. Use Button component with variant="outline" size="sm" and Plus icon from lucide-react. Button should call handleAddModel with the full model data (id, name, description, size) when clicked. Place button on the right side of the row.
  </details>
  <acceptance_criteria>
    - "+ Add" button appears on each Available Cloud Model row
    - Button uses outline variant with Plus icon
    - Clicking adds model to My Models
    - Button is disabled while adding (optional enhancement)
    - Row moves to My Models section after successful add
  </acceptance_criteria>
</task>

<task id="4" dependencies="2">
  <description>Update My Models section to show Remove button per row</description>
  <details>
    The existing My Models section already has remove functionality. Ensure it: 1) Shows trash icon button on each row, 2) Button is clearly visible and accessible, 3) Clicking triggers handleRemoveModel, 4) Row is removed immediately from UI, 5) Model appears back in Available Cloud Models (if it's still in fetched results).
  </details>
  <acceptance_criteria>
    - Trash icon button visible on each My Model row
    - Button uses ghost variant with destructive color
    - Clicking removes model from My Models
    - Model returns to Available Cloud Models section
    - Confirmation toast shown
  </acceptance_criteria>
</task>

<task id="5" dependencies="3,4">
  <description>Remove old "Add Model" dialog UI and state</description>
  <details>
    Remove the Dialog-based "Add Model" button from the My Models header, along with associated state (showAddModelDialog, newModelName, newModelDescription) and the old handleAddModel implementation that used dialog input. Keep only the new function-based approach.
  </details>
  <acceptance_criteria>
    - Dialog and related state removed
    - No manual input form for adding models
    - Add Model button removed from header
    - Clean code without unused imports
  </acceptance_criteria>
</task>

<task id="6" dependencies="5">
  <description>Add visual feedback during add/remove operations</description>
  <details>
    Add subtle loading states or disabled states to buttons during operations. Use isPending pattern from other mutations in the codebase as reference. Ensure UI remains responsive and gives clear feedback that action is in progress.
  </details>
  <acceptance_criteria>
    - Button disabled during add operation
    - Toast notifications for success
    - Immediate visual update (model moves between sections)
    - No UI freezing during operations
  </acceptance_criteria>
</task>

---

## Verification Criteria

### Functional Verification

1. Open Settings > Models with Ollama provider
2. In Available Cloud Models, click "+ Add" on a model
3. Verify model appears in My Models section
4. Verify model disappears from Available Cloud Models
5. Click "Remove" (trash icon) on a model in My Models
6. Verify model returns to Available Cloud Models
7. Verify toast notifications appear for both actions
8. Restart app and verify changes persist

### Code Verification

1. handleAddModel accepts model data parameter
2. handleRemoveModel clears default if needed
3. No duplicate models possible in My Models
4. Old dialog UI completely removed
5. State updates use immutable patterns

### Edge Cases

1. Adding same model twice - shows error toast, no duplicate
2. Removing default model - clears default, shows toast
3. Removing last model - My Models shows empty state
4. Adding while API error - handled gracefully

---

## Rollback Plan

If issues occur:
1. Restore old "Add Model" dialog as fallback
2. Keep both add methods temporarily
3. Revert to single combined list if two-section UI breaks

---

## Dependencies

- Depends on Plan 01 (two-section UI must exist first)
- Uses existing atomWithStorage for persistence

---

## Success Criteria

- [ ] "+ Add" button works on all Available Cloud Models
- [ ] Remove button works on all My Models
- [ ] Models move correctly between sections
- [ ] Persistence works across app restarts
- [ ] Toast notifications confirm all actions
- [ ] No duplicate models possible
- [ ] Old dialog UI removed
