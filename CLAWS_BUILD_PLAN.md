# Headless Agents (Claws) - Build Plan

## Implementation Complete ✅

All components of the Headless Agents feature have been implemented and **builds successfully**.

### Build Status: ✅ PASSING
- TypeScript compilation: No errors
- Vite bundling: Successful
- All imports resolved
- All components created

## Files Created/Modified

### Database Layer
- `src/main/lib/db/schema/index.ts` - Added `headless_claws`, `claw_executions`, `github_settings` tables
- `drizzle/0037_add_claws_tables.sql` - Migration file

### Backend Layer
- `src/main/lib/claws/index.ts` - ClawDaemon singleton (orchestration engine)
- `src/main/lib/trpc/routers/claws.ts` - tRPC router for claws CRUD
- `src/main/lib/trpc/routers/github.ts` - Enhanced with token management
- `src/main/lib/trpc/routers/index.ts` - Router registration
- `src/main/index.ts` - ClawDaemon lifecycle integration

### Frontend Layer
- `src/renderer/features/agents/atoms/index.ts` - Added "claws" to SidebarTab
- `src/renderer/features/sidebar/components/claws-tab-content.tsx` - Claws list view
- `src/renderer/features/sidebar/components/create-claw-modal.tsx` - Creation modal
- `src/renderer/features/sidebar/components/execution-history-viewer.tsx` - Log viewer
- `src/renderer/features/sidebar/components/sidebar-tab-bar.tsx` - Added Claws tab
- `src/renderer/features/sidebar/agents-sidebar.tsx` - Tab rendering
- `src/renderer/lib/atoms/index.ts` - Added "github" to SettingsTab
- `src/renderer/components/dialogs/settings-tabs/agents-github-tab.tsx` - GitHub settings
- `src/renderer/components/dialogs/agents-settings-dialog.tsx` - Added GitHub tab
- `src/renderer/components/ui/alert.tsx` - Alert component (created)
- `src/renderer/components/ui/card.tsx` - Card component (created)
- `src/renderer/components/ui/scroll-area.tsx` - ScrollArea component (created)
- `src/renderer/lib/utils.ts` - Added `formatDistanceToNow` helper

## Build Steps

### 1. Install Dependencies
```bash
bun install
```

### 2. Generate/Apply Database Migration
```bash
# Generate migration (already done - 0037_add_claws_tables.sql exists)
bun run db:generate

# Apply migration (happens automatically on app start)
# Or manually:
DB_PATH="$HOME/Library/Application Support/Agents Dev/data/agents.db"
sqlite3 "$DB_PATH" < drizzle/0037_add_claws_tables.sql
```

### 3. Build TypeScript
```bash
bun run build
```

### 4. Run in Development Mode
```bash
bun run dev
```

## Verification Checklist

### UI Verification
- [ ] Claws tab appears in sidebar (Zap icon)
- [ ] Clicking "+ New Claw" opens the creation modal
- [ ] Modal has three trigger types: Manual, Cron Schedule, GitHub Polling
- [ ] Dynamic form fields change based on trigger type selection
- [ ] Execution History Viewer displays in two-pane layout
- [ ] Settings > GitHub tab is accessible and shows token configuration

### Backend Verification
- [ ] ClawDaemon initializes on app startup (check console logs)
- [ ] tRPC endpoints respond correctly:
  - `claws.getAll` returns list of claws
  - `claws.create` creates new claw
  - `claws.update` updates existing claw
  - `claws.toggleEnabled` enables/disables claw
  - `claws.delete` removes claw
  - `claws.trigger` manually triggers execution
  - `claws.getExecutions` returns execution history
- [ ] GitHub token endpoints work:
  - `github.saveToken` encrypts and stores token
  - `github.hasToken` checks if token exists
  - `github.getToken` retrieves token (masked)
  - `github.clearToken` removes token
  - `github.testToken` validates token with API call

### Trigger Verification
- [ ] **Manual Trigger**: Clicking "Run Now" executes Claude Code process
- [ ] **Cron Trigger**: Scheduled execution runs at configured interval
- [ ] **GitHub Poll**: Poller checks for new issues/PRs and triggers

