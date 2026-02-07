# Phase 1: Cloud Model Discovery - Research Findings

## Executive Summary

This document provides a comprehensive analysis of the current Ollama integration in the Claw Electron app, identifying existing patterns, components, and APIs that can be leveraged for Phase 1 implementation.

---

## 1. Current State Analysis

### 1.1 Ollama Configuration Storage

**Location:** `src/renderer/lib/atoms/index.ts`

The current Ollama configuration is stored using Jotai's `atomWithStorage` for persistence across app restarts:

```typescript
// Lines 186-201
export interface OllamaModelConfig {
  id: string
  name: string
  description?: string
  size?: string
  isPulled?: boolean // Whether the model has been pulled locally
}

export type CustomClaudeConfig = {
  model: string
  token: string
  baseUrl: string
  apiKey?: string
  ollamaApiKey?: string
  ollamaModels?: OllamaModelConfig[] // User's selected/favorite Ollama models
}

// Legacy single config (deprecated, kept for backwards compatibility)
export const customClaudeConfigAtom = atomWithStorage<CustomClaudeConfig>(
  "agents:claude-custom-config",
  {
    model: "",
    token: "",
    baseUrl: "",
    apiKey: "",
    ollamaApiKey: "",
  },
  undefined,
  { getOnInit: true },
)
```

**Key Observations:**
- `ollamaModels` array already exists and is persisted to localStorage
- Uses `atomWithStorage` with key `"agents:claude-custom-config"`
- `isPulled` flag exists but is not actively used for cloud models
- Configuration includes baseUrl and ollamaApiKey for cloud access

### 1.2 Provider Detection

**Location:** `src/renderer/lib/atoms/index.ts` (Lines 244-259)

```typescript
export type AIProvider = "anthropic-oauth" | "aws-bedrock" | "ollama" | "custom-api" | null

export const activeProviderAtom = atomWithStorage<AIProvider>(
  "agents:active-provider",
  "anthropic-oauth",
  undefined,
  { getOnInit: true },
)
```

The app tracks the active provider separately from the configuration, allowing users to switch between providers.

### 1.3 Ollama Mode Detection

**Pattern found in:** `src/renderer/components/dialogs/settings-tabs/agents-models-tab.tsx` (Lines 213-219)

```typescript
const isOllamaCloud = customConfig.baseUrl === "https://ollama.com" ||
  customConfig.baseUrl?.includes("api.ollama.com") ||
  customConfig.baseUrl?.includes("ollama.com")
const isOllamaLocal = customConfig.baseUrl?.includes("localhost") ||
  customConfig.baseUrl?.includes("127.0.0.1")
const ollamaMode: "cloud" | "local" | "custom" = isOllamaCloud ? "cloud" : isOllamaLocal ? "local" : "custom"
```

---

## 2. Existing API for Cloud Models

### 2.1 tRPC Endpoint

**Location:** `src/main/lib/trpc/routers/claude.ts` (Lines 474-539)

```typescript
getOllamaModels: publicProcedure
  .input(
    z.object({
      baseUrl: z.string(),
      apiKey: z.string().optional(),
    })
  )
  .query(async ({ input }) => {
    try {
      let url = input.baseUrl.trim()
      if (url.endsWith('/')) {
        url = url.slice(0, -1)
      }

      const isOllamaCloud = url.includes('ollama.com')
      const apiUrl = isOllamaCloud ? `${url}/api/tags` : `${url}/api/tags`

      const headers: Record<string, string> = {
        'Accept': 'application/json',
      }

      if (input.apiKey) {
        headers['Authorization'] = `Bearer ${input.apiKey}`
      }

      const response = await fetch(apiUrl, {
        method: 'GET',
        headers,
      })

      // ... error handling ...

      const data = await response.json()

      const models = (data.models || []).map((model: any) => ({
        id: model.model || model.name,
        name: model.name,
        description: model.details?.description || `${model.details?.parameter_size || ''} ${model.details?.family || ''}`.trim() || 'Local model',
        size: model.size,
      }))

      return {
        success: true,
        models,
      }
    } catch (error) {
      // ... error handling ...
    }
  }),
```

**API Details:**
- **Endpoint:** `GET {baseUrl}/api/tags`
- **Auth:** Bearer token via `Authorization` header (for cloud)
- **Response:** `{ success: boolean, models: Array<{id, name, description, size}> }`
- **Error Handling:** Returns `{ success: false, error: string, models: [] }` on failure

### 2.2 React Query Usage Pattern

**Pattern found in:** `src/renderer/features/agents/main/chat-input-area.tsx` (Lines 89-98)

```typescript
const { data: ollamaModelsData } = trpc.claude.getOllamaModels.useQuery(
  {
    baseUrl: customConfig.baseUrl || "http://localhost:11434",
    apiKey: customConfig.ollamaApiKey,
  },
  {
    enabled: activeProvider === "ollama" && !!customConfig.baseUrl,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  }
)
```

