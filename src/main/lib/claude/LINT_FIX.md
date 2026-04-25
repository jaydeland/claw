# Claude-Based Lint Auto-Fix

Automatically fix TypeScript and ESLint errors using Claude's background session.

## Architecture

### Backend (`background-session.ts`)
- **`fixLintErrors()`** - Core function that uses Claude SDK to fix lint issues
- Uses Sonnet model for better code understanding
- Reads file, analyzes errors, applies Edit tool fixes
- Returns success status and number of changes

### API (`claude.ts` router)
- **`claude.fixLintErrors`** - tRPC mutation endpoint
- Input: filePath, diagnostics array, cwd
- Returns: success, error, changesApplied, output

### Frontend (`use-lint-fix.ts` hook)
- **`useLintFix()`** - React hook for UI integration
- Handles loading state and notifications
- Shows toast messages for progress/success/failure

### UI Components
- **`LintFixButton`** - Button with loading state and error count
- **`DiagnosticsPanel`** - Full panel showing diagnostics with fix button

## Usage Examples

### Example 1: Simple Fix Button

```tsx
import { LintFixButton } from "@/components/lint-fix-button"

function MyComponent() {
  const diagnostics = [
    { message: "Property 'foo' does not exist", line: 42, severity: "error" },
    { message: "Unused variable 'bar'", line: 50, severity: "warning" },
  ]

  return (
    <LintFixButton
      filePath="/path/to/file.ts"
      diagnostics={diagnostics}
      cwd="/path/to/project"
      onFixComplete={() => console.log("Fixed!")}
    />
  )
}
```

### Example 2: Full Diagnostics Panel

```tsx
import { DiagnosticsPanel } from "@/components/diagnostics-panel"

function CodeEditor() {
  const [diagnostics, setDiagnostics] = useState([])

  const runTypeCheck = async () => {
    // Run tsc or eslint
    const errors = await checkFile()
    setDiagnostics(errors)
  }

  return (
    <DiagnosticsPanel
      filePath="/path/to/file.ts"
      diagnostics={diagnostics}
      cwd="/path/to/project"
      onRefresh={runTypeCheck}
      onFixComplete={runTypeCheck}
    />
  )
}
```

### Example 3: Programmatic Fix

```tsx
import { useLintFix } from "@/hooks/use-lint-fix"

function MyComponent() {
  const { fixLintErrors, isFixing } = useLintFix()

  const handleFix = async () => {
    const result = await fixLintErrors(
      "/path/to/file.ts",
      [{ message: "Error here", line: 10 }],
      "/path/to/project"
    )

    if (result?.success) {
      console.log(`Applied ${result.changesApplied} fixes`)
    }
  }

  return (
    <button onClick={handleFix} disabled={isFixing}>
      {isFixing ? "Fixing..." : "Fix Errors"}
    </button>
  )
}
```

## Integration Points

### 1. Terminal Output Parser
Parse TypeScript errors from `bun run type-check` output:
```typescript
const parseTypeScriptErrors = (output: string): LintDiagnostic[] => {
  // Parse lines like: "src/file.ts:42:10 - error TS2551: Property 'foo' does not exist"
  const errors = []
  const lines = output.split("\n")
  for (const line of lines) {
    const match = line.match(/^(.+):(\d+):(\d+) - (error|warning) (\w+): (.+)$/)
    if (match) {
      errors.push({
        filePath: match[1],
        line: parseInt(match[2]),
        column: parseInt(match[3]),
        severity: match[4],
        message: match[6],
      })
    }
  }
  return errors
}
```

### 2. Build Error Display
Show fix button when build fails:
```tsx
{buildErrors.length > 0 && (
  <LintFixButton
    filePath={currentFile}
    diagnostics={buildErrors}
    cwd={projectPath}
  />
)}
```

### 3. File Watcher (Future)
Automatically detect errors on save and prompt for fix.

## How It Works

1. **User sees errors** - From build output, IDE, or diagnostics
2. **Clicks "Fix with Claude"** button
3. **Backend creates prompt** with file path and error list
4. **Claude session** is invoked in agent mode:
   - Reads the file
   - Analyzes each error
   - Uses Edit tool to apply minimal fixes
   - Returns summary
5. **Frontend shows result** - Toast notification with change count
6. **Optional callback** - Re-run type check to verify fixes

## Configuration

The background session uses:
- **Model:** Sonnet (better at code than Haiku)
- **Permissions:** bypassPermissions (can edit files)
- **Timeout:** 30s per fix operation
- **Session:** Reuses existing background session for efficiency

## Limitations

1. **Requires OAuth connection** - Needs Claude Code token
2. **One file at a time** - Fixes a single file per call
3. **No guarantee** - Claude may not fix all errors
4. **Minimal validation** - Doesn't re-run TypeScript check after fix
5. **No undo** - Changes are applied directly (use git to revert)

## Future Enhancements

- [ ] Batch fix multiple files at once
- [ ] Parse errors from terminal output automatically
- [ ] Add file watcher for automatic detection
- [ ] Pre-commit hook integration
- [ ] Validation after fix (re-run tsc)
- [ ] Diff preview before applying fixes
- [ ] Undo/revert functionality
- [ ] Support for custom ESLint rules