### Execution Verification
- [ ] Process output streams are captured
- [ ] Logs are written to database (claw_executions table)
- [ ] Real-time log streaming works (3-second polling)
- [ ] Execution status updates (pending -> running -> completed/failed)
- [ ] Duration is calculated correctly
- [ ] ANSI color codes are stripped from logs

### Lifecycle Verification
- [ ] ClawDaemon shuts down gracefully on app quit
- [ ] Active cron jobs are stopped
- [ ] Active GitHub pollers are stopped
- [ ] Running processes are allowed to complete (or terminated gracefully)

## Testing Scenarios

### Scenario 1: Create and Run Manual Claw
1. Open Claws tab
2. Click "+ New Claw"
3. Enter name: "Test Manual"
4. Enter instruction: "List files in current directory"
5. Select trigger: "Manual"
6. Save
7. Click "Run Now"
8. Verify execution appears in history with logs

### Scenario 2: Create Cron Claw
1. Create new claw
2. Select trigger: "Cron Schedule"
3. Enter pattern: `*/5 * * * *` (every 5 minutes)
4. Save
5. Wait 5 minutes
6. Verify automatic execution occurred

### Scenario 3: Create GitHub Polling Claw
1. Configure GitHub token in Settings > GitHub
2. Create new claw
3. Select trigger: "GitHub Issue/PR Polling"
4. Enter repository: `owner/repo`
5. Select event type: "New Issues"
6. Save
7. Create a test issue in the repository
8. Wait for polling interval
9. Verify claw triggered on new issue

### Scenario 4: Execution History
1. Run multiple claws
2. Open Execution History Viewer
3. Select different executions
4. Verify logs display correctly
5. Check status indicators (pending, running, completed, failed)

## Deployment

### Build for Production
```bash
# macOS
bun run package:mac

# Windows
bun run package:win

# Linux
bun run package:linux
```

### Database Migration for Existing Users
Existing users will automatically get the new tables when the app starts (auto-migration runs on boot).

## Troubleshooting

### Database Issues
```bash
# Check current schema
sqlite3 "$HOME/Library/Application Support/Agents Dev/data/agents.db" ".schema"

# Check migrations
sqlite3 "$HOME/Library/Application Support/Agents Dev/data/agents.db" "SELECT * FROM __drizzle_migrations"
```

### Process Not Starting
- Check that `npx` is available
- Verify the worktree path exists
- Check console logs for spawn errors

### GitHub Polling Not Working
- Verify token is saved (Settings > GitHub)
- Test token with "Test Connection" button
- Check rate limits in logs

### Logs Not Streaming
- Verify React Query is working
- Check browser dev tools Network tab for tRPC requests
- Verify execution exists in database

## Architecture Summary

```
┌─────────────────────────────────────────────────────────────────┐
│                        Electron Main Process                     │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  ClawDaemon (Singleton)                                   │   │
│  │  ├─ Cron Manager (node-cron schedules)                    │   │
│  │  ├─ GitHub Pollers (ETag-cached API polling)              │   │
│  │  └─ Process Spawner (Claude Code CLI)                     │   │
│  └──────────────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  tRPC Routers                                             │   │
│  │  ├─ clawsRouter (CRUD + trigger)                         │   │
│  │  ├─ githubRouter (token management)                      │   │
│  │  └─ ...existing routers                                  │   │
│  └──────────────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Database (Drizzle + SQLite)                              │   │
│  │  ├─ headless_claws (agent definitions)                   │   │
│  │  ├─ claw_executions (execution history)                  │   │
│  │  └─ github_settings (encrypted tokens)                   │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                                │
                                │ IPC (tRPC)
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Electron Renderer Process                   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Sidebar                                                  │   │
│  │  ├─ ClawsTabContent (list view)                          │   │
│  │  └─ CreateClawModal (creation form)                      │   │
│  └──────────────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Settings Dialog                                          │   │
│  │  └─ AgentsGitHubTab (token configuration)                │   │
│  └──────────────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Execution History Viewer                                 │   │
│  │  └─ Two-pane layout with live log streaming              │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

## Notes

- Claude Code CLI is spawned via `npx @anthropic-ai/claude-code -p [instruction]`
- Non-interactive mode forces immediate execution
- ANSI color codes are stripped for clean log display
- GitHub API uses ETag caching to respect rate limits
- Execution logs are stored in SQLite with JSON array format
- Real-time streaming uses React Query polling (3-second interval)
