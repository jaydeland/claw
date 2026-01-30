# External Integrations

**Analysis Date:** 2025-01-30

## APIs & External Services

**Claude AI (Primary AI Provider):**
- SDK: `@anthropic-ai/claude-agent-sdk` ^0.2.12
- Implementation: `src/main/lib/claude/` and `src/main/lib/trpc/routers/claude.ts`
- Auth modes: OAuth token, AWS Bedrock, Direct API key
- Features: Streaming, tool use, session resume, MCP servers
- Models: Opus 4.5, Sonnet 4.5, Haiku 4.5

**21st.dev Backend:**
- Purpose: Authentication, user management
- Base URL: `https://21st.dev` (production), configurable via `MAIN_VITE_API_URL` (dev)
- Auth flow: OAuth with deep link callback (`twentyfirst-agents://auth?code=xxx`)
- Implementation: `src/main/auth-manager.ts`
- Endpoints:
  - `POST /api/auth/desktop/exchange` - Exchange auth code for tokens
  - Token refresh handled automatically

**Ollama (Local AI Fallback):**
- Purpose: Offline mode when internet unavailable
- Base URL: `http://localhost:11434`
- Implementation: `src/main/lib/ollama/detector.ts`
- Recommended models: qwen2.5-coder, deepseek-coder, codestral
- Auto-detection: Checks `/api/tags` endpoint for available models

## AWS Integration

**AWS SSO/OIDC:**
- Packages: `@aws-sdk/client-sso`, `@aws-sdk/client-sso-oidc`, `@aws-sdk/client-sts`
- Implementation: `src/main/lib/aws/sso-service.ts`, `src/main/lib/trpc/routers/aws-sso.ts`
- Purpose: Authenticate to AWS Bedrock via SSO
- Flow: Device authorization (user code + browser verification)
- Stored: SSO tokens, role credentials (encrypted in DB)

**AWS Bedrock:**
- Purpose: Alternative Claude API provider (enterprise)
- Connection methods: SSO, AWS Profile (~/.aws/credentials)
- Model overrides: Configurable per-instance Bedrock model ARNs
- Regions: Configurable, default `us-east-1`

**AWS EKS:**
- Package: `@aws-sdk/client-eks`
- Implementation: `src/main/lib/aws/eks-service.ts`
- Purpose: Kubernetes cluster management

## Data Storage

**SQLite Database:**
- Driver: `better-sqlite3` 11.8.1
- ORM: Drizzle ORM 0.45.1
- Location: `{userData}/data/agents.db`
- Schema: `src/main/lib/db/schema/index.ts`
- Tables: projects, chats, sub_chats, claude_code_credentials, claude_code_settings, mcp_credentials, config_sources, background_tasks, app_settings
- Features: WAL mode, foreign keys, auto-migration on startup

**File Storage:**
- Git worktrees: `~/.21st/worktrees/` (configurable)
- Claude sessions: `{userData}/claude-sessions/{subChatId}/`
- MCP status cache: `{userData}/cache/mcp-status.json`
- Logs: `{userData}/logs/`

**Credential Storage:**
- Electron `safeStorage` API for encryption
- OAuth tokens stored encrypted in SQLite
- AWS credentials stored encrypted in SQLite

## Monitoring & Observability

**Sentry (Error Tracking):**
- Package: `@sentry/electron` ^7.5.0
- Implementation: `src/main/index.ts` (main), `src/renderer/main.tsx` (renderer)
- Config: `MAIN_VITE_SENTRY_DSN` environment variable
- Enabled: Production only (not in dev mode)
- Captured: Streaming errors, crash reports

**PostHog (Analytics):**
- Packages: `posthog-node` ^5.20.0 (main), `posthog-js` ^1.239.1 (renderer)
- Implementation: `src/main/lib/analytics.ts`, `src/renderer/lib/analytics.ts`
- Config: `MAIN_VITE_POSTHOG_KEY`, `VITE_POSTHOG_KEY`
- Host: `https://us.i.posthog.com`
- Events: app_opened, auth_completed, project_opened, workspace_created, message_sent, pr_created
- Opt-out: User can disable analytics

**Logging:**
- Package: `electron-log` ^5.4.3
- Console logging with prefixes (`[claude]`, `[DB]`, `[Auth]`, etc.)
- Raw Claude messages logged to `{userData}/logs/claude-raw-{chatId}.jsonl`

## CI/CD & Distribution

**Auto-Updates:**
- Package: `electron-updater` ^6.7.3
- Implementation: `src/main/lib/auto-updater.ts`
- CDN: `https://cdn.21st.dev/releases/desktop`
- Manifests: `latest-mac.yml`, `latest-mac-x64.yml`
- Flow: Check on startup + window focus (1min cooldown) -> Download -> Quit and install

**Homebrew:**
- Custom cask at `your-org/claw/claw`
- Generated via `scripts/generate-homebrew-cask.mjs`

**Code Signing (macOS):**
- Notarization via `xcrun notarytool`
- Keychain profile: `21st-notarize`
- Entitlements: `build/entitlements.mac.plist`

## Terminal & PTY

**node-pty:**
- Package: `node-pty` ^1.1.0
- Implementation: `src/main/lib/terminal/manager.ts`, `src/main/lib/terminal/session.ts`
- Purpose: Native terminal sessions for shell access
- Features: Multi-session, resize, shell fallback, initial commands

**xterm.js:**
- Package: `xterm` ^5.3.0 (with addons)
- Implementation: Renderer process terminal UI
- Addons: canvas, fit, search, serialize, web-links, webgl

## Git Integration

**simple-git:**
- Package: `simple-git` ^3.28.0
- Implementation: `src/main/lib/git/` directory
- Features: Status, diff, staging, commit, worktree management, branch operations
- GitHub: PR creation via `gh` CLI

**File Watching:**
- Package: `chokidar` ^5.0.0
- Implementation: `src/main/lib/git/watcher/`
- Purpose: Watch for file changes, trigger UI updates

## MCP (Model Context Protocol)

**Implementation:** `src/main/lib/config/consolidator.ts`
- Config sources: project `.mcp.json`, user `~/.claude/mcp.json`, custom paths
- Server status caching: `{userData}/cache/mcp-status.json`
- Warmup: Initialize servers at app startup for faster first chat

## VPN Connectivity

**Purpose:** Check enterprise VPN status for AWS SSO
- Implementation: `src/main/lib/trpc/routers/aws-sso.ts` (`checkVpnStatus`)
- Methods: Custom URL check (HTTP HEAD), DNS lookup fallback
- Configurable: `vpnCheckEnabled`, `vpnCheckUrl` in settings

## Environment Configuration

**Required env vars (none required for basic operation):**
All integrations are optional and gracefully degrade.

**Optional env vars:**
- `MAIN_VITE_SENTRY_DSN` - Enable error tracking
- `MAIN_VITE_POSTHOG_KEY` / `VITE_POSTHOG_KEY` - Enable analytics
- `MAIN_VITE_API_URL` - Override 21st.dev API (dev only)
- `VITE_FEEDBACK_URL` - Custom feedback channel

**Secrets location:**
- OAuth tokens: SQLite database (encrypted via safeStorage)
- AWS credentials: SQLite database (encrypted)
- No `.env` file required for normal operation

## Webhooks & Callbacks

**Incoming (Deep Links):**
- Protocol: `twentyfirst-agents://` (prod), `twentyfirst-agents-dev://` (dev)
- Handlers: `twentyfirst-agents://auth?code=xxx` - OAuth callback

**Outgoing:**
- None (all API calls are request/response)

---

*Integration audit: 2025-01-30*
