# Coding Conventions

**Analysis Date:** 2025-01-30

## Naming Patterns

**Files:**
- React components: PascalCase (`ActiveChat.tsx`, `Button.tsx`, `AgentsSidebar.tsx`)
- Utility functions: camelCase (`formatters.ts`, `utils.ts`)
- Custom hooks: camelCase with `use` prefix (`use-chat-keyboard-shortcuts.ts`, `use-file-change-listener.ts`)
- Zustand stores: kebab-case with `-store` suffix (`sub-chat-store.ts`, `agent-chat-store.ts`)
- Jotai atom files: camelCase (`index.ts` in atoms directories)

**Functions:**
- React components: PascalCase (`function ActiveChat()`, `const Button = React.forwardRef()`)
- Hooks: camelCase with `use` prefix (`useChatKeyboardShortcuts`, `useFileChangeListener`)
- Utilities: camelCase (`getFallbackName`, `stripEmojis`, `saveToLS`)
- Event handlers: `handle` prefix (`handleKeyDown`, `handleSubmit`)
- Boolean getters: `is` prefix (`isDesktopApp`, `isBackgroundSessionReady`)

**Variables:**
- Constants: UPPER_SNAKE_CASE (`QUESTIONS_SKIPPED_MESSAGE`, `OPEN_SUB_CHATS_CHANGE_EVENT`)
- Jotai atoms: camelCase with `Atom` suffix (`selectedAgentChatIdAtom`, `loadingSubChatsAtom`)
- Atom families: camelCase with `AtomFamily` suffix (`previewPathAtomFamily`, `diffSidebarOpenAtomFamily`)
- React refs: `xxxRef` naming (`stateRef`, `handlersRef`, `editorRef`)

**Types:**
- Interfaces/Types: PascalCase (`SubChatMeta`, `KeyboardShortcutHandlers`, `DiffViewDisplayMode`)
- Props interfaces: PascalCase with `Props` suffix (`ButtonProps`, `KeyboardShortcutState`)
- Database types: PascalCase, exported from schema (`Project`, `Chat`, `SubChat`, `NewProject`)

## Code Style

**TypeScript Configuration:**
- Strict mode enabled (`strict: true` in `tsconfig.json`)
- Target: ES2022
- Module: ESNext with bundler resolution
- Path alias: `@/*` maps to `./src/renderer/*`

**Formatting (implicit, no config files):**
- 2-space indentation
- Double quotes for strings
- Semicolons required
- Trailing commas in multi-line constructs
- Max line length ~100-120 (informal)

**No Linting/Formatting Tools:**
- No ESLint configuration
- No Prettier configuration
- Style enforcement is informal/convention-based

## Import Organization

**Order (observed pattern):**
```typescript
// 1. External libraries (alphabetized within groups)
import { atom, useAtom, useAtomValue, useSetAtom } from "jotai"
import { ArrowDown, ChevronDown } from "lucide-react"
import { AnimatePresence, motion } from "motion/react"
import { memo, useCallback, useEffect, useRef, useState } from "react"

// 2. Internal path aliases (@/)
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

// 3. Relative imports - ascending depth
import type { FileStatus } from "../../../../shared/changes-types"
import { trackMessageSent } from "../../../lib/analytics"
import { trpc, trpcClient } from "../../../lib/trpc"
import { ChangesPanel } from "../../changes"
import { useAgentSubChatStore } from "../stores/sub-chat-store"
```

**Path Aliases:**
- `@/*` -> `./src/renderer/*` (renderer-only alias)
- No aliases for main process code (use relative paths)

## React Patterns

**Component Structure:**
```typescript
// File header with "use client" for client components (Next.js pattern, kept for compatibility)
"use client"

/**
 * JSDoc block describing component purpose
 * Include refactor notes, hook counts, etc. for complex components
 */

// Imports (organized as above)

// Types/interfaces
interface ComponentProps {
  // ...
}

// Component definition
export function ComponentName({ prop1, prop2 }: ComponentProps) {
  // Hooks first (useState, useRef, useAtom, custom hooks)
  // Effects second
  // Handler functions
  // Return JSX
}

// Or with forwardRef for ref-forwarding:
const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, ...props }, ref) => {
    return <button ref={ref} {...props} />
  }
)
Button.displayName = "Button"
```

**Hooks Patterns:**
- Keep refs for event handlers to avoid stale closures:
```typescript
const stateRef = useRef(state)
stateRef.current = state  // Update ref on each render

useEffect(() => {
  const handler = () => {
    const currentState = stateRef.current  // Always fresh
  }
}, [])  // Empty deps - handler attached once
```

**Memoization:**
- Use `memo()` for components that receive stable props
- Use `useCallback` for handlers passed to memoized children
- Use `useMemo` for expensive computations

**Context Pattern:**
```typescript
// Create context with default
const MyContext = createContext<ContextValue | null>(null)

// Provider component
export function MyProvider({ children }: { children: React.ReactNode }) {
  const value = useMemo(() => ({ /* ... */ }), [deps])
  return <MyContext.Provider value={value}>{children}</MyContext.Provider>
}

// Hook for consuming
export function useMyContext() {
  const context = useContext(MyContext)
  if (!context) throw new Error("useMyContext must be used within MyProvider")
  return context
}
```

