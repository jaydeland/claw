import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core"
import { relations } from "drizzle-orm"
import { createId } from "../utils"

// ============ PROJECTS ============
export const projects = sqliteTable("projects", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => createId()),
  name: text("name").notNull(),
  path: text("path").notNull().unique(),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(
    () => new Date(),
  ),
  updatedAt: integer("updated_at", { mode: "timestamp" }).$defaultFn(
    () => new Date(),
  ),
  // Git remote info (extracted from local .git)
  gitRemoteUrl: text("git_remote_url"),
  gitProvider: text("git_provider"), // "github" | "gitlab" | "bitbucket" | null
  gitOwner: text("git_owner"),
  gitRepo: text("git_repo"),
  // Terminal start commands - JSON array of commands to run when a new chat terminal is created
  // These commands run in the persistent PTY shell session after the prompt is ready
  startCommands: text("start_commands").notNull().default("[]"),
})

export const projectsRelations = relations(projects, ({ many }) => ({
  chats: many(chats),
}))

// ============ CHATS ============
export const chats = sqliteTable("chats", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => createId()),
  name: text("name"),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(
    () => new Date(),
  ),
  updatedAt: integer("updated_at", { mode: "timestamp" }).$defaultFn(
    () => new Date(),
  ),
  archivedAt: integer("archived_at", { mode: "timestamp" }),
  // Worktree fields (for git isolation per chat)
  worktreePath: text("worktree_path"),
  branch: text("branch"),
  baseBranch: text("base_branch"),
  // PR tracking fields
  prUrl: text("pr_url"),
  prNumber: integer("pr_number"),
  // Transient chat flag (for temporary mini-conversations like MCP config dialog)
  isTransient: integer("is_transient", { mode: "boolean" }).default(false),
})

export const chatsRelations = relations(chats, ({ one, many }) => ({
  project: one(projects, {
    fields: [chats.projectId],
    references: [projects.id],
  }),
  subChats: many(subChats),
}))

// ============ SUB-CHATS ============
export const subChats = sqliteTable("sub_chats", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => createId()),
  name: text("name"),
  chatId: text("chat_id")
    .notNull()
    .references(() => chats.id, { onDelete: "cascade" }),
  sessionId: text("session_id"), // Claude SDK session ID for resume
  streamId: text("stream_id"), // Track in-progress streams
  mode: text("mode").notNull().default("agent"), // "plan" | "agent"
  model: text("model").default("sonnet"), // "opus" | "sonnet" | "haiku" (defaults to sonnet)
  messages: text("messages").notNull().default("[]"), // JSON array
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(
    () => new Date(),
  ),
  updatedAt: integer("updated_at", { mode: "timestamp" }).$defaultFn(
    () => new Date(),
  ),
})

export const subChatsRelations = relations(subChats, ({ one }) => ({
  chat: one(chats, {
    fields: [subChats.chatId],
    references: [chats.id],
  }),
}))

// ============ CLAUDE CODE CREDENTIALS ============
// Stores encrypted OAuth token for Claude Code integration
export const claudeCodeCredentials = sqliteTable("claude_code_credentials", {
  id: text("id").primaryKey().default("default"), // Single row, always "default"
  oauthToken: text("oauth_token").notNull(), // Encrypted with safeStorage
  connectedAt: integer("connected_at", { mode: "timestamp" }).$defaultFn(
    () => new Date(),
  ),
  userId: text("user_id"), // Desktop auth user ID (for reference)
})

