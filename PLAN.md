# Plan: Enhanced Session Context Token & Cost Tracking

## Goal
Update the Session Context panel to provide comprehensive token and cost tracking:
1. Store and display cost per result/request
2. Show input/output tokens per result with context window
3. Add a comprehensive summary section with totals and context window usage percentage
4. Use actual context window from model response instead of hardcoded values

## Current State Analysis

### Existing Components
- **`RunningTokensSection`** (`loaded-context-panel.tsx`): Shows per-request token breakdown
- **`messageTokenDataAtom`** (`message-store.ts`): Aggregates total tokens and cost across all turns
- **`AgentContextIndicator`**: Shows context usage but uses hardcoded Claude model windows (1M)
- **`StoredMessageMetadata`**: Stores inputTokens, outputTokens, totalCostUsd but NOT contextWindow

### Data Flow
1. Backend sends `modelUsage` with `contextWindow`, `inputTokens`, `outputTokens`, `costUSD`
2. `transform.ts` extracts this data and creates `MessageMetadata`
3. `message-store.ts` stores metadata per message via `messageMetadataAtomFamily`
4. `RunningTokensSection` reads metadata and displays per-request data

## Implementation Plan

### Phase 1: Store Context Window from Model Usage
**Files:** `src/main/lib/claude/types.ts`, `src/main/lib/claude/transform.ts`, `src/renderer/features/agents/stores/message-store.ts`

1. **Add `contextWindow` to `MessageMetadata` type** (`types.ts:96-107`)
2. **Extract and include `contextWindow` in transform** (`transform.ts:585-598`)
3. **Add `contextWindow` to `StoredMessageMetadata`** (`message-store.ts:83-93`)

### Phase 2: Enhanced Per-Request Display
**File:** `src/renderer/features/loaded-context/ui/loaded-context-panel.tsx`

Update `RequestTokenData` and `RequestTokenItem` to include:
- Cost per request
- Context window size
- Percentage of context used per request

### Phase 3: Comprehensive Summary Section
**File:** `src/renderer/features/loaded-context/ui/loaded-context-panel.tsx`

Create new `SessionSummarySection` component that displays:
- Total cost for session (sum of all requests)
- Total input/output tokens
- Current context window size (from last model response)
- Percentage of context window used (progress bar)
- Visual indicator when approaching limits (yellow at 80%, red at 95%)

### Phase 4: Update AgentContextIndicator
**File:** `src/renderer/features/agents/ui/agent-context-indicator.tsx`

- Remove hardcoded `CONTEXT_WINDOWS` lookup
- Accept `contextWindow` as prop from actual model data
- Display "Unknown" or default when context window not yet determined

### Phase 5: Create Derived Atoms for Session Totals
**File:** `src/renderer/features/agents/stores/message-store.ts`

Create new derived atoms:
- `sessionCostTotalAtom`: Sum of all `totalCostUsd` across messages
- `sessionContextWindowAtom`: Get context window from most recent message with metadata
- `sessionContextUsagePercentAtom`: Calculate percentage based on total tokens / context window

## Detailed File Changes

### 1. `src/main/lib/claude/types.ts`
```typescript
export type MessageMetadata = {
  sessionId?: string
  sdkMessageUuid?: string
  inputTokens?: number
  outputTokens?: number
  totalTokens?: number
  totalCostUsd?: number
  durationMs?: number
  resultSubtype?: string
  finalTextId?: string
  stopReason?: string | null
  contextWindow?: number  // NEW: Store context window size
}
```

