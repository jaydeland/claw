---
phase: 03-claude-settings
plan: 02
subsystem: claude-settings
tags: [drizzle, sqlite, tRPC, claude-code, mcp, config]
completed: 2025-01-17
duration: 20 min
tech-stack:
  added: []
  patterns: [custom-settings, mcp-discovery]
key-files:
  created: [drizzle/0006_rainy_the_watchers.sql]
  modified:
    - src/main/lib/db/schema/index.ts
    - src/main/lib/trpc/routers/claude-settings.ts
    - src/main/lib/trpc/routers/claude.ts
    - src/renderer/features/agents/components/settings-tabs/agents-claude-code-tab.tsx
key-decisions:
  - Custom config dir defaults to null (isolated per-subchat), user can set to ~/.claude for shared config
  - MCP server settings stored as JSON object with enabled flags
  - MCP servers discovered by scanning ~/.claude/ for directories matching mcp-* or *-mcp pattern
  - Symlinks for skills/agents only created when using isolated config dir (not custom)
issues-created: []
---

# Phase 03 Plan 02: Claude Config Directory and MCP Settings Summary

**One-liner:** Added configurable Claude config directory and MCP server enable/disable settings with UI controls.

**Duration:** 20 minutes
**Started:** 2025-01-17
**Completed:** 2025-01-17

---

## Accomplishments

### Database Schema Changes
Extended `claudeCodeSettings` table with two new fields:
- `customConfigDir` (text, nullable) - Path to custom Claude config directory
- `mcpServerSettings` (text, default "{}") - JSON object of MCP server enabled/disabled states

### tRPC Backend Changes

**claude-settings router:**
- Updated `getSettings` to return `customConfigDir` and `mcpServerSettings`
- Updated `updateSettings` input schema to accept the new fields
- Added `listMcpServers` procedure that:
  - Scans `~/.claude/` for MCP server directories (mcp-*, *-mcp)
  - Reads `package.json` from each server for metadata
  - Merges with user's enabled/disabled settings

**claude router:**
- Updated `getClaudeCodeSettings()` to return new fields
- Modified config directory resolution:
  - Uses `customConfigDir` when provided
  - Falls back to per-subchat isolated directory
  - Only creates skills/agents symlinks when using isolated dir
- `CLAUDE_CONFIG_DIR` env var now uses resolved `claudeConfigDir`

### UI Changes
Extended Advanced Settings in Claude Code tab:
- **Claude Config Directory** input field
  - Placeholder explains default behavior
  - Descriptive text about per-chat isolation vs shared config
- **MCP Servers** section
  - Lists discovered MCP servers from ~/.claude/
  - Shows server name and description
  - Toggle button for Enable/Disable each server
  - Refresh button to re-scan for servers
- Updated Save Settings to persist `customConfigDir`

### Migration
- Generated migration: `drizzle/0006_rainy_the_watchers.sql`
- Migration adds `custom_config_dir` and `mcp_server_settings` columns
- Will be applied automatically on app startup via `initDatabase()`

---

## Deviations from Plan

None - plan executed exactly as written.

---

## Files Modified

| File | Changes |
|------|---------|
| `src/main/lib/db/schema/index.ts` | Added `customConfigDir` and `mcpServerSettings` fields |
| `src/main/lib/trpc/routers/claude-settings.ts` | Added new fields to getSettings/updateSettings, added listMcpServers procedure |
| `src/main/lib/trpc/routers/claude.ts` | Updated getClaudeCodeSettings, modified config dir resolution logic |
| `src/renderer/features/agents/components/settings-tabs/agents-claude-code-tab.tsx` | Added Config Directory input and MCP Servers list UI |

---

## Commits

1. `6a730ff` - feat(03-02): extend claudeCodeSettings schema with config dir and MCP settings
2. `64de822` - feat(03-02): update claude-settings router for config dir and MCP settings
3. `a5a8b7a` - feat(03-02): update Claude router to use custom config directory
4. `dbd136a` - feat(03-02): add MCP server discovery and listing to claude-settings router
5. `83e7d77` - feat(03-02): extend UI with Config Directory and MCP Servers sections
6. `3cb78bc` - fix(03-02): fix TypeScript errors and apply migration

---

## Success Criteria Met

- [x] Schema includes customConfigDir and mcpServerSettings fields
- [x] tRPC router handles new fields in getSettings and updateSettings
- [x] listMcpServers procedure scans ~/.claude/ for MCP servers
- [x] Claude router uses custom config dir when provided
- [x] UI shows Config Directory input and MCP Servers list
- [x] Migration generated successfully
- [x] TypeScript compilation passes (no new errors introduced)

---

## Next Steps

Phase 03, Plan 02 is complete. Ready for next plan in this phase or phase transition.
