# Plan 01: Cloud Models Two-Section UI

## Overview

Split the existing single Ollama models list into two distinct sections: "Available Cloud Models" and "My Models". This is the foundation of Phase 1, enabling the core UI structure for cloud model discovery.

## Goal-Backward Must-Haves

- Two distinct sections visible in Settings > Models when Ollama provider is active
- Available Cloud Models section shows only models NOT in My Models
- My Models section shows user's curated list
- Both sections render correctly with model name, description, and size
- UI is responsive and maintains existing styling patterns

---

## Frontmatter

```yaml
wave: 1
depends_on: []
files_modified:
  - src/renderer/components/dialogs/settings-tabs/agents-models-tab.tsx
autonomous: true
```

---

## Tasks

<task id="1" dependencies="">
  <description>Filter cloud models to exclude already-added models</description>
  <details>
    In agents-models-tab.tsx, compute availableCloudModels by filtering fetched models against userOllamaModels. Pattern: cloudModels.filter(m => !myModels.some(mm => mm.id === m.id)). Use existing combinedOllamaModels computation as reference (lines 225-248).
  </details>
  <acceptance_criteria>
    - availableCloudModels computed correctly
    - Models in userOllamaModels don't appear in availableCloudModels
    - Logic placed before the return statement
    - Handles empty userOllamaModels case (shows all fetched models)
  </acceptance_criteria>
</task>

<task id="2" dependencies="1">
  <description>Rename existing "Cloud Models" section to "My Models"</description>
  <details>
    The existing Ollama Model Management section (lines 429-569) currently shows "Cloud Models" header when isOllamaCloud. Change this to "My Models" with updated description text explaining this is the user's curated list.
  </details>
  <acceptance_criteria>
    - Header changed to "My Models"
    - Description updated to reflect curated list purpose
    - Only shows userOllamaModels (not combinedOllamaModels)
    - Remove manual "Add Model" dialog button from this section header
  </acceptance_criteria>
</task>

<task id="3" dependencies="1">
  <description>Create new "Available Cloud Models" section above My Models</description>
  <details>
    Add a new section above the My Models section that displays availableCloudModels. This section should have its own header "Available Cloud Models" with description text explaining these are models available from Ollama that can be added to My Models. Use similar card styling as existing sections.
  </details>
  <acceptance_criteria>
    - Section appears above My Models
    - Displays availableCloudModels from task 1
    - Shows model name, description, and size for each
    - Empty state handled (no models available)
    - Uses consistent border/card styling with other sections
  </acceptance_criteria>
</task>

<task id="4" dependencies="2,3">
  <description>Update section styling and layout consistency</description>
  <details>
    Ensure both new sections have consistent spacing, borders, and visual hierarchy. Both sections should have: bg-background, rounded-lg, border border-border, overflow-hidden styling matching other settings sections. Spacing between sections should be consistent with rest of tab.
  </details>
  <acceptance_criteria>
    - Both sections use consistent card styling
    - Spacing between sections matches existing patterns
    - Visual hierarchy clear (Available above My)
    - Responsive on narrow screens
  </acceptance_criteria>
</task>

---

## Verification Criteria

### Functional Verification

1. Open Settings > Models with Ollama as active provider
2. Verify two sections appear: "Available Cloud Models" and "My Models"
3. Available Cloud Models should NOT include any models already in My Models
4. Model information displays correctly (name, description, size)
5. Sections maintain styling consistency with rest of settings

### Code Verification

1. availableCloudModels filtering logic is correct and efficient
2. My Models section only shows userOllamaModels
3. No duplicated models between sections
4. Styling uses existing Tailwind patterns
5. TypeScript types are correct (OllamaModelConfig)

### Edge Cases

1. Empty My Models - Available should show all fetched models
2. All models added - Available should be empty
3. API fetch fails - Available should show empty or error state
4. No API key configured - handled gracefully

---

## Rollback Plan

If issues occur:
1. Restore original single-section UI
2. Keep filtering logic for future use
3. Revert header text changes

---

## Dependencies

No dependencies on other plans. This is the foundation plan for Phase 1.

---

## Success Criteria

- [ ] Two distinct sections visible in UI
- [ ] Available Cloud Models correctly excludes My Models
- [ ] My Models shows only user's curated list
- [ ] Both sections styled consistently
- [ ] No visual regressions in other settings sections
