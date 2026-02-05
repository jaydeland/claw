# Testing Patterns

**Analysis Date:** 2026-02-05

## Test Framework

**Runner:**
- Vitest (bundled with electron-vite)
- No explicit config file (uses electron-vite defaults)

**Assertion Library:**
- Vitest built-in `expect`
- Matchers: `toBe`, `toEqual`, `toThrow`, `toMatchObject`

**Run Commands:**
```bash
# No explicit test script in package.json
# Tests run through electron-vite's Vitest integration
```

## Test File Organization

**Location:**
- `__tests__/` directories co-located with source files
- Test files: `*.test.ts`

**Structure:**
```
src/
  main/
    lib/
      background-tasks/
        __tests__/
          session-cleanup.test.ts
          task-lifecycle.test.ts
          watcher.test.ts
      migrations/
        __tests__/
          worktree-location-migration.test.ts
      trpc/routers/
        __tests__/
          pagination-integration.test.ts
          tasks.test.ts
          e2e-validation.ts
          test-*.ts
  renderer/
    features/
      workflows/lib/
        markdown-linter.test.ts
```

## Test Structure

**Suite Organization:**
```typescript
import { describe, it, expect, beforeEach, vi } from "vitest"

describe("FeatureName", () => {
  describe("functionName", () => {
    beforeEach(() => {
      // Reset state
    })

    it("should handle valid input", () => {
      // arrange
      const input = createTestInput()

      // act
      const result = functionName(input)

      // assert
      expect(result).toEqual(expectedOutput)
    })

    it("should throw on invalid input", () => {
      expect(() => functionName(null)).toThrow("Invalid input")
    })
  })
})
```

**Patterns:**
- `describe` blocks for feature/function grouping
- `beforeEach` for per-test setup
- Factory functions for test data creation

## Mocking

**Framework:**
- Vitest built-in mocking (`vi.fn()`, `vi.mock()`)

**Patterns:**
```typescript
// Mock function
const mockFn = vi.fn()
mockFn.mockReturnValue("test")

// Mock module (at top of file)
vi.mock("../external-module", () => ({
  someFunction: vi.fn()
}))

// Spy on function
const spy = vi.spyOn(object, "method")
```

**What to Mock:**
- File system operations (observed in tests)
- External dependencies
- Database queries (unit tests)

**What NOT to Mock:**
- Pure utility functions (minimal mocking observed)

## Test Types

**Unit Tests:**
- Background task lifecycle (`task-lifecycle.test.ts`)
- Session cleanup logic (`session-cleanup.test.ts`)
- Markdown linting (`markdown-linter.test.ts`)
- Migration logic (`worktree-location-migration.test.ts`)

**Integration Tests:**
- tRPC router pagination (`pagination-integration.test.ts`)
- Task API (`tasks.test.ts`)

**E2E Tests:**
- `e2e-validation.ts` - E2E validation helpers
- No full E2E test suite (no Playwright/Cypress observed)

## Test Data

**Factories:**
- Test data created inline in tests
- Helper functions for complex objects:
```typescript
function createTestInput(overrides?: Partial<Input>): Input {
  return {
    id: "test-id",
    name: "Test",
    ...overrides
  }
}
```

**Fixtures:**
- No dedicated fixtures directory observed
- Test data created per test file

## Coverage

**Requirements:**
- No coverage target enforced
- Coverage tracked implicitly through manual runs

**Configuration:**
- No explicit coverage config
- Would use Vitest's built-in coverage

## Known Test Gaps

**Areas Missing Tests:**
- Git operations (complex, file-system dependent)
- Terminal management (PTY spawning)
- Claude SDK integration (requires credentials)
- UI components (no component tests)
- tRPC routers (only pagination/tasks tested)

**Difficult to Test:**
- Native module integration (better-sqlite3, node-pty)
- Electron-specific APIs (requires Electron environment)
- OAuth flows (requires browser interaction)

---

*Testing analysis: 2026-02-05*
*Update when test patterns change*