// ============ CLAUDE CODE SETTINGS ============
// Stores user-configurable Claude Code binary and environment settings
export const claudeCodeSettings = sqliteTable("claude_code_settings", {
  id: text("id").primaryKey().default("default"), // Single row, always "default"
  customBinaryPath: text("custom_binary_path"), // Path to user-specified Claude binary (null = use bundled)
  customEnvVars: text("custom_env_vars").notNull().default("{}"), // JSON object of custom env vars
  customConfigDir: text("custom_config_dir"), // Path to Claude config dir (null = use per-subchat isolated)
  customWorktreeLocation: text("custom_worktree_location"), // Custom base path for worktrees with env var support (null = use ~/.21st/worktrees)
  mcpServerSettings: text("mcp_server_settings").notNull().default("{}"), // JSON object of MCP server overrides
  authMode: text("auth_mode").notNull().default("oauth"), // "oauth" | "aws" | "apiKey"
  apiKey: text("api_key"), // API key for apiKey mode (encrypted)
  bedrockRegion: text("bedrock_region").notNull().default("us-east-1"), // AWS region for Bedrock
  anthropicBaseUrl: text("anthropic_base_url"), // Custom Anthropic API base URL (for API key mode)
  updatedAt: integer("updated_at", { mode: "timestamp" }).$defaultFn(
    () => new Date(),
  ),

  // AWS Bedrock connection method
  bedrockConnectionMethod: text("bedrock_connection_method").default("profile"), // "sso" | "profile"

  // AWS Profile mode
  awsProfileName: text("aws_profile_name"), // Name of AWS profile in ~/.aws/credentials

  // AWS SSO Configuration
  ssoStartUrl: text("sso_start_url"),
  ssoRegion: text("sso_region"),
  ssoAccountId: text("sso_account_id"),
  ssoAccountName: text("sso_account_name"), // Display name
  ssoRoleName: text("sso_role_name"),

  // SSO Tokens (encrypted with safeStorage)
  ssoAccessToken: text("sso_access_token"),
  ssoRefreshToken: text("sso_refresh_token"),
  ssoTokenExpiresAt: integer("sso_token_expires_at", { mode: "timestamp" }),

  // OIDC Client registration (for device auth)
  ssoClientId: text("sso_client_id"),
  ssoClientSecret: text("sso_client_secret"), // Encrypted
  ssoClientExpiresAt: integer("sso_client_expires_at", { mode: "timestamp" }),

  // Cached AWS credentials (encrypted)
  awsAccessKeyId: text("aws_access_key_id"),
  awsSecretAccessKey: text("aws_secret_access_key"),
  awsSessionToken: text("aws_session_token"),
  awsCredentialsExpiresAt: integer("aws_credentials_expires_at", { mode: "timestamp" }),

  // VPN connectivity check
  vpnCheckEnabled: integer("vpn_check_enabled", { mode: "boolean" }).notNull().default(false), // Enable/disable VPN status monitoring
  vpnCheckUrl: text("vpn_check_url"), // Internal URL to check for VPN connectivity (e.g. https://internal.company.com)

  // Default terminal start commands - JSON array of commands to run when a new project terminal is created
  // These are used as defaults for new projects
  defaultStartCommands: text("default_start_commands").notNull().default("[]"),

  // AWS Bedrock model overrides (for Bedrock API)
  bedrockOpusModel: text("bedrock_opus_model").default("global.anthropic.claude-opus-4-5-20251101-v1:0"),
  bedrockOpus46Model: text("bedrock_opus_46_model").default("global.anthropic.claude-opus-4-6-20260205-v1:0"), // Opus 4.6 (Binary 2.1.32+)
  bedrockSonnetModel: text("bedrock_sonnet_model").default("us.anthropic.claude-sonnet-4-5-20250929-v1:0[1m]"),
  bedrockHaikuModel: text("bedrock_haiku_model").default("us.anthropic.claude-haiku-4-5-20251001-v1:0[1m]"),
  maxMcpOutputTokens: integer("max_mcp_output_tokens").notNull().default(150000), // MCP tool output limit
  maxThinkingTokens: integer("max_thinking_tokens").notNull().default(60000), // Thinking token limit (64k max for Bedrock)

  // Experimental features (SDK 0.2.34+)
  enableAgentTeams: integer("enable_agent_teams", { mode: "boolean" }).notNull().default(false), // Enable multi-agent collaboration (experimental)
  maxBudgetUsd: integer("max_budget_usd"), // Max USD cost per query (null = unlimited)

  // Background session models (for utility tasks like MCP queries, title generation, etc.)
  anthropicBackgroundModel: text("anthropic_background_model").default("haiku"), // "opus" | "sonnet" | "haiku"
  bedrockBackgroundModel: text("bedrock_background_model"), // Bedrock model ID (null = use bedrockHaikuModel)
  ollamaBackgroundModel: text("ollama_background_model"), // Ollama model name (null = use default config model)
  customApiBackgroundModel: text("custom_api_background_model"), // Custom API model (null = use default config model)
})

