---
phase: 03-claude-settings
plan: 02
type: execute
wave: 1
depends_on: ["01"]
files_modified:
  - src/main/lib/db/schema/index.ts
  - src/main/lib/trpc/routers/claude-settings.ts
  - src/main/lib/trpc/routers/claude.ts
  - src/renderer/features/agents/components/settings-tabs/agents-claude-code-tab.tsx
autonomous: true
---

<objective>
Add configurable Claude Config directory and MCP server settings.

Purpose: Currently, the Claude Config directory is hardcoded to a per-subchat isolated path. Users may want to use a shared config directory (e.g., their home ~/.claude/) to share skills, agents, and settings across chats. Additionally, users need visibility and control over MCP (Model Context Protocol) servers that Claude uses for extended capabilities.

Output:
- Database schema extended with customConfigDir and mcpServerSettings fields
- tRPC endpoints updated to handle new settings
- Claude router uses custom config dir when provided
- UI shows MCP server list and allows enabling/disabling
</objective>

<execution_context>
@~/.claude/get-shit-done/workflows/execute-plan.md
@~/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@src/main/lib/db/schema/index.ts
@src/main/lib/trpc/routers/claude-settings.ts
@src/main/lib/trpc/routers/claude.ts
@src/renderer/features/agents/components/settings-tabs/agents-claude-code-tab.tsx
@.planning/phases/03-claude-settings/03-claude-settings-01-SUMMARY.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: Extend claudeCodeSettings schema with config dir and MCP settings</name>
  <files>src/main/lib/db/schema/index.ts</files>
  <action>In the `claudeCodeSettings` table definition (around line 53-60), add two new fields after `customEnvVars`:

```typescript
customConfigDir: text("custom_config_dir"), // Path to Claude config dir (null = use per-subchat isolated)
mcpServerSettings: text("mcp_server_settings").notNull().default("{}"), // JSON object of MCP server overrides
```

The updated table definition should be:
```typescript
export const claudeCodeSettings = sqliteTable("claude_code_settings", {
  id: text("id").primaryKey().default("default"),
  customBinaryPath: text("custom_binary_path"),
  customEnvVars: text("custom_env_vars").notNull().default("{}"),
  customConfigDir: text("custom_config_dir"),
  mcpServerSettings: text("mcp_server_settings").notNull().default("{}"),
  updatedAt: integer("updated_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
})
```

No changes to type exports needed - they will automatically infer the new fields.</action>
  <verify>grep -n "customConfigDir\|mcpServerSettings" src/main/lib/db/schema/index.ts shows the new fields</verify>
  <done>Schema extended with customConfigDir and mcpServerSettings fields</done>
</task>

<task type="auto">
  <name>Task 2: Update claude-settings router for new fields</name>
  <files>src/main/lib/trpc/routers/claude-settings.ts</files>

  <action>Update the `getSettings` procedure to return the new fields (around line 134-140):

```typescript
return {
  customBinaryPath: settings.customBinaryPath,
  customEnvVars: parseJsonSafely<Record<string, string>>(
    settings.customEnvVars,
    {}
  ),
  customConfigDir: settings.customConfigDir,
  mcpServerSettings: parseJsonSafely<Record<string, { enabled: boolean }>>(
    settings.mcpServerSettings,
    {}
  ),
}
```

Update the `updateSettings` input schema (around line 147-151) to accept the new fields:

```typescript
.input(
  z.object({
    customBinaryPath: z.string().nullable().optional(),
    customEnvVars: z.record(z.string()).optional(),
    customConfigDir: z.string().nullable().optional(),
    mcpServerSettings: z.record(z.object({ enabled: z.boolean() })).optional(),
  })
)
```

Update the mutation to handle the new fields (around line 165-186):

```typescript
db.update(claudeCodeSettings)
  .set({
    ...(input.customBinaryPath !== undefined && {
      customBinaryPath: input.customBinaryPath,
    }),
    ...(input.customEnvVars !== undefined && {
      customEnvVars: JSON.stringify(input.customEnvVars),
    }),
    ...(input.customConfigDir !== undefined && {
      customConfigDir: input.customConfigDir,
    }),
    ...(input.mcpServerSettings !== undefined && {
      mcpServerSettings: JSON.stringify(input.mcpServerSettings),
    }),
    updatedAt: new Date(),
  })
  .where(eq(claudeCodeSettings.id, "default"))
  .run()
```