**Usage Pattern:**
- Only enabled when `activeProvider === "ollama"`
- 5-minute cache to avoid excessive API calls
- Gracefully handles missing baseUrl

---

## 3. Existing UI Components

### 3.1 Settings Models Tab

**Location:** `src/renderer/components/dialogs/settings-tabs/agents-models-tab.tsx`

**Current Structure:**
1. Active Provider Card
2. Version Information
3. Default Model Selection (dropdown)
4. **Ollama Model Management** (lines 429-569) - This is where Phase 1 changes go
5. Advanced Settings (collapsible)

**Current Ollama Model Management UI:**
- Shows "Cloud Models" or "Local Models" header based on mode
- "Add Model" button opens a dialog
- List displays user's models with:
  - Model name
  - "Default" badge (if current model)
  - "Not pulled" / "Cloud" badges
  - "Set Default" button
  - Remove (trash) button

**Add Model Dialog (Manual Entry):**
- Model name input (required)
- Description input (optional)
- Validates for duplicates
- Adds to `ollamaModels` with `isPulled: false`

### 3.2 Model Selection Dropdown

**Location:** `src/renderer/features/agents/main/chat-input-area.tsx` (Lines 967-1039)

Uses Radix UI DropdownMenu with:
- Model list with checkmarks for selected
- Badge support (TEAM, NEW)
- "Thinking" toggle switch at bottom

### 3.3 Provider Tab

**Location:** `src/renderer/components/dialogs/settings-tabs/agents-providers-tab.tsx`

Shows provider cards for:
- Anthropic Claude (OAuth)
- AWS Bedrock
- Ollama (with Local/Cloud mode toggle)
- Custom API

### 3.4 Onboarding Page

**Location:** `src/renderer/features/onboarding/ollama-onboarding-page.tsx`

Simple 2-step flow:
1. Select mode (Local/Cloud)
2. Configure settings (model, baseUrl, token, apiKey)

---

## 4. State Management Patterns

### 4.1 Jotai Atoms Used

| Atom | Location | Purpose |
|------|----------|---------|
| `customClaudeConfigAtom` | `src/renderer/lib/atoms/index.ts` | Stores Ollama config + user models |
| `activeProviderAtom` | `src/renderer/lib/atoms/index.ts` | Tracks "ollama" vs other providers |
| `activeConfigAtom` | `src/renderer/lib/atoms/index.ts` | Derived atom for active configuration |
| `lastSelectedModelIdAtom` | `src/renderer/features/agents/atoms` | Tracks last model in chat |
| `modelProfilesAtom` | `src/renderer/lib/atoms/index.ts` | Multiple profile support |

### 4.2 Persistence Pattern

All persisted atoms use:
```typescript
atomWithStorage<T>(key, defaultValue, undefined, { getOnInit: true })
```

This ensures values are loaded from localStorage immediately on app start.

### 4.3 tRPC Query Pattern

```typescript
const { data, isLoading } = trpc.claude.getOllamaModels.useQuery(
  { baseUrl, apiKey },
  { enabled: shouldFetch, staleTime: 5 * 60 * 1000 }
)
```

### 4.4 Config Update Pattern

```typescript
const [config, setConfig] = useAtom(customClaudeConfigAtom)

setConfig({
  ...config,
  ollamaModels: [...(config.ollamaModels || []), newModel],
})
```

---

## 5. Data Structures

### 5.1 Current OllamaModelConfig

```typescript
interface OllamaModelConfig {
  id: string           // Model identifier (e.g., "llama3.2", "qwen2.5-coder")
  name: string         // Display name
  description?: string // Optional description
  size?: string        // Model size info
  isPulled?: boolean   // Whether model is pulled locally
}
```

### 5.2 API Response Model

```typescript
interface FetchedOllamaModel {
  id: string
  name: string
  description?: string
  size?: number
}
```

### 5.3 Combined Model Pattern

Current pattern in `agents-models-tab.tsx` (Lines 225-248):

```typescript
const combinedOllamaModels = (() => {
  const fetched = ollamaModelsData?.success ? ollamaModelsData.models : []
  const user = userOllamaModels

  const modelMap = new Map<string, OllamaModelConfig>()

  // Add user models first (they take precedence)
  user.forEach((m) => modelMap.set(m.id, { ...m, isPulled: true }))

  // Add fetched models if not already in user list
  fetched.forEach((m) => {
    if (!modelMap.has(m.id)) {
      modelMap.set(m.id, {
        id: m.id,
        name: m.name,
        description: m.description || "From Ollama",
        isPulled: true,
      })
    }
  })

  return Array.from(modelMap.values())
})()
```

---

## 6. Implementation Approach for Phase 1

### 6.1 Requirements Mapping

| Requirement | Implementation Approach |
|-------------|------------------------|
| DISC-01 | Use existing `getOllamaModels` tRPC query |
| DISC-02 | Filter cloud models by checking against `ollamaModels` array |
| DISC-03 | Display `name`, `description`, `size` from API response |
| CUR-01 | Add "+ Add" button that appends to `ollamaModels` array |
| CUR-04 | Already supported via `atomWithStorage` |
| UI-01 | Split existing single list into two sections |
| UI-02 | Add "+ Add" buttons per cloud model row |

