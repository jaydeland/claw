# Coding Conventions

**Analysis Date:** 2026-02-05

## Naming Patterns

**Files:**
- `kebab-case.ts` - All TypeScript/JavaScript files
- `PascalCase.tsx` - React component files
- `*.test.ts` - Test files (co-located with source)
- `index.ts` - Barrel exports for directories

**Functions:**
- `camelCase` for all functions
- Async functions: no special prefix (not `asyncXxx`, just `xxx`)
- Event handlers: `handleEventName` pattern (e.g., `handleClick`, `handleSubmit`)
- React hooks: `useHookName` pattern (e.g., `useChat`, `useSettings`)

**Variables:**
- `camelCase` for variables
- `UPPER_SNAKE_CASE` for constants at module level
- No underscore prefix for private members (TypeScript `private` keyword used instead)

**Types:**
- `PascalCase` for interfaces (no `I` prefix: `Chat`, not `IChat`)
- `PascalCase` for type aliases
- `PascalCase` for enum names, `camelCase` for enum values
- Drizzle tables: `camelCase` constants (e.g., `const projects = sqliteTable(...)`)

## Code Style

**Formatting:**
- No explicit Prettier config found (using defaults)
- Semicolons: Required (observed in all files)
- Quotes: Double quotes for strings (observed pattern)
- Indentation: 2 spaces
- Line length: No strict limit observed

**TypeScript:**
- Strict mode enabled (`tsconfig.json`)
- Path alias `@/*` maps to `src/renderer/*`
- Explicit return types on exported functions (common pattern)
- Type inference allowed for internal functions

**React:**
- Functional components only
- Hooks at top of component (React rule)
- Props destructured in parameter list: `function Component({ prop1, prop2 })`
- `use client` directive for client components (Next.js pattern carried over)

## Import Organization

**Order:**
1. External packages (react, electron, etc.)
2. Internal modules (`@/components`, `@/lib`)
3. Relative imports (`./utils`, `../types`)
4. Type imports (`import type { ... }`)

**Grouping:**
- Blank lines between import groups
- Alphabetical within groups (loosely followed)

**Path Aliases:**
- `@/*` maps to `src/renderer/*` (Vite alias)
- `src/main/` uses relative imports (no alias configured)

## Error Handling

**Patterns:**
- tRPC errors bubble to client, shown as toast notifications
- Try/catch in async functions with console.error logging
- Zod validation on tRPC inputs
- Background task errors tracked in database

**Error Types:**
- Standard Error class with descriptive messages
- No custom error classes observed
- Zod errors for validation failures

## Logging

**Framework:**
- `electron-log` in main process (file + console)
- `console.log/error/warn` throughout codebase
- Prefixes: `[ComponentName]` or `[Module]` for filtering

**Patterns:**
- Log state transitions
- Log external API calls (Claude SDK, git)
- Log errors with context: `console.error("[Git] Failed to create worktree:", error)`

## Comments

**When to Comment:**
- Explain why, not what
- Document complex git/worktree logic
- Explain Claude SDK integration quirks
- Mark known limitations with TODO (30+ found)

**TODO Pattern:**
- `// TODO: Description` (no username, using git blame)
- Found in: `src/main/lib/trpc/routers/gsd.ts`, `src/renderer/features/*/`

**JSDoc:**
- Minimal usage
- Some exported functions have basic JSDoc
- Not consistently applied

## Function Design

**Size:**
- Functions vary widely (20-200+ lines observed)
- Large functions exist in `claude.ts` router (~1000+ lines for message handler)
- Extraction not consistently applied

**Parameters:**
- Max 3-4 parameters preferred
- Options objects for 4+ parameters
- Destructuring in parameter list common

**Return Values:**
- Explicit return statements
- Early returns for guard clauses
- tRPC procedures return typed responses

## Module Design

**Exports:**
- Named exports preferred (`export function foo()`)
- Barrel exports from `index.ts` files
- Drizzle schema: exports types as `Type` and `NewType`

**Electron-Specific Patterns:**
- Main process: CommonJS output (`format: "cjs"` in vite config)
- Preload: Context bridge exposes limited APIs
- Renderer: ESM with Vite dev server

## Database Patterns

**Drizzle ORM:**
- Table definitions with `$defaultFn()` for timestamps
- Relations defined separately with `relations()` helper
- Type inference: `export type Project = typeof projects.$inferSelect`
- JSON columns for flexible data: `messages`, `customEnvVars`

**Queries:**
- `db.select().from(table).where(eq(column, value)).all()`
- `db.insert(table).values({...}).run()`
- `db.update(table).set({...}).where(eq(...)).run()`

---

*Convention analysis: 2026-02-05*
*Update when patterns change*