// ============ MCP SERVER CREDENTIALS ============
// Stores encrypted credentials for MCP servers
export const mcpCredentials = sqliteTable("mcp_credentials", {
  id: text("id").primaryKey(), // Server name from mcp.json
  credentials: text("credentials").notNull().default("{}"), // JSON object of encrypted credentials
  updatedAt: integer("updated_at", { mode: "timestamp" }).$defaultFn(
    () => new Date(),
  ),
})

// ============ CONFIG SOURCES ============
// Stores custom configuration file paths (mcp.json files and plugin directories)
export const configSources = sqliteTable("config_sources", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => createId()),
  type: text("type", { enum: ["mcp", "plugin"] }).notNull(), // Type of configuration source
  path: text("path").notNull(), // Absolute path to the config file or directory
  priority: integer("priority").notNull().default(50), // Lower = higher priority (project=10, user=100, custom=50+)
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true), // Whether this source is active
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(
    () => new Date(),
  ),
})

// ============ BACKGROUND TASKS ============
// Tracks minimal essential data for background tasks started by Claude
// Stores metadata for background tasks started by the Claude SDK
// Static metadata (command, description) stored here for immediate availability
// Dynamic data (output, exitCode) derived from messages for accuracy
export const backgroundTasks = sqliteTable("background_tasks", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => createId()),
  subChatId: text("sub_chat_id")
    .notNull()
    .references(() => subChats.id, { onDelete: "cascade" }),
  chatId: text("chat_id")
    .notNull()
    .references(() => chats.id, { onDelete: "cascade" }),
  toolCallId: text("tool_call_id").notNull().unique(), // Links to the Bash tool call in messages
  outputFile: text("output_file"), // Path to output file for reading large logs
  pid: integer("pid"), // DEPRECATED: Process ID - SDK doesn't provide PIDs, use sdkTaskId + sdkStatus instead
  sdkTaskId: text("sdk_task_id"), // The SDK's internal task identifier (NOT a PID - it's a string like "uuid-based-id")
  sdkStatus: text("sdk_status"), // Status from SDK task_notification: "completed" | "failed" | "stopped" | null (pending)
  command: text("command"), // Command that was executed (e.g. "bun run dev")
  description: text("description"), // Optional description of what the command does
})

export const backgroundTasksRelations = relations(backgroundTasks, ({ one }) => ({
  subChat: one(subChats, {
    fields: [backgroundTasks.subChatId],
    references: [subChats.id],
  }),
  chat: one(chats, {
    fields: [backgroundTasks.chatId],
    references: [chats.id],
  }),
}))

// ============ APP SETTINGS ============
// Stores application-level settings and migration tracking
export const appSettings = sqliteTable("app_settings", {
  id: text("id").primaryKey().default("default"), // Single row, always "default"
  lastMigrationVersion: text("last_migration_version"), // Tracks last applied migration version (for data migrations)
  updatedAt: integer("updated_at", { mode: "timestamp" }).$defaultFn(
    () => new Date(),
  ),
})

// ============ DEVSPACE SETTINGS ============
// Stores configurable settings for DevSpace integration
export const devspaceSettings = sqliteTable("devspace_settings", {
  id: text("id").primaryKey().default("default"), // Single row, always "default"
  reposPath: text("repos_path"), // Path to check for repos (replaces \$VIDYARD_PATH)
  configSubPath: text("config_sub_path").notNull().default("devspace.yaml"), // Sub path to check for devspace config (e.g. "devspace.yaml" or "deploy/devspace.yaml")
  startCommand: text("start_command").notNull().default("devspace dev"), // Command to run (defaults to "devspace dev", replaces "dy dev")
  updatedAt: integer("updated_at", { mode: "timestamp" }).$defaultFn(
    () => new Date(),
  ),
})

