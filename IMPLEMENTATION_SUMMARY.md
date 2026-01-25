# MCP Tool Listing Implementation

## Summary

Successfully implemented real-time MCP server tool querying to replace placeholder text in the workflows view. Users can now see the actual tools that each MCP server provides.

## Changes Made

### 1. Backend - MCP Tool Query Module
**File**: `/Users/jdeland/dev/vidyard/1code/src/main/lib/mcp/tool-query.ts` (NEW)

Created a dedicated MCP client that:
- Connects to MCP servers via stdio
- Implements JSON-RPC 2.0 protocol
- Sends `initialize` and `tools/list` requests
- Handles async responses with timeout protection
- Gracefully handles connection failures

Key features:
- **Timeout handling**: 10s connection timeout, 5s request timeout
- **Error resilience**: Returns empty array on failure rather than crashing
- **Clean disconnection**: Properly terminates server process
- **Buffer management**: Handles partial JSON-RPC messages

### 2. Backend - tRPC Endpoint
**File**: `/Users/jdeland/dev/vidyard/1code/src/main/lib/trpc/routers/mcp.ts`

Added `getServerTools` procedure:
```typescript
getServerTools: publicProcedure
  .input(z.object({
    serverId: z.string(),
    projectPath: z.string().optional(),
  }))
  .query(async ({ input }): Promise<{ tools: McpTool[]; error?: string }>
```

Features:
- Validates server exists and is enabled
- Queries tools using the MCP client
- Returns structured tool data with descriptions and schemas
- Handles errors gracefully with informative messages

### 3. Frontend - Tool Display Component
**File**: `/Users/jdeland/dev/vidyard/1code/src/renderer/features/workflows/ui/workflow-mcp-view.tsx`

Created `AvailableToolsSection` component that:
- Queries tools via tRPC when server is enabled
- Shows loading state while connecting
- Displays tools with names, descriptions, and parameters
- Handles multiple error states (disabled, connection failed, no tools)

UI States:
1. **Loading**: Shows spinner with "Connecting to server..."
2. **Disabled**: Warning message prompting user to enable server
3. **Connection Error**: Red error box with troubleshooting hint
4. **No Tools**: Blue info box (server connected but reported no tools)
5. **Success**: Lists all tools with descriptions and parameter names

## User Experience

### Before
- Generic placeholder text: "Tools are available when the server is running"
- No way to see what tools a server provides
- Users had to guess or check documentation

### After
- Real-time tool listing when viewing an MCP server
- Each tool shows:
  - Tool name (monospace font)
  - Description
  - Parameter names (if available)
- Clear error states for troubleshooting
- Loading indicator during connection

### Example Output

For the `filesystem` MCP server:
```
Available Tools
Found 9 tools

read_file
  Read the complete contents of a file from the filesystem
  Parameters: path

write_file
  Create a new file or completely overwrite an existing file
  Parameters: path, content

list_directory
  Get a detailed listing of all files and directories
  Parameters: path

search_files
  Recursively search for files matching a pattern
  Parameters: path, pattern, excludePatterns
```

## Technical Implementation

### MCP Protocol Flow
1. Spawn server process with configured command and args
2. Connect to stdio pipes (stdin/stdout/stderr)
3. Send `initialize` request with client info
4. Wait for initialization response
5. Send `tools/list` request
6. Parse tool definitions from response
7. Clean up and terminate process

### Error Handling
- **Connection timeout**: Returns empty array after 10 seconds
- **Request timeout**: Fails request after 5 seconds
- **Server crashes**: Caught and logged, returns empty array
- **Invalid responses**: Parsed safely with fallbacks
- **Disabled servers**: Shows warning instead of attempting connection

### Type Safety
All MCP tool data is strongly typed:
```typescript
interface McpTool {
  name: string
  description?: string
  inputSchema?: {
    type: string
    properties?: Record<string, unknown>
    required?: string[]
  }
}
```

## Testing Recommendations

1. **Test with working server**: Verify tools display correctly
2. **Test with disabled server**: Check warning message appears
3. **Test with misconfigured server**: Verify error handling
4. **Test with slow server**: Verify timeout and loading state
5. **Test with no-tools server**: Verify "No tools available" message

## Files Modified

1. `/Users/jdeland/dev/vidyard/1code/src/main/lib/mcp/tool-query.ts` - NEW
2. `/Users/jdeland/dev/vidyard/1code/src/main/lib/trpc/routers/mcp.ts` - MODIFIED
3. `/Users/jdeland/dev/vidyard/1code/src/renderer/features/workflows/ui/workflow-mcp-view.tsx` - MODIFIED

## Future Enhancements

Potential improvements:
- Cache tool lists (avoid reconnecting on every view)
- Show tool input schemas in expandable sections
- Add "Test Tool" button to try tools directly
- Display tool execution history/stats
- Filter/search tools by name or description
