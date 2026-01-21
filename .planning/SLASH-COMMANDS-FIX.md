# Slash Commands Fix

## Issue
Slash commands in the Claude prompt field were not working:
1. The slash command dropdown wasn't appearing when typing `/`
2. Repository commands (like `vidyard.plan`) weren't being loaded

## Root Cause
The slash command component (`agents-slash-command.tsx`) was using mock API calls that returned empty arrays:
- `api.github.getSlashCommands` - returned `[]`
- `api.github.getSlashCommandContent` - didn't exist

However, a real implementation already existed in the `workflows` router that scans the Claude config directory for commands.

## Solution

### 1. Updated API Import
Changed from mock API to real tRPC client:
```typescript
// Before
import { api } from "../../../lib/mock-api"

// After
import { trpc } from "../../../lib/trpc"
```

### 2. Updated Command Fetching
Changed to use the real `workflows.listCommands` procedure:
```typescript
// Before
const { data: repoCommands = [], isLoading } =
  api.github.getSlashCommands.useQuery({
    teamId: teamId!,
    repository: repository!,
  }, ...)

// After
const { data: workflowCommands = [], isLoading } =
  trpc.workflows.listCommands.useQuery(undefined, {
    enabled: isOpen,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  })

// Transform to slash command format
const repoCommands: SlashCommandOption[] = workflowCommands.map((cmd) => ({
  id: cmd.id,
  name: cmd.name,
  description: cmd.description,
  command: `/${cmd.name}`,
  category: "repository" as const,
  path: cmd.sourcePath,
}))
```

### 3. Added New Procedure for Reading Command Content
Added `getCommandContent` procedure to `workflows.ts`:
```typescript
getCommandContent: publicProcedure
  .input(z.object({ path: z.string() }))
  .query(async ({ input }) => {
    const content = await fs.readFile(input.path, "utf-8")
    const parsed = matter(content)
    return {
      content: parsed.content.trim(),
      frontmatter: parsed.data,
    }
  }),
```

### 4. Updated Content Fetching
Changed to use the new procedure:
```typescript
// Before
const result = await utils.github.getSlashCommandContent.fetch({
  teamId,
  repository: option.repository || repository!,
  path: option.path,
})

// After
const result = await utils.workflows.getCommandContent.fetch({
  path: option.path,
})
```

## Files Modified
1. `src/renderer/features/agents/commands/agents-slash-command.tsx`
   - Changed API import from mock-api to trpc
   - Updated command fetching logic
   - Updated content fetching logic
   - Removed unused teamId/repository dependency

2. `src/main/lib/trpc/routers/workflows.ts`
   - Added `getCommandContent` procedure

## Testing
Build completed successfully with no TypeScript errors.

## Result
- Slash commands now load from the real Claude config directory
- Commands like `vidyard.plan` should appear in the dropdown
- Command content is fetched and inserted when selected