// ============ MCP TOOL CACHE ============
// Caches tool counts and names for MCP servers to avoid querying on every load
export const mcpToolCache = sqliteTable("mcp_tool_cache", {
  serverId: text("server_id").primaryKey(), // Server name from mcp.json
  toolCount: integer("tool_count").notNull(),
  toolNames: text("tool_names").notNull().default("[]"), // JSON array of tool names
  lastQueried: integer("last_queried", { mode: "timestamp" }).$defaultFn(
    () => new Date(),
  ),
  configHash: text("config_hash"), // Hash of server config to invalidate on change
})

// ============ DEVSPACE STARTED PROCESSES ============
// Tracks processes started by this application
export const devspaceStartedProcesses = sqliteTable("devspace_started_processes", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => createId()),
  pid: integer("pid").notNull(), // Process ID
  serviceName: text("service_name").notNull(), // Name of the service
  servicePath: text("service_path").notNull(), // Path to the service
  terminalPaneId: text("terminal_pane_id"), // Associated terminal pane ID (for terminal integration)
  startedAt: integer("started_at", { mode: "timestamp" }).$defaultFn(
    () => new Date(),
  ),
})


// ============ ANALYSIS DIAGRAMS ============
// Stores generated React Flow diagram data for project analysis
// Types: "codeflow" | "db" | "architecture" | "build"
export const analysisDiagrams = sqliteTable("analysis_diagrams", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => createId()),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  type: text("type").notNull(), // "codeflow" | "db" | "architecture" | "build"
  status: text("status").notNull().default("pending"), // "pending" | "generating" | "complete" | "error"
  // React Flow data stored as JSON
  nodes: text("nodes").notNull().default("[]"), // JSON array of React Flow nodes
  edges: text("edges").notNull().default("[]"), // JSON array of React Flow edges
  viewport: text("viewport"), // JSON { x, y, zoom } for saved viewport position
  // Analysis metadata
  summary: text("summary"), // Human-readable summary of the analysis
  stats: text("stats").notNull().default("{}"), // JSON { fileCount, lineCount, etc. }
  errorMessage: text("error_message"), // Error details if generation failed
  // Source tracking for updates
  lastCommitHash: text("last_commit_hash"), // Git commit hash when diagram was generated
  fileHash: text("file_hash"), // Hash of analyzed files for change detection
  // Timestamps
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(
    () => new Date(),
  ),
  updatedAt: integer("updated_at", { mode: "timestamp" }).$defaultFn(
    () => new Date(),
  ),
}, (table) => ({
  // Indexes for common query patterns
  projectIdIdx: index("analysis_diagrams_project_id_idx").on(table.projectId),
  typeIdx: index("analysis_diagrams_type_idx").on(table.type),
  projectTypeIdx: index("analysis_diagrams_project_type_idx").on(table.projectId, table.type),
  statusIdx: index("analysis_diagrams_status_idx").on(table.status),
}))

export const analysisDiagramsRelations = relations(analysisDiagrams, ({ one }) => ({
  project: one(projects, {
    fields: [analysisDiagrams.projectId],
    references: [projects.id],
  }),
}))

// Analysis job tracking - tracks in-progress analysis tasks
export const analysisJobs = sqliteTable("analysis_jobs", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => createId()),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  diagramId: text("diagram_id")
    .notNull()
    .references(() => analysisDiagrams.id, { onDelete: "cascade" }),
  type: text("type").notNull(), // "codeflow" | "db" | "architecture" | "build"
  status: text("status").notNull().default("running"), // "running" | "completed" | "failed"
  taskCallId: text("task_call_id"), // Tool call ID from Task tool for tracking
  log: text("log").notNull().default("[]"), // JSON array of log entries
  errorMessage: text("error_message"),
  startedAt: integer("started_at", { mode: "timestamp" }).$defaultFn(
    () => new Date(),
  ),
  completedAt: integer("completed_at", { mode: "timestamp" }),
}, (table) => ({
  projectIdIdx: index("analysis_jobs_project_id_idx").on(table.projectId),
  diagramIdIdx: index("analysis_jobs_diagram_id_idx").on(table.diagramId),
  statusIdx: index("analysis_jobs_status_idx").on(table.status),
}))