### 2. `src/main/lib/claude/transform.ts`
Update the metadata extraction (lines 585-598):
- Extract `contextWindow` from `modelUsage` (first model's contextWindow)
- Include in the `MessageMetadata` object

### 3. `src/renderer/features/agents/stores/message-store.ts`
```typescript
export interface StoredMessageMetadata {
  sessionId?: string
  inputTokens?: number
  outputTokens?: number
  totalTokens?: number
  totalCostUsd?: number
  durationMs?: number
  resultSubtype?: string
  finalTextId?: string
  sdkMessageUuid?: string
  contextWindow?: number  // NEW
}
```

Add derived atoms (after line 581):
```typescript
// Session totals atom
export const sessionTotalsAtom = atom((get) => {
  const ids = get(messageIdsAtom)
  const subChatId = get(currentSubChatIdAtom)

  let totalCost = 0
  let totalInput = 0
  let totalOutput = 0
  let contextWindow = 0

  for (const id of ids) {
    const metadataKey = `${subChatId}:${id}`
    const metadata = get(messageMetadataAtomFamily(metadataKey))
    if (metadata) {
      totalCost += metadata.totalCostUsd || 0
      totalInput += metadata.inputTokens || 0
      totalOutput += metadata.outputTokens || 0
      // Use the most recent context window
      if (metadata.contextWindow) {
        contextWindow = metadata.contextWindow
      }
    }
  }

  return {
    totalCost,
    totalInput,
    totalOutput,
    totalTokens: totalInput + totalOutput,
    contextWindow,
    percentUsed: contextWindow > 0 ? ((totalInput + totalOutput) / contextWindow) * 100 : 0
  }
})
```

### 4. `src/renderer/features/loaded-context/ui/loaded-context-panel.tsx`

**Update `RequestTokenData` interface (line 23-32):**
```typescript
interface RequestTokenData {
  requestNumber: number
  userMessageId: string
  assistantMessageId: string
  inputTokens: number
  outputTokens: number
  totalTokens: number
  costUsd?: number          // NEW
  contextWindow?: number    // NEW
  percentUsed?: number      // NEW
  preview: string
  durationMs?: number
}
```

**Update `RequestTokenItem` component (lines 67-88):**
Add display for cost and context usage in the expanded view.

**Create new `SessionSummarySection` component:**
```typescript
function SessionSummarySection() {
  const totals = useAtomValue(sessionTotalsAtom)

  if (totals.totalTokens === 0) return null

  return (
    <div className="flex flex-col gap-2 p-3 bg-muted/20 rounded-md border border-border/50">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-foreground">Session Total</span>
        <span className="text-sm font-semibold text-foreground">
          ${totals.totalCost.toFixed(4)}
        </span>
      </div>

      <div className="flex items-center justify-between text-[10px] text-muted-foreground">
        <span>Tokens: {totals.totalTokens.toLocaleString()}</span>
        <span>Context: {totals.contextWindow > 0 ? formatTokenCount(totals.contextWindow) : 'Unknown'}</span>
      </div>

      {totals.contextWindow > 0 && (
        <div className="mt-1">
          <div className="flex justify-between text-[10px] mb-1">
            <span className="text-muted-foreground">Context Usage</span>
            <span className={cn(
              "font-medium",
              totals.percentUsed > 95 ? "text-red-500" :
              totals.percentUsed > 80 ? "text-yellow-500" :
              "text-green-600"
            )}>
              {totals.percentUsed.toFixed(1)}%
            </span>
          </div>
          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
            <div
              className={cn(
                "h-full transition-all duration-300 rounded-full",
                totals.percentUsed > 95 ? "bg-red-500" :
                totals.percentUsed > 80 ? "bg-yellow-500" :
                "bg-green-500"
              )}
              style={{ width: `${Math.min(100, totals.percentUsed)}%` }}
            />
          </div>
        </div>
      )}
    </div>
  )
}
```

**Add to main panel layout (around line 386):**
```typescript
{/* Session Summary - shows totals and context usage */}
<SessionSummarySection />

{/* Running Tokens Section - shows per-request breakdown */}
<RunningTokensSection />
```

### 5. `src/renderer/features/agents/ui/agent-context-indicator.tsx`

**Update to accept contextWindow as prop:**
```typescript
interface AgentContextIndicatorProps {
  tokenData: MessageTokenData
  contextWindow?: number  // NEW: Accept actual context window
  className?: string
  onCompact?: () => void
  isCompacting?: boolean
  disabled?: boolean
}
```

**Update logic to use prop:**
```typescript
export const AgentContextIndicator = memo(function AgentContextIndicator({
  tokenData,
  contextWindow,  // Use this instead of hardcoded lookup
  className,
  onCompact,
  isCompacting,
  disabled,
}: AgentContextIndicatorProps) {
  const totalTokens = tokenData.totalTokens
  // Default to 200K if unknown (kimi-k2.5 default)
  const effectiveContextWindow = contextWindow || 200_000
  const percentUsed = Math.min(100, (totalTokens / effectiveContextWindow) * 100)
  // ... rest of component
})
```

## Testing Checklist

- [ ] Verify context window is extracted from modelUsage and stored correctly
- [ ] Verify per-request cost displays in Running Tokens section
- [ ] Verify session summary shows total cost, tokens, and context usage
- [ ] Verify progress bar changes color at 80% (yellow) and 95% (red)
- [ ] Verify AgentContextIndicator uses actual context window from responses
- [ ] Test with different models to ensure context window updates correctly
- [ ] Test edge case: first request (no prior context window)
- [ ] Test edge case: model switch mid-session

## Success Criteria

1. Session Context panel displays accurate cost per request
2. Session total cost is visible and updates in real-time
3. Context window size is displayed (e.g., "200K context")
4. Visual progress bar shows context usage percentage
5. Color-coded warnings when approaching context limits
6. Works with any model (kimi-k2.5, glm-4.7, Claude, etc.)

## Estimated Effort

- Phase 1 (Data layer): ~30 minutes
- Phase 2 (Per-request UI): ~30 minutes
- Phase 3 (Summary section): ~45 minutes
- Phase 4 (Indicator update): ~20 minutes
- Phase 5 (Derived atoms): ~30 minutes
- Testing & polish: ~30 minutes

**Total: ~3 hours**