And update the insert statement similarly:

```typescript
db.insert(claudeCodeSettings)
  .values({
    id: "default",
    customBinaryPath: input.customBinaryPath ?? null,
    customEnvVars: JSON.stringify(input.customEnvVars ?? {}),
    customConfigDir: input.customConfigDir ?? null,
    mcpServerSettings: JSON.stringify(input.mcpServerSettings ?? {}),
    updatedAt: new Date(),
  })
  .run()
```</action>
  <verify>grep -n "customConfigDir\|mcpServerSettings" src/main/lib/trpc/routers/claude-settings.ts shows the fields in getSettings and updateSettings</verify>
  <done>Router updated to handle customConfigDir and mcpServerSettings</done>
</task>

<task type="auto">
  <name>Task 3: Update Claude router to use custom config directory</name>
  <files>src/main/lib/trpc/routers/claude.ts</files>

  <action>In `src/main/lib/trpc/routers/claude.ts`, modify the config directory logic:

1. Update `getClaudeCodeSettings()` return type (around line 233-236):
```typescript
function getClaudeCodeSettings(): {
  customBinaryPath: string | null
  customEnvVars: Record<string, string>
  customConfigDir: string | null
  mcpServerSettings: Record<string, { enabled: boolean }>
}
```

2. Update the function body to include the new fields (around line 253-256):
```typescript
return {
  customBinaryPath: settings.customBinaryPath,
  customEnvVars,
  customConfigDir: settings.customConfigDir,
  mcpServerSettings: settings.mcpServerSettings
    ? JSON.parse(settings.mcpServerSettings)
    : {},
}
```

3. Update the config directory resolution (around line 406-428). Replace the `isolatedConfigDir` logic:

```typescript
// Use custom config dir if provided, otherwise use per-subchat isolated
const customConfigDir = getClaudeCodeSettings().customConfigDir
const claudeConfigDir = customConfigDir || path.join(
  app.getPath("userData"),
  "claude-sessions",
  input.subChatId
)

// Ensure config dir exists
await fs.mkdir(claudeConfigDir, { recursive: true })

// If using isolated dir (not custom), symlink skills/agents from ~/.claude/
if (!customConfigDir) {
  const homeClaudeDir = path.join(os.homedir(), ".claude")
  const skillsSource = path.join(homeClaudeDir, "skills")
  const skillsTarget = path.join(claudeConfigDir, "skills")
  const agentsSource = path.join(homeClaudeDir, "agents")
  const agentsTarget = path.join(claudeConfigDir, "agents")

  // Symlink skills directory if source exists and target doesn't
  try {
    const skillsSourceExists = await fs.stat(skillsSource).then(() => true).catch(() => false)
    const skillsTargetExists = await fs.lstat(skillsTarget).then(() => true).catch(() => false)
    if (skillsSourceExists && !skillsTargetExists) {
      await fs.symlink(skillsSource, skillsTarget, "dir")
      console.log(`[claude] Symlinked skills: ${skillsTarget} -> ${skillsSource}`)
    }
  } catch (symlinkErr) {
    // Ignore symlink errors
  }

  // Symlink agents directory if source exists and target doesn't
  try {
    const agentsSourceExists = await fs.stat(agentsSource).then(() => true).catch(() => false)
    const agentsTargetExists = await fs.lstat(agentsTarget).then(() => true).catch(() => false)
    if (agentsSourceExists && !agentsTargetExists) {
      await fs.symlink(agentsSource, agentsTarget, "dir")
      console.log(`[claude] Symlinked agents: ${agentsTarget} -> ${agentsSource}`)
    }
  } catch (symlinkErr) {
    // Ignore symlink errors
  }
}
```

4. Update the `finalEnv` to use `claudeConfigDir` instead of `isolatedConfigDir` (around line 464):
```typescript
CLAUDE_CONFIG_DIR: claudeConfigDir,
```</action>
  <verify>grep -n "customConfigDir\|claudeConfigDir" src/main/lib/trpc/routers/claude.ts shows the custom config dir logic</verify>
  <done>Claude router now uses customConfigDir when provided, falls back to isolated per-subchat dir</done>