export const analysisJobsRelations = relations(analysisJobs, ({ one }) => ({
  project: one(projects, {
    fields: [analysisJobs.projectId],
    references: [projects.id],
  }),
  diagram: one(analysisDiagrams, {
    fields: [analysisJobs.diagramId],
    references: [analysisDiagrams.id],
  }),
}))

// ============ HEADLESS CLAWS ============
// Stores headless agent definitions (autonomous background agents)
export const headlessClaws = sqliteTable("headless_claws", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => createId()),
  name: text("name").notNull(),
  instruction: text("instruction").notNull(), // The prompt/task passed to Claude
  targetWorktree: text("target_worktree").notNull(), // Absolute path to the isolated Git worktree
  triggerType: text("trigger_type", { enum: ["cron", "github_poll", "manual", "slack_mention", "whatsapp_message"] }).notNull(),
  triggerConfig: text("trigger_config").notNull(), // JSON: cron expression, GitHub repo, or chat filter
  isEnabled: integer("is_enabled", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
})

export const headlessClawsRelations = relations(headlessClaws, ({ many }) => ({
  executions: many(clawExecutions),
}))

// ============ CLAW EXECUTIONS ============
// Tracks the history and logs of headless agent runs
export const clawExecutions = sqliteTable("claw_executions", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => createId()),
  clawId: text("claw_id")
    .notNull()
    .references(() => headlessClaws.id, { onDelete: "cascade" }),
  status: text("status", { enum: ["running", "success", "failed"] }).notNull(),
  logs: text("logs").notNull().default(""), // Standard output/error buffer
  exitCode: integer("exit_code"), // Process exit code (null if still running)
  startedAt: integer("started_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
  completedAt: integer("completed_at", { mode: "timestamp" }),
}, (table) => ({
  clawIdIdx: index("claw_executions_claw_id_idx").on(table.clawId),
  statusIdx: index("claw_executions_status_idx").on(table.status),
  startedAtIdx: index("claw_executions_started_at_idx").on(table.startedAt),
}))

export const clawExecutionsRelations = relations(clawExecutions, ({ one }) => ({
  claw: one(headlessClaws, {
    fields: [clawExecutions.clawId],
    references: [headlessClaws.id],
  }),
}))

