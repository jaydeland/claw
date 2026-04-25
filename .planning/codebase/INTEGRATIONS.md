# External Integrations

**Analysis Date:** 2026-02-05

## APIs & External Services

**Claude AI:**
- Anthropic API (OAuth or API key mode) - Core AI functionality
  - SDK: `@anthropic-ai/claude-agent-sdk` 0.2.12
  - Auth: OAuth token (encrypted) or API key (encrypted)
  - Features: Streaming, tool use, background tasks
  - Location: `src/main/lib/claude/`

**AWS Bedrock:**
- Alternative Claude provider via AWS
  - SDK: AWS SDK v3 (`@aws-sdk/client-*`)
  - Auth: SSO or IAM profile credentials (encrypted)
  - Region: Configurable (default: us-east-1)
  - Models: Opus, Sonnet, Haiku on Bedrock
  - Location: `src/main/lib/aws/`

**AWS EKS:**
- Kubernetes cluster integration
  - SDK: `@aws-sdk/client-eks`
  - Auth: Shared with Bedrock (SSO/profile)
  - Features: List clusters, generate kubeconfig
  - Location: `src/main/lib/aws/eks-service.ts`

**GitHub/GitLab/Bitbucket:**
- Git remote providers (read-only via git)
  - Integration: `simple-git` for local operations
  - API: GitHub API for PR creation (via SDK)
  - Auth: Git credentials from system
  - Location: `src/main/lib/git/github/`

## Data Storage

**Database:**
- SQLite via better-sqlite3 - Primary data store
  - Location: `{userData}/data/agents.db`
  - Client: Drizzle ORM 0.45.1
  - Migrations: 30+ files in `drizzle/`, auto-applied on startup
  - Schema: `src/main/lib/db/schema/index.ts`

**File Storage:**
- Local file system - Projects, worktrees, config
  - Worktrees: `~/.21st/worktrees/{chat-id}/`
  - Config: `{userData}/` via Electron app.getPath()
  - MCP cache: `mcpToolCache` table

**Encrypted Storage:**
- Electron safeStorage - Credentials, tokens
  - Data: OAuth tokens, API keys, AWS credentials, MCP creds
  - Location: SQLite tables with encrypted values

## Authentication & Identity

**Claude Code OAuth:**
- Provider: Anthropic
  - Flow: Device code flow via browser
  - Token storage: `claudeCodeCredentials` table (encrypted)
  - Refresh: Automatic via SDK

**AWS SSO:**
- Provider: AWS IAM Identity Center
  - Flow: OIDC device flow
  - Token storage: `claudeCodeSettings` table (encrypted)
  - Credentials: Cached and rotated automatically

**AWS Profile:**
- Provider: AWS CLI credentials file
  - Location: `~/.aws/credentials`
  - Usage: Named profile selection in settings

## MCP (Model Context Protocol)

**MCP Servers:**
- External tool integration framework
  - Config: `mcp.json` files (project, user, global)
  - Discovery: `src/main/lib/config/consolidator.ts`
  - Credentials: Per-server in `mcpCredentials` table (encrypted)
  - Injection: `src/main/lib/mcp/credential-injection.ts`

**OAuth Detection:**
- Automatic OAuth flow detection for MCP servers
  - Location: `src/main/lib/mcp/oauth-detection.ts`
  - Window: `src/main/lib/mcp/oauth-window.ts`

## Terminal Integration

**Shell/PTY:**
- node-pty - Pseudo-terminal spawning
  - Platform: Platform-specific PTY (macOS/Windows/Linux)
  - Shell: User's default shell
  - Integration: xterm.js in renderer

**xterm.js:**
- Terminal emulator in browser
  - Addons: Canvas, fit, search, serialize, web-links, WebGL
  - Theme: Matches app theme
  - Location: `src/renderer/features/terminal/`

## Auto-Updater

**electron-updater:**
- Automatic update checking and downloading
  - Source: Cloudflare R2 (configured in electron-builder)
  - Channels: Stable releases
  - Trigger: On app focus + startup (5s delay)
  - Location: `src/main/lib/auto-updater.ts`

## Environment Configuration

**Development:**
- Required: Node.js, bun, Flox (optional)
- Secrets: None (Claude Code uses dev OAuth)
- Binaries: Downloaded to `resources/bin/` via script

**Production:**
- Secrets: Stored in SQLite (encrypted)
- Distribution: electron-builder packages
- Updates: Automatic via electron-updater

## Environment Variables

**Build-time:**
- `ELECTRON_RENDERER_URL` - Dev server URL (dev mode only)
- `VERCEL` - Skip postinstall rebuild when truthy
- `PYTHON` - Python path for electron-rebuild

**Runtime:**
- `CLAW_CONFIG_DIR` - Custom config directory (optional)
- `CLAUDE_CODE_DEBUG` - Enable debug logging (optional)

---

*Integration audit: 2026-02-05*
*Update when adding/removing external services*
