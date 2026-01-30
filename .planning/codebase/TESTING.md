# Testing Patterns

**Analysis Date:** 2025-01-30

## Test Framework

**Runners (Mixed):**
- **Vitest** - Primary test runner for most tests
- **bun:test** - Used in some test files (Bun's built-in test runner)

**No Unified Configuration:**
- No `vitest.config.ts` or `jest.config.ts` found
- No `bun test` configuration in `package.json`
- Tests run with framework defaults

**Assertion Library:**
- Vitest's built-in `expect` (similar to Jest)
- `bun:test` assertions for bun-specific tests

**Run Commands:**
```bash
# No test scripts in package.json
# Tests likely run manually or via IDE

# To run Vitest tests:
npx vitest run

# To run bun tests:
bun test
```

## Test File Organization

**Location:**
- `__tests__` directories alongside source code
- Some tests co-located with source files

**Naming:**
- `*.test.ts` suffix for test files
- No `.spec.ts` files found

**Structure:**
```
src/
├── main/lib/
│   ├── background-tasks/
│   │   ├── __tests__/
│   │   │   ├── session-cleanup.test.ts
│   │   │   ├── task-lifecycle.test.ts
│   │   │   └── watcher.test.ts
│   │   ├── cleanup.ts
│   │   └── watcher.ts
│   ├── migrations/
│   │   └── __tests__/
│   │       └── worktree-location-migration.test.ts
│   └── trpc/routers/
│       └── __tests__/
│           ├── pagination-integration.test.ts
│           └── tasks.test.ts
└── renderer/features/
    └── workflows/lib/
        └── markdown-linter.test.ts  # Co-located
```

## Test Structure

**Suite Organization (Vitest):**
```typescript
import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest'

describe('Feature Name', () => {
  let testData: SomeType

  beforeEach(() => {
    // Setup - runs before each test
    testData = createTestData()
    vi.useFakeTimers()
  })

  afterEach(() => {
    // Teardown - runs after each test
    cleanup()
    vi.useRealTimers()
  })

  test('should do something specific', () => {
    // Arrange
    const input = prepareInput()

    // Act
    const result = functionUnderTest(input)

    // Assert
    expect(result).toBe(expectedValue)
  })

  describe('nested context', () => {
    test('should handle edge case', () => {
      // ...
    })
  })
})
```

**Suite Organization (bun:test):**
```typescript
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "bun:test"

describe("Feature Name", () => {
  beforeAll(() => {
    // One-time setup for entire suite
  })

  afterAll(() => {
    // One-time cleanup for entire suite
  })

  beforeEach(() => {
    // Setup before each test
  })

  it("should do something", () => {
    expect(value).toBe(expected)
  })
})
```

**Patterns:**
- `describe` for grouping related tests
- `test` or `it` for individual test cases (both work in Vitest)
- `beforeEach`/`afterEach` for per-test setup/teardown
- `beforeAll`/`afterAll` for suite-level setup/teardown

## Mocking

**Framework:** Vitest's `vi` mock utilities

**Patterns:**

```typescript
// Fake timers for time-dependent tests
vi.useFakeTimers()
// ... test code
vi.useRealTimers()

// Spy on console
const consoleSpy = vi.spyOn(console, 'log')
// ... test code
expect(consoleSpy).toHaveBeenCalledWith('[TaskWatcher] Already running')
consoleSpy.mockRestore()

// Accessing private properties (via type casting)
const watcherAny = watcher as any
watcherAny.privateProperty = testValue
```

**Mocking Electron APIs:**
```typescript
// Mock app.getPath for testing
const originalGetPath = app?.getPath

beforeAll(() => {
  if (app) {
    ;(app as any).getPath = (name: string) => {
      if (name === "userData") return testUserDataPath
      return originalGetPath.call(app, name)
    }
  }
})

afterAll(() => {
  if (app && originalGetPath) {
    ;(app as any).getPath = originalGetPath
  }
})
```

**What to Mock:**
- Electron APIs (`app.getPath`, etc.)
- File system operations for unit tests
- External API calls
- Timers (`setTimeout`, `setInterval`)

**What NOT to Mock:**
- Database operations (integration tests use real DB)
- Core business logic being tested

## Fixtures and Factories

**Test Data:**
```typescript
// Inline test data creation
const testContent = Array.from(
  { length: 100 },
  (_, i) => `Line ${i + 1}: Test output line`
).join("\n")

// Simple factory function
function createTestTask() {
  return {
    id: `test-task-${Date.now()}`,
    chatId: `test-chat-${Date.now()}`,
    // ...
  }
}
```

**Location:**
- Test data created inline in test files
- No shared fixtures directory
- No factory libraries (like `faker`)

## Coverage

**Requirements:** None enforced

**Current State:**
- No coverage configuration
- No coverage thresholds
- Limited overall test coverage
- Tests concentrated in `src/main/lib/` (backend logic)
- Minimal renderer/UI tests

**View Coverage:**
```bash
# Not configured - would need to add:
npx vitest run --coverage
```

## Test Types

**Unit Tests:**
- Test individual functions/classes in isolation
- Mock external dependencies
- Located in `__tests__` directories

Example files:
- `src/main/lib/background-tasks/__tests__/watcher.test.ts`
- `src/renderer/features/workflows/lib/markdown-linter.test.ts`

**Integration Tests:**
- Test database operations with real SQLite
- Test file system operations
- May require Electron environment

Example files:
- `src/main/lib/background-tasks/__tests__/session-cleanup.test.ts`
- `src/main/lib/background-tasks/__tests__/task-lifecycle.test.ts`
- `src/main/lib/trpc/routers/__tests__/pagination-integration.test.ts`

**E2E Tests:**
- Not found in codebase
- No Playwright/Cypress configuration

## Common Patterns

**Async Testing:**
```typescript
test('should handle async operation', async () => {
  const result = await asyncFunction()
  expect(result).toBeDefined()
})

// With cleanup
it('should cleanup on error', async () => {
  try {
    await riskyOperation()
  } catch {
    // Expected
  }
  expect(cleanupCalled).toBe(true)
})
```

**Error Testing:**
```typescript
test('should handle missing file gracefully', () => {
  const missingFile = '/nonexistent/path/file.txt'
  expect(existsSync(missingFile)).toBe(false)
})

test('should handle empty input', () => {
  const result = processData('')
  expect(result.lines).toBe('')
})
```

**File System Testing:**
```typescript
import { mkdirSync, rmSync, writeFileSync, existsSync, readFileSync } from 'fs'
import path from 'path'
import os from 'os'

describe('File operations', () => {
  const testDir = path.join(os.tmpdir(), `test-${Date.now()}`)

  beforeEach(() => {
    if (!existsSync(testDir)) {
      mkdirSync(testDir, { recursive: true })
    }
    // Create test files
    writeFileSync(path.join(testDir, 'test.txt'), 'content')
  })

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true })
    }
  })

  test('should read file', () => {
    const content = readFileSync(path.join(testDir, 'test.txt'), 'utf-8')
    expect(content).toBe('content')
  })
})
```

**Database Testing (Drizzle):**
```typescript
import { getDatabase, backgroundTasks } from '../../db'
import { eq } from 'drizzle-orm'

describe('Database operations', () => {
  let testChatId: string

  beforeEach(() => {
    testChatId = 'test-chat-' + Date.now()
  })

  afterEach(() => {
    // Cleanup test data
    const db = getDatabase()
    db.delete(backgroundTasks)
      .where(eq(backgroundTasks.chatId, testChatId))
      .run()
  })

  test('should insert and retrieve record', () => {
    const db = getDatabase()

    const taskId = db.insert(backgroundTasks).values({
      chatId: testChatId,
      // ...
    }).returning().get().id

    const task = db.select().from(backgroundTasks)
      .where(eq(backgroundTasks.id, taskId))
      .get()

    expect(task).toBeDefined()
    expect(task?.chatId).toBe(testChatId)
  })
})
```

**Conditional Test Execution:**
```typescript
describe('Electron-dependent tests', () => {
  const canRunTests = typeof app !== 'undefined' && app?.getPath

  it('should work in Electron environment', async () => {
    if (!canRunTests) return  // Skip if not in Electron

    // Actual test logic
    const result = await electronSpecificFunction()
    expect(result).toBeDefined()
  })
})
```

## Test Utilities

**Helper Functions:**
```typescript
// Defined within test files
function getTailLines(content: string, tailLines: number): string {
  const lines = content.split('\n')
  return lines.slice(-tailLines).join('\n')
}

function getPaginatedLines(content: string, offset: number, limit: number) {
  const allLines = content.split('\n')
  return {
    lines: allLines.slice(offset, offset + limit).join('\n'),
    totalLines: allLines.length,
    startLine: offset,
    endLine: offset + limit - 1,
  }
}
```

**No Shared Test Utilities:**
- No `test-utils.ts` or similar
- Helpers defined inline in test files
- No custom matchers

## Writing New Tests

**Where to Place Tests:**
1. Create `__tests__` directory alongside source if not exists
2. Name file `{source-name}.test.ts`

**Test File Template:**
```typescript
import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest'
// Import module under test
import { functionUnderTest } from '../module'

describe('moduleName', () => {
  beforeEach(() => {
    // Setup
  })

  afterEach(() => {
    // Cleanup
  })

  describe('functionUnderTest', () => {
    test('should handle normal case', () => {
      const result = functionUnderTest(normalInput)
      expect(result).toBe(expectedOutput)
    })

    test('should handle edge case', () => {
      const result = functionUnderTest(edgeInput)
      expect(result).toBe(edgeOutput)
    })

    test('should handle error case', () => {
      expect(() => functionUnderTest(badInput)).toThrow()
    })
  })
})
```

## Test Gaps

**Areas with Tests:**
- `src/main/lib/background-tasks/` - Task lifecycle, cleanup, watcher
- `src/main/lib/migrations/` - Data migrations
- `src/main/lib/trpc/routers/` - API endpoints, pagination
- `src/renderer/features/workflows/lib/` - Markdown linting

**Areas Without Tests:**
- `src/renderer/components/` - UI components
- `src/renderer/features/agents/` - Main chat feature
- `src/main/lib/claude/` - Claude SDK integration
- `src/main/lib/git/` - Git operations
- `src/main/lib/terminal/` - Terminal management
- `src/preload/` - IPC bridge

**Priority for New Tests:**
1. `src/main/lib/git/` - Core functionality, complex logic
2. `src/main/lib/claude/` - SDK integration, error handling
3. `src/main/lib/terminal/` - Session management
4. Critical UI components (if testing framework added)

---

*Testing analysis: 2025-01-30*