// ============ GITHUB SETTINGS ============
// Secure storage for GitHub credentials
export const githubSettings = sqliteTable("github_settings", {
  id: text("id").primaryKey().default("default"), // Single row, always "default"
  encryptedToken: text("encrypted_token"), // GitHub PAT encrypted via safeStorage (null if not set)
  updatedAt: integer("updated_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
})

// ============ SLACK SETTINGS ============
// Secure storage for Slack app credentials
export const slackSettings = sqliteTable("slack_settings", {
  id: text("id").primaryKey().default("default"), // Single row, always "default"
  encryptedAppToken: text("encrypted_app_token"), // xapp-... token encrypted via safeStorage
  encryptedBotToken: text("encrypted_bot_token"), // xoxb-... token encrypted via safeStorage
  isSocketModeEnabled: integer("is_socket_mode_enabled", { mode: "boolean" }).default(false),
  updatedAt: integer("updated_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
})

// ============ WHATSAPP SETTINGS ============
// Storage for WhatsApp connection status (uses QR auth, no tokens to store)
export const whatsappSettings = sqliteTable("whatsapp_settings", {
  id: text("id").primaryKey().default("default"), // Single row, always "default"
  isConnected: integer("is_connected", { mode: "boolean" }).default(false),
  sessionPath: text("session_path").default("baileys_auth"),
  updatedAt: integer("updated_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
})

// ============ SYSTEM PROMPTS ============
// Stores editable system prompts for AI interactions
export const systemPrompts = sqliteTable("system_prompts", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => createId()),
  key: text("key").notNull().unique(), // e.g. "mcp_config", "review", "title_generation"
  name: text("name").notNull(), // Display name
  description: text("description").notNull(), // What this prompt is used for
  content: text("content").notNull(), // The actual prompt text
  category: text("category").notNull().default("general"), // "mcp", "analysis", "chat", "background"
  isEditable: integer("is_editable", { mode: "boolean" }).notNull().default(true),
  defaultValue: text("default_value").notNull(), // Original value for reset
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(
    () => new Date(),
  ),
  updatedAt: integer("updated_at", { mode: "timestamp" }).$defaultFn(
    () => new Date(),
  ),
}, (table) => ({
  categoryIdx: index("system_prompts_category_idx").on(table.category),
  keyIdx: index("system_prompts_key_idx").on(table.key),
}))

// ============ TYPE EXPORTS ============
export type SubChatMode = "plan" | "agent"
export type ClawTriggerType = "cron" | "github_poll" | "manual" | "slack_mention" | "whatsapp_message"

export type Project = typeof projects.$inferSelect
export type NewProject = typeof projects.$inferInsert
export type Chat = typeof chats.$inferSelect
export type NewChat = typeof chats.$inferInsert
export type SubChat = typeof subChats.$inferSelect
export type NewSubChat = typeof subChats.$inferInsert
export type ClaudeCodeCredential = typeof claudeCodeCredentials.$inferSelect
export type NewClaudeCodeCredential = typeof claudeCodeCredentials.$inferInsert
export type ClaudeCodeSettings = typeof claudeCodeSettings.$inferSelect
export type NewClaudeCodeSettings = typeof claudeCodeSettings.$inferInsert
export type McpCredential = typeof mcpCredentials.$inferSelect
export type NewMcpCredential = typeof mcpCredentials.$inferInsert
export type ConfigSource = typeof configSources.$inferSelect
export type NewConfigSource = typeof configSources.$inferInsert
export type BackgroundTask = typeof backgroundTasks.$inferSelect
export type NewBackgroundTask = typeof backgroundTasks.$inferInsert
export type AppSettings = typeof appSettings.$inferSelect
export type NewAppSettings = typeof appSettings.$inferInsert
export type DevspaceSettings = typeof devspaceSettings.$inferSelect
export type NewDevspaceSettings = typeof devspaceSettings.$inferInsert
export type DevspaceStartedProcess = typeof devspaceStartedProcesses.$inferSelect
export type NewDevspaceStartedProcess = typeof devspaceStartedProcesses.$inferInsert
export type McpToolCache = typeof mcpToolCache.$inferSelect
export type NewMcpToolCache = typeof mcpToolCache.$inferInsert

// Analysis diagram types
export type AnalysisDiagram = typeof analysisDiagrams.$inferSelect
export type NewAnalysisDiagram = typeof analysisDiagrams.$inferInsert
export type AnalysisJob = typeof analysisJobs.$inferSelect
export type NewAnalysisJob = typeof analysisJobs.$inferInsert

// Headless claws types
export type HeadlessClaw = typeof headlessClaws.$inferSelect
export type NewHeadlessClaw = typeof headlessClaws.$inferInsert
export type ClawExecution = typeof clawExecutions.$inferSelect
export type NewClawExecution = typeof clawExecutions.$inferInsert
export type GithubSettings = typeof githubSettings.$inferSelect
export type NewGithubSettings = typeof githubSettings.$inferInsert

// Chat platform integration types
export type SlackSettings = typeof slackSettings.$inferSelect
export type NewSlackSettings = typeof slackSettings.$inferInsert
export type WhatsappSettings = typeof whatsappSettings.$inferSelect
export type NewWhatsappSettings = typeof whatsappSettings.$inferInsert

// System prompts types
export type SystemPrompt = typeof systemPrompts.$inferSelect
export type NewSystemPrompt = typeof systemPrompts.$inferInsert
