import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core"
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
  vpnCheckUrl: text("vpn_check_url"), // Internal URL to check for VPN connectivity (e.g., https://internal.company.com)
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

// ============ APP SETTINGS ============
// Stores application-level settings and migration tracking
export const appSettings = sqliteTable("app_settings", {
  id: text("id").primaryKey().default("default"), // Single row, always "default"
  lastMigrationVersion: text("last_migration_version"), // Tracks last applied migration version (for data migrations)
  updatedAt: integer("updated_at", { mode: "timestamp" }).$defaultFn(
    () => new Date(),
  ),
})

// ============ CLAUDE BINARY VERSIONS ============
// Stores downloaded Claude Code binary versions for runtime switching
export const claudeBinaryVersions = sqliteTable("claude_binary_versions", {
  id: text("id").primaryKey(), // Version string e.g. "2.1.5"
  platform: text("platform").notNull(), // "darwin-arm64", "darwin-x64", "linux-x64", "win32-x64"
  path: text("path").notNull(), // Full path to binary
  checksum: text("checksum"), // SHA256 for verification
  size: integer("size"), // File size in bytes
  downloadedAt: integer("downloaded_at", { mode: "timestamp" }).$defaultFn(
    () => new Date(),
  ),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(false),
  isBundled: integer("is_bundled", { mode: "boolean" }).notNull().default(false),
})

// ============ TYPE EXPORTS ============
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
export type AppSettings = typeof appSettings.$inferSelect
export type NewAppSettings = typeof appSettings.$inferInsert
export type ClaudeBinaryVersion = typeof claudeBinaryVersions.$inferSelect
export type NewClaudeBinaryVersion = typeof claudeBinaryVersions.$inferInsert