</task>

<task type="auto">
  <name>Task 4: Add MCP Server discovery and listing to claude-settings router</name>
  <files>src/main/lib/trpc/routers/claude-settings.ts</files>

  <action>Add MCP server discovery to the router. First, add imports at the top:
```typescript
import fs from "node:fs/promises"
import path from "node:path"
import os from "node:os"
```

Add a new procedure to list available MCP servers:
```typescript
/**
 * List available MCP servers from ~/.claude/
 * Scans for MCP server directories and reads their package.json for metadata
 */
listMcpServers: publicProcedure.query(async () => {
  const claudeDir = path.join(os.homedir(), ".claude")
  const servers: Array<{
    id: string
    name: string
    description: string
    enabled: boolean
  }> = []

  try {
    const entries = await fs.readdir(claudeDir, { withFileTypes: true })

    for (const entry of entries) {
      if (!entry.isDirectory() || !entry.name.startsWith("mcp-") && !entry.name.includes("-mcp")) {
        continue
      }

      const pkgPath = path.join(claudeDir, entry.name, "package.json")
      try {
        const pkgContent = await fs.readFile(pkgPath, "utf-8")
        const pkg = JSON.parse(pkgContent)

        servers.push({
          id: entry.name,
          name: pkg.displayName || pkg.name || entry.name,
          description: pkg.description || "",
          enabled: false, // Will be overridden by settings
        })
      } catch {
        // No package.json, add basic entry
        servers.push({
          id: entry.name,
          name: entry.name,
          description: "",
          enabled: false,
        })
      }
    }
  } catch (error) {
    console.error("[claude-settings] Failed to list MCP servers:", error)
  }

  // Get user's enabled servers from settings
  const db = getDatabase()
  const settings = db
    .select()
    .from(claudeCodeSettings)
    .where(eq(claudeCodeSettings.id, "default"))
    .get()

  const enabledServers = settings?.mcpServerSettings
    ? JSON.parse(settings.mcpServerSettings)
    : {}

  // Mark enabled servers
  for (const server of servers) {
    if (enabledServers[server.id]?.enabled) {
      server.enabled = true
    }
  }

  return { servers }
}),
```</action>
  <verify>grep -n "listMcpServers" src/main/lib/trpc/routers/claude-settings.ts shows the new procedure</verify>
  <done>Added listMcpServers procedure that scans ~/.claude/ for MCP servers</done>
</task>

<task type="auto">
  <name>Task 5: Extend UI with Config Directory and MCP Servers sections</name>
  <files>src/renderer/features/agents/components/settings-tabs/agents-claude-code-tab.tsx</files>

  <action>In `agents-claude-code-tab.tsx`, add the new UI sections:

1. Add new state after existing state (around line 42):
```typescript
const [configDirExpanded, setConfigDirExpanded] = useState(false)
const [mcpExpanded, setMcpExpanded] = useState(false)
const [customConfigDir, setCustomConfigDir] = useState("")
const [mcpServers, setMcpServers] = useState<Array<{
  id: string
  name: string
  description: string
  enabled: boolean
}>>([])
```

2. Add tRPC query for MCP servers after the settings query (around line 60):
```typescript
// Query MCP servers
const { data: mcpData, refetch: refetchMcp } = trpc.claudeSettings.listMcpServers.useQuery(
  {},
  {
    onSuccess: (data) => {
      setMcpServers(data.servers)
    },
  }
)
```

3. Add effect to sync customConfigDir (around line 357):
```typescript
if (claudeSettings) {
  setCustomBinaryPath(claudeSettings.customBinaryPath || "")
  setCustomConfigDir(claudeSettings.customConfigDir || "")
  // ... existing env vars sync
}
```

4. Add the new UI sections before the Save button (in the Advanced Settings expanded div):

