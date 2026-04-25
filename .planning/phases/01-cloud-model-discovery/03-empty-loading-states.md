# Plan 03: Empty and Loading States

## Overview

Implement comprehensive empty and loading states for both Available Cloud Models and My Models sections. This ensures the UI gracefully handles all scenarios: initial loading, API errors, empty lists, and no API key configured.

## Goal-Backward Must-Haves

- Loading state shown while fetching cloud models from API
- Empty state shown when Available Cloud Models has no models
- Empty state shown when My Models is empty
- Error state shown when API fetch fails
- "No API key" state shown when Ollama Cloud not configured
- All states have clear messaging and appropriate icons
- States are visually consistent with app design

---

## Frontmatter

```yaml
wave: 2
depends_on:
  - 01-cloud-models-ui.md
  - 02-add-remove-actions.md
files_modified:
  - src/renderer/components/dialogs/settings-tabs/agents-models-tab.tsx
autonomous: true
```

---

## Tasks

<task id="1" dependencies="">
  <description>Implement loading state for Available Cloud Models fetch</description>
  <details>
    Use the existing isLoadingOllamaModels from trpc.claude.getOllamaModels.useQuery. Show a loading spinner or skeleton UI in the Available Cloud Models section while fetching. The section should show centered loading indicator with "Loading available models..." text. Use Lucide Loader2 icon with animate-spin class.
  </details>
  <acceptance_criteria>
    - Loading state shown while isLoadingOllamaModels is true
    - Uses Loader2 icon with spin animation
    - Shows "Loading available models..." text
    - Centered within the section card
    - My Models section still visible during loading
  </acceptance_criteria>
</task>

<task id="2" dependencies="">
  <description>Create empty state for Available Cloud Models</description>
  <details>
    When availableCloudModels is empty and not loading, show empty state with: Cloud icon from lucide-react, "No available cloud models" heading, descriptive text explaining either all models have been added or no models available from API. Use existing empty state pattern from lines 497-508 as reference.
  </details>
  <acceptance_criteria>
    - Shows when availableCloudModels.length === 0 && !isLoading
    - Uses Cloud icon with muted opacity
    - Heading: "No available cloud models"
    - Description text varies based on context
    - Styled consistently with existing empty states
  </acceptance_criteria>
</task>

<task id="3" dependencies="">
  <description>Create empty state for My Models section</description>
  <details>
    When userOllamaModels is empty, show empty state with: Star or Heart icon, "No models in your list" heading, "Add models from Available Cloud Models to get started" descriptive text. This encourages users to curate their list.
  </details>
  <acceptance_criteria>
    - Shows when userOllamaModels.length === 0
    - Uses appropriate icon (Star or Heart)
    - Heading: "No models in your list"
    - Description explains how to add models
    - Centered in section with padding
  </acceptance_criteria>
</task>

<task id="4" dependencies="">
  <description>Implement API error state for Available Cloud Models</description>
  <details>
    When ollamaModelsData?.success is false, show error state with: AlertTriangle icon from lucide-react, "Failed to load cloud models" heading, error message from API response, "Retry" button that refetches. Use error styling with muted red tones.
  </details>
  <acceptance_criteria>
    - Shows when ollamaModelsData exists but success is false
    - Uses AlertTriangle icon with warning color
    - Displays error message from API
    - Retry button triggers refetch
    - My Models section still accessible
  </acceptance_criteria>
</task>

<task id="5" dependencies="">
  <description>Create "No API Key Configured" state for unconfigured cloud</description>
  <details>
    When activeProvider === "ollama" but no valid baseUrl/ollamaApiKey configured for cloud mode, show state with: Settings icon, "Ollama Cloud not configured" heading, "Visit AI Providers tab to configure Ollama Cloud access" text, link or button to open Providers tab. This guides users to setup.
  </details>
  <acceptance_criteria>
    - Detects when Ollama Cloud is not properly configured
    - Shows Settings or Cloud icon
    - Clear heading and instructional text
    - Link/button to Providers tab
    - Does not show error state, just informational
  </acceptance_criteria>
</task>

<task id="6" dependencies="1,2,3,4,5">
  <description>Ensure state priority and transitions work correctly</description>
  <details>
    Define and implement correct state priority: 1) Not configured check first, 2) Loading state, 3) Error state, 4) Empty states. Ensure smooth transitions between states when data changes. Test all combinations to ensure no conflicting states shown.
  </details>
  <acceptance_criteria>
    - State priority: Not Configured > Loading > Error > Empty
    - Clean transitions when data updates
    - No flickering between states
    - All edge cases covered
    - TypeScript handles all state combinations
  </acceptance_criteria>
</task>

<task id="7" dependencies="6">
  <description>Add "All models added" variation to Available empty state</description>
  <details>
    Distinguish between "no models available from API" vs "all models already added". When fetched models exist but all are in My Models, show "All available models have been added to your list" with CheckCircle icon and positive messaging.
  </details>
  <acceptance_criteria>
    - Detects difference between API empty vs all-added
    - Shows positive messaging when all models added
    - Uses CheckCircle icon
    - Clear distinction between scenarios
  </acceptance_criteria>
</task>

---

## Verification Criteria

### Functional Verification

1. **Loading State**: Throttle network, verify spinner shows while fetching
2. **Empty Available**: Add all models to My Models, verify empty state shows
3. **Empty My Models**: Remove all models, verify empty state with guidance
4. **API Error**: Disconnect network, verify error state with retry button
5. **Not Configured**: Clear API key, verify configuration prompt shows
6. **All Added**: Add all available models, verify positive empty state

### Code Verification

1. State priority logic is clear and correct
2. All state components use consistent styling
3. Icons imported correctly from lucide-react
4. No console errors during state transitions
5. TypeScript types handle all cases

### Edge Cases

1. Loading -> Error transition works
2. Error -> Success (retry) transition works
3. Available empty while My Models has items
4. My Models empty while Available has items
5. Both empty simultaneously

---

## Rollback Plan

If issues occur:
1. Simplify to single generic empty state
2. Remove complex state prioritization
3. Keep only loading and basic empty states

---

## Dependencies

- Depends on Plan 01 (two-section UI structure)
- Depends on Plan 02 (add/remove actions working)
- Uses existing tRPC query patterns

---

## Success Criteria

- [x] Loading state shows while fetching
- [x] Empty state for Available when all models added
- [x] Empty state for My Models when no models
- [x] Error state shows with retry button on API failure
- [x] Not configured state guides users to setup
- [x] State transitions are smooth
- [x] All states have appropriate icons and messaging
- [x] Visual consistency with app design maintained