### 6.2 UI Changes Required

**In `agents-models-tab.tsx`:**

1. **Add new state:**
   - Remove manual "Add Model" dialog state
   - Add state for managing two-list view

2. **Create two sections:**
   - "Available Cloud Models" - filtered fetched models not in My Models
   - "My Models" - existing `ollamaModels` array display

3. **Cloud Models Section:**
   - Fetch using existing `getOllamaModels` query
   - Filter: `cloudModels.filter(m => !myModels.some(mm => mm.id === m.id))`
   - Show each model with: name, description, size, "+ Add" button

4. **My Models Section:**
   - Keep existing list display
   - Add "Remove" button to return model to cloud list

### 6.3 Data Flow

```
User opens Settings > Models
  ↓
Component fetches cloud models via trpc.claude.getOllamaModels
  ↓
Filter: Cloud Models = API results - My Models
  ↓
Render two sections:
  - Available Cloud Models (filtered API results)
  - My Models (from atomWithStorage)
  ↓
User clicks "+ Add" on cloud model
  ↓
Append to ollamaModels array in customClaudeConfigAtom
  ↓
Jotai persists to localStorage automatically
  ↓
UI updates: model moves from Cloud to My Models list
```

### 6.4 Reusable Components

| Component | Location | Reuse For |
|-----------|----------|-----------|
| `Button` | `src/components/ui/button.tsx` | "+ Add" buttons |
| `Trash2` icon (lucide) | - | Remove buttons |
| Existing model row styling | `agents-models-tab.tsx` | Both list rows |
| `trpc.claude.getOllamaModels` | `claude.ts` | Fetch cloud models |
| `useAtom(customClaudeConfigAtom)` | `atoms/index.ts` | Read/write My Models |

---

## 7. Risks and Gotchas

### 7.1 Identified Risks

1. **API Rate Limiting**
   - Current staleTime of 5 minutes is good
   - May need to add loading states for slow API responses

2. **Empty States**
   - Need clear messaging when:
     - No cloud models available (API error/offline)
     - Cloud list is empty (all models added)
     - My Models is empty (user hasn't added any)

3. **Duplicate Handling**
   - Current deduplication uses `modelMap` pattern
   - Ensure case-insensitive ID comparison if needed

4. **Provider Switching**
   - Current UI shows Ollama section only when `activeProvider === "ollama"`
   - Phase 1 should keep this behavior

5. **Cloud vs Local Mode**
   - Cloud mode requires API key
   - May need to prompt user to configure provider first

### 7.2 Backwards Compatibility

- Existing `ollamaModels` array will continue to work
- No schema changes needed for Phase 1
- Users with existing models will see them in "My Models"

### 7.3 Edge Cases to Handle

1. **API Unavailable**
   - Show error state in Cloud Models section
   - Allow user to retry

2. **No API Key Configured**
   - Show message: "Configure Ollama Cloud in Providers tab"
   - Disable "+ Add" buttons or hide section

3. **Large Model Lists**
   - Consider virtualization if list is very long
   - Add search/filter capability (future enhancement)

---

## 8. File References

### Key Files for Phase 1 Implementation

| File | Purpose | Lines to Modify |
|------|---------|-----------------|
| `src/renderer/components/dialogs/settings-tabs/agents-models-tab.tsx` | Main UI | 429-569 (Ollama section) |
| `src/renderer/lib/atoms/index.ts` | Data structures | 186-201 (may add fields) |
| `src/main/lib/trpc/routers/claude.ts` | API | 474-539 (may enhance) |

### Supporting Files

| File | Purpose |
|------|---------|
| `src/renderer/features/agents/main/chat-input-area.tsx` | Model dropdown (for context) |
| `src/renderer/components/dialogs/settings-tabs/agents-providers-tab.tsx` | Provider config |
| `src/renderer/features/onboarding/ollama-onboarding-page.tsx` | Onboarding flow |

---

## 9. Summary

### What's Already Built (Ready to Reuse)

1. **Data Persistence**: `atomWithStorage` for `ollamaModels`
2. **API Endpoint**: `getOllamaModels` tRPC procedure
3. **Query Pattern**: React Query with 5-minute cache
4. **UI Components**: Button, Dialog, Select from Radix UI
5. **Provider Detection**: `isOllamaCloud` pattern
6. **Model Display**: Existing row styling with badges

### What Needs to be Built for Phase 1

1. **Two-section UI**: Split existing single list
2. **Filtering Logic**: Cloud models minus My Models
3. **Add/Remove Actions**: Move models between lists
4. **Empty States**: Handle various empty scenarios
5. **Loading States**: For API fetching

### Estimated Complexity

- **Low-Medium**: Primarily UI refactoring and state management
- No new backend endpoints needed
- No database schema changes
- Uses existing patterns throughout