```typescript
                {/* Custom Config Directory */}
                <div className="space-y-2">
                  <Label className="text-sm">Claude Config Directory</Label>
                  <Input
                    value={customConfigDir}
                    onChange={(e) => setCustomConfigDir(e.target.value)}
                    placeholder="Leave empty for per-chat isolation (default)"
                    className="font-mono text-sm"
                  />
                  <p className="text-xs text-muted-foreground">
                    Controls where Claude stores skills, agents, and settings.
                    Leave empty for isolated per-chat storage (default).
                    Use ~/.claude to share with your terminal Claude.
                  </p>
                </div>

                {/* MCP Servers */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm">MCP Servers</Label>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => refetchMcp()}
                      className="h-6 px-2"
                    >
                      Refresh
                    </Button>
                  </div>
                  {mcpServers.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      No MCP servers found in ~/.claude/
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {mcpServers.map((server) => (
                        <div
                          key={server.id}
                          className="flex items-center justify-between p-2 bg-muted rounded-md"
                        >
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{server.name}</p>
                            {server.description && (
                              <p className="text-xs text-muted-foreground truncate">
                                {server.description}
                              </p>
                            )}
                          </div>
                          <button
                            onClick={() => {
                              const updated = mcpServers.map((s) =>
                                s.id === server.id
                                  ? { ...s, enabled: !s.enabled }
                                  : s
                              )
                              setMcpServers(updated)
                              updateSettings.mutate({
                                mcpServerSettings: updated.reduce(
                                  (acc, s) => ({
                                    ...acc,
                                    [s.id]: { enabled: s.enabled },
                                  }),
                                  {},
                                ),
                              })
                            }}
                            className={`ml-2 px-2 py-1 text-xs rounded-md transition-colors ${
                              server.enabled
                                ? "bg-green-100 text-green-700 hover:bg-green-200"
                                : "bg-gray-200 text-gray-700 hover:bg-gray-300"
                            }`}
                          >
                            {server.enabled ? "Enabled" : "Disabled"}
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground">
                    MCP servers extend Claude's capabilities. Toggle to enable/disable for this app.
                  </p>
                </div>
```

These sections should be added within the Advanced Settings expanded div, before the Save button.</action>
  <verify>grep -n "Config Directory\|MCP Servers\|customConfigDir\|mcpServers" src/renderer/features/agents/components/settings-tabs/agents-claude-code-tab.tsx shows the new UI</verify>
  <done>UI extended with Config Directory input and MCP Servers toggle list</done>
</task>

<task type="auto">
  <name>Task 6: Generate and apply database migration</name>
  <files>drizzle/</files>

  <action>Generate the Drizzle migration for the new schema fields:

1. Run: `bun run db:generate`
2. Verify the migration adds `custom_config_dir` and `mcp_server_settings` columns
3. Run: `bun run db:push` to apply the schema changes

This updates the existing `claude_code_settings` table with the new columns.</action>
  <verify>sqlite3 ~/Library/Application\ Support/Agents\ Dev/data/agents.db ".schema claude_code_settings" shows custom_config_dir and mcp_server_settings columns</verify>
  <done>Database migration created and applied, new columns exist in claude_code_settings table</done>
</task>

</tasks>

<verification>
Before declaring plan complete:
- [ ] Schema includes customConfigDir and mcpServerSettings fields
- [ ] tRPC router handles new fields in getSettings and updateSettings
- [ ] listMcpServers procedure scans ~/.claude/ for MCP servers
- [ ] Claude router uses custom config dir when provided
- [ ] UI shows Config Directory input and MCP Servers list
- [ ] Migration generated and applied successfully
- [ ] TypeScript compilation passes: bun run ts:check
</verification>

<success_criteria>

- Users can specify a custom Claude Config directory (defaults to isolated per-subchat)
- Users can view available MCP servers from ~/.claude/
- Users can enable/disable MCP servers via toggle buttons
- Settings persist in SQLite database
- MCP server settings are returned but not yet applied to Claude execution (future enhancement)
  </success_criteria>

<output>
After completion, create `.planning/phases/03-claude-settings/03-claude-settings-02-SUMMARY.md` with:
- Database schema changes (customConfigDir, mcpServerSettings)
- tRPC endpoint changes (getSettings, updateSettings, listMcpServers)
- Claude router integration (custom config directory logic)
- UI changes (Config Directory input, MCP Servers section)
- Migration details
</output>