## State Management Patterns

**Jotai (UI State):**
```typescript
// Basic atom
export const selectedChatIdAtom = atom<string | null>(null)

// Persisted atom
export const sidebarOpenAtom = atomWithStorage<boolean>(
  "key-name",           // localStorage key
  true,                 // default value
  undefined,            // custom storage (optional)
  { getOnInit: true },  // load immediately
)

// Atom family for per-entity state
export const previewPathAtomFamily = atomFamily((chatId: string) =>
  atom(
    (get) => get(storageAtom)[chatId] ?? defaultValue,
    (get, set, newValue) => {
      const current = get(storageAtom)
      set(storageAtom, { ...current, [chatId]: newValue })
    }
  )
)
```

**Zustand (Complex Local State):**
```typescript
interface StoreState {
  // State
  items: Item[]
  activeId: string | null

  // Actions
  setActive: (id: string) => void
  addItem: (item: Item) => void
}

export const useStore = create<StoreState>((set, get) => ({
  items: [],
  activeId: null,

  setActive: (id) => set({ activeId: id }),

  addItem: (item) => {
    const { items } = get()
    set({ items: [...items, item] })
  },
}))
```

**localStorage Persistence Pattern:**
```typescript
const getStorageKey = (id: string) => `prefix-${id}`

const saveToLS = (id: string, value: unknown) => {
  if (typeof window === "undefined") return
  localStorage.setItem(getStorageKey(id), JSON.stringify(value))
}

const loadFromLS = <T>(id: string, fallback: T): T => {
  if (typeof window === "undefined") return fallback
  try {
    const stored = localStorage.getItem(getStorageKey(id))
    return stored ? JSON.parse(stored) : fallback
  } catch {
    return fallback
  }
}
```

## Error Handling

**Patterns:**
- Try-catch with fallback values
- Early returns for guard conditions
- Graceful degradation (e.g., offline mode)

```typescript
// Guard pattern
if (!canRunTests) return

// Try-catch with fallback
try {
  const result = await riskyOperation()
  return result
} catch {
  return fallbackValue
}

// Optional chaining for null safety
const value = obj?.nested?.property ?? defaultValue
```

## Logging

**Framework:** `electron-log` (main process), `console` (renderer)

**Patterns:**
```typescript
// Main process - tagged logs
console.log("[TaskWatcher] Starting...")
console.error("[Ollama] No model available")

// Conditional logging
if (!canRunTests) {
  console.log("Skipping tests (no Electron app context)")
  return
}
```

## Comments

**When to Comment:**
- JSDoc for exported functions/components
- Complex algorithms or business logic
- TODO/FIXME markers for known issues
- Deprecation notices

**JSDoc Style:**
```typescript
/**
 * Generate text using local Ollama model
 * Used for chat title generation in offline mode
 * @param userMessage - The user message to generate a title for
 * @param model - Optional model to use (if not provided, uses recommended model)
 */
async function generateChatNameWithOllama(
  userMessage: string,
  model?: string | null
): Promise<string | null> {
```

**Deprecation:**
```typescript
// DEPRECATED: No longer used after layout refactoring. Can be removed in future cleanup.
export const agentsSubChatsSidebarModeAtom = atomWithStorage<...>(...)
```

## Database Schema Conventions

**Table Definitions (Drizzle ORM):**
```typescript
export const tableName = sqliteTable("table_name", {
  // Primary key first
  id: text("id")
    .primaryKey()
    .$defaultFn(() => createId()),

  // Required fields
  name: text("name").notNull(),

  // Foreign keys
  parentId: text("parent_id")
    .notNull()
    .references(() => parentTable.id, { onDelete: "cascade" }),

  // Timestamps
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" }).$defaultFn(() => new Date()),

  // Optional fields
  optionalField: text("optional_field"),

  // JSON fields stored as text
  jsonData: text("json_data").notNull().default("{}"),
})

// Type exports at end of file
export type TableRow = typeof tableName.$inferSelect
export type NewTableRow = typeof tableName.$inferInsert
```

## UI Component Patterns

**Radix UI Wrapper Pattern:**
```typescript
// Wrap Radix primitives with project styling
import * as RadixComponent from "@radix-ui/react-component"
import { cva, type VariantProps } from "class-variance-authority"

const componentVariants = cva("base-classes", {
  variants: {
    variant: {
      default: "default-classes",
      secondary: "secondary-classes",
    },
    size: {
      sm: "small-classes",
      default: "default-size-classes",
    },
  },
  defaultVariants: {
    variant: "default",
    size: "default",
  },
})

export interface ComponentProps
  extends React.ComponentProps<typeof RadixComponent.Root>,
    VariantProps<typeof componentVariants> {}

export const Component = React.forwardRef<HTMLElement, ComponentProps>(
  ({ className, variant, size, ...props }, ref) => (
    <RadixComponent.Root
      className={cn(componentVariants({ variant, size, className }))}
      ref={ref}
      {...props}
    />
  )
)
Component.displayName = "Component"
```

**Utility Function Pattern (`cn`):**
```typescript
import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
```

---

*Convention analysis: 2025-01-30*
