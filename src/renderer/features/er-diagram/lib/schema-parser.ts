import type { ColumnData, TableNodeData } from "../components/er-table-node"
import type { Node, Edge } from "reactflow"
import { MarkerType } from "reactflow"

/**
 * Static schema definition for Claw database
 * Extracted from src/main/lib/db/schema/index.ts
 * This is used to generate the ER diagram
 */
export interface TableSchema {
  name: string
  columns: {
    name: string
    type: string
    isPrimaryKey: boolean
    isForeignKey: boolean
    isNotNullable: boolean
    hasDefault: boolean
    foreignKeyTarget?: { table: string; column: string }
  }[]
  description?: string
}

/**
 * Complete schema definition for Claw database
 */
export const clawSchema: TableSchema[] = [
  {
    name: "projects",
    description: "Local project folders with Git metadata",
    columns: [
      { name: "id", type: "text", isPrimaryKey: true, isForeignKey: false, isNotNullable: true, hasDefault: true },
      { name: "name", type: "text", isPrimaryKey: false, isForeignKey: false, isNotNullable: true, hasDefault: false },
      { name: "path", type: "text", isPrimaryKey: false, isForeignKey: false, isNotNullable: true, hasDefault: false },
      { name: "createdAt", type: "timestamp", isPrimaryKey: false, isForeignKey: false, isNotNullable: false, hasDefault: true },
      { name: "updatedAt", type: "timestamp", isPrimaryKey: false, isForeignKey: false, isNotNullable: false, hasDefault: true },
      { name: "gitRemoteUrl", type: "text", isPrimaryKey: false, isForeignKey: false, isNotNullable: false, hasDefault: false },
      { name: "gitProvider", type: "text", isPrimaryKey: false, isForeignKey: false, isNotNullable: false, hasDefault: false },
      { name: "gitOwner", type: "text", isPrimaryKey: false, isForeignKey: false, isNotNullable: false, hasDefault: false },
      { name: "gitRepo", type: "text", isPrimaryKey: false, isForeignKey: false, isNotNullable: false, hasDefault: false },
      { name: "startCommands", type: "text", isPrimaryKey: false, isForeignKey: false, isNotNullable: true, hasDefault: true },
      { name: "mcpOverrides", type: "text", isPrimaryKey: false, isForeignKey: false, isNotNullable: false, hasDefault: false },
      { name: "envVars", type: "text", isPrimaryKey: false, isForeignKey: false, isNotNullable: false, hasDefault: false },
      { name: "skillsPath", type: "text", isPrimaryKey: false, isForeignKey: false, isNotNullable: false, hasDefault: false },
      { name: "agentsPath", type: "text", isPrimaryKey: false, isForeignKey: false, isNotNullable: false, hasDefault: false },
    ],
  },
  {
    name: "chats",
    description: "Chat sessions linked to projects",
    columns: [
      { name: "id", type: "text", isPrimaryKey: true, isForeignKey: false, isNotNullable: true, hasDefault: true },
      { name: "name", type: "text", isPrimaryKey: false, isForeignKey: false, isNotNullable: false, hasDefault: false },
      { name: "projectId", type: "text", isPrimaryKey: false, isForeignKey: true, isNotNullable: true, hasDefault: false, foreignKeyTarget: { table: "projects", column: "id" } },
      { name: "createdAt", type: "timestamp", isPrimaryKey: false, isForeignKey: false, isNotNullable: false, hasDefault: true },
      { name: "updatedAt", type: "timestamp", isPrimaryKey: false, isForeignKey: false, isNotNullable: false, hasDefault: true },
      { name: "archivedAt", type: "timestamp", isPrimaryKey: false, isForeignKey: false, isNotNullable: false, hasDefault: false },
      { name: "worktreePath", type: "text", isPrimaryKey: false, isForeignKey: false, isNotNullable: false, hasDefault: false },
      { name: "branch", type: "text", isPrimaryKey: false, isForeignKey: false, isNotNullable: false, hasDefault: false },
      { name: "baseBranch", type: "text", isPrimaryKey: false, isForeignKey: false, isNotNullable: false, hasDefault: false },
      { name: "prUrl", type: "text", isPrimaryKey: false, isForeignKey: false, isNotNullable: false, hasDefault: false },
      { name: "prNumber", type: "integer", isPrimaryKey: false, isForeignKey: false, isNotNullable: false, hasDefault: false },
      { name: "isTransient", type: "boolean", isPrimaryKey: false, isForeignKey: false, isNotNullable: false, hasDefault: true },
      { name: "sourceView", type: "text", isPrimaryKey: false, isForeignKey: false, isNotNullable: false, hasDefault: false },
      { name: "sourceContext", type: "text", isPrimaryKey: false, isForeignKey: false, isNotNullable: false, hasDefault: false },
      { name: "connectionType", type: "text", isPrimaryKey: false, isForeignKey: false, isNotNullable: false, hasDefault: true },
      { name: "connectionTarget", type: "text", isPrimaryKey: false, isForeignKey: false, isNotNullable: false, hasDefault: false },
      { name: "connectionName", type: "text", isPrimaryKey: false, isForeignKey: false, isNotNullable: false, hasDefault: false },
    ],
  },
  {
    name: "sub_chats",
    description: "Sub-chat sessions within a chat (Claude SDK sessions)",
    columns: [
      { name: "id", type: "text", isPrimaryKey: true, isForeignKey: false, isNotNullable: true, hasDefault: true },
      { name: "name", type: "text", isPrimaryKey: false, isForeignKey: false, isNotNullable: false, hasDefault: false },
      { name: "chatId", type: "text", isPrimaryKey: false, isForeignKey: true, isNotNullable: true, hasDefault: false, foreignKeyTarget: { table: "chats", column: "id" } },
      { name: "sessionId", type: "text", isPrimaryKey: false, isForeignKey: false, isNotNullable: false, hasDefault: false },
      { name: "streamId", type: "text", isPrimaryKey: false, isForeignKey: false, isNotNullable: false, hasDefault: false },
      { name: "mode", type: "text", isPrimaryKey: false, isForeignKey: false, isNotNullable: true, hasDefault: true },
      { name: "model", type: "text", isPrimaryKey: false, isForeignKey: false, isNotNullable: false, hasDefault: true },
      { name: "messages", type: "text", isPrimaryKey: false, isForeignKey: false, isNotNullable: true, hasDefault: true },
      { name: "createdAt", type: "timestamp", isPrimaryKey: false, isForeignKey: false, isNotNullable: false, hasDefault: true },
      { name: "updatedAt", type: "timestamp", isPrimaryKey: false, isForeignKey: false, isNotNullable: false, hasDefault: true },
    ],
  },
  {
    name: "claude_code_credentials",
    description: "Encrypted OAuth token for Claude Code",
    columns: [
      { name: "id", type: "text", isPrimaryKey: true, isForeignKey: false, isNotNullable: true, hasDefault: false },
      { name: "oauthToken", type: "text", isPrimaryKey: false, isForeignKey: false, isNotNullable: true, hasDefault: false },
      { name: "connectedAt", type: "timestamp", isPrimaryKey: false, isForeignKey: false, isNotNullable: false, hasDefault: true },
      { name: "userId", type: "text", isPrimaryKey: false, isForeignKey: false, isNotNullable: false, hasDefault: false },
    ],
  },
  {
    name: "claude_code_settings",
    description: "User-configured Claude Code binary and environment settings",
    columns: [
      { name: "id", type: "text", isPrimaryKey: true, isForeignKey: false, isNotNullable: true, hasDefault: false },
      { name: "customBinaryPath", type: "text", isPrimaryKey: false, isForeignKey: false, isNotNullable: false, hasDefault: false },
      { name: "customEnvVars", type: "text", isPrimaryKey: false, isForeignKey: false, isNotNullable: true, hasDefault: true },
      { name: "customConfigDir", type: "text", isPrimaryKey: false, isForeignKey: false, isNotNullable: false, hasDefault: false },
      { name: "customWorktreeLocation", type: "text", isPrimaryKey: false, isForeignKey: false, isNotNullable: false, hasDefault: false },
      { name: "mcpServerSettings", type: "text", isPrimaryKey: false, isForeignKey: false, isNotNullable: true, hasDefault: true },
      { name: "authMode", type: "text", isPrimaryKey: false, isForeignKey: false, isNotNullable: true, hasDefault: true },
      { name: "apiKey", type: "text", isPrimaryKey: false, isForeignKey: false, isNotNullable: false, hasDefault: false },
      { name: "bedrockRegion", type: "text", isPrimaryKey: false, isForeignKey: false, isNotNullable: true, hasDefault: true },
      { name: "anthropicBaseUrl", type: "text", isPrimaryKey: false, isForeignKey: false, isNotNullable: false, hasDefault: false },
      { name: "updatedAt", type: "timestamp", isPrimaryKey: false, isForeignKey: false, isNotNullable: false, hasDefault: true },
      { name: "bedrockConnectionMethod", type: "text", isPrimaryKey: false, isForeignKey: false, isNotNullable: false, hasDefault: true },
      { name: "awsProfileName", type: "text", isPrimaryKey: false, isForeignKey: false, isNotNullable: false, hasDefault: false },
      { name: "ssoStartUrl", type: "text", isPrimaryKey: false, isForeignKey: false, isNotNullable: false, hasDefault: false },
      { name: "ssoRegion", type: "text", isPrimaryKey: false, isForeignKey: false, isNotNullable: false, hasDefault: false },
      { name: "ssoAccountId", type: "text", isPrimaryKey: false, isForeignKey: false, isNotNullable: false, hasDefault: false },
      { name: "ssoAccountName", type: "text", isPrimaryKey: false, isForeignKey: false, isNotNullable: false, hasDefault: false },
      { name: "ssoRoleName", type: "text", isPrimaryKey: false, isForeignKey: false, isNotNullable: false, hasDefault: false },
      { name: "ssoAccessToken", type: "text", isPrimaryKey: false, isForeignKey: false, isNotNullable: false, hasDefault: false },
      { name: "ssoRefreshToken", type: "text", isPrimaryKey: false, isForeignKey: false, isNotNullable: false, hasDefault: false },
      { name: "ssoTokenExpiresAt", type: "timestamp", isPrimaryKey: false, isForeignKey: false, isNotNullable: false, hasDefault: false },
      { name: "ssoClientId", type: "text", isPrimaryKey: false, isForeignKey: false, isNotNullable: false, hasDefault: false },
      { name: "ssoClientSecret", type: "text", isPrimaryKey: false, isForeignKey: false, isNotNullable: false, hasDefault: false },
      { name: "ssoClientExpiresAt", type: "timestamp", isPrimaryKey: false, isForeignKey: false, isNotNullable: false, hasDefault: false },
      { name: "awsAccessKeyId", type: "text", isPrimaryKey: false, isForeignKey: false, isNotNullable: false, hasDefault: false },
      { name: "awsSecretAccessKey", type: "text", isPrimaryKey: false, isForeignKey: false, isNotNullable: false, hasDefault: false },
      { name: "awsSessionToken", type: "text", isPrimaryKey: false, isForeignKey: false, isNotNullable: false, hasDefault: false },
      { name: "awsCredentialsExpiresAt", type: "timestamp", isPrimaryKey: false, isForeignKey: false, isNotNullable: false, hasDefault: false },
      { name: "vpnCheckEnabled", type: "boolean", isPrimaryKey: false, isForeignKey: false, isNotNullable: true, hasDefault: true },
      { name: "vpnCheckUrl", type: "text", isPrimaryKey: false, isForeignKey: false, isNotNullable: false, hasDefault: false },
      { name: "defaultStartCommands", type: "text", isPrimaryKey: false, isForeignKey: false, isNotNullable: true, hasDefault: true },
      { name: "bedrockOpusModel", type: "text", isPrimaryKey: false, isForeignKey: false, isNotNullable: false, hasDefault: true },
      { name: "bedrockOpus46Model", type: "text", isPrimaryKey: false, isForeignKey: false, isNotNullable: false, hasDefault: true },
      { name: "bedrockSonnetModel", type: "text", isPrimaryKey: false, isForeignKey: false, isNotNullable: false, hasDefault: true },
      { name: "bedrockHaikuModel", type: "text", isPrimaryKey: false, isForeignKey: false, isNotNullable: false, hasDefault: true },
      { name: "maxMcpOutputTokens", type: "integer", isPrimaryKey: false, isForeignKey: false, isNotNullable: true, hasDefault: true },
      { name: "maxThinkingTokens", type: "integer", isPrimaryKey: false, isForeignKey: false, isNotNullable: true, hasDefault: true },
      { name: "extendedThinkingEnabled", type: "boolean", isPrimaryKey: false, isForeignKey: false, isNotNullable: true, hasDefault: true },
      { name: "enableAgentTeams", type: "boolean", isPrimaryKey: false, isForeignKey: false, isNotNullable: true, hasDefault: true },
      { name: "maxBudgetUsd", type: "integer", isPrimaryKey: false, isForeignKey: false, isNotNullable: false, hasDefault: false },
      { name: "anthropicBackgroundModel", type: "text", isPrimaryKey: false, isForeignKey: false, isNotNullable: false, hasDefault: true },
      { name: "bedrockBackgroundModel", type: "text", isPrimaryKey: false, isForeignKey: false, isNotNullable: false, hasDefault: false },
      { name: "ollamaBackgroundModel", type: "text", isPrimaryKey: false, isForeignKey: false, isNotNullable: false, hasDefault: false },
      { name: "customApiBackgroundModel", type: "text", isPrimaryKey: false, isForeignKey: false, isNotNullable: false, hasDefault: false },
    ],
  },
  {
    name: "mcp_credentials",
    description: "Encrypted credentials for MCP servers",
    columns: [
      { name: "id", type: "text", isPrimaryKey: true, isForeignKey: false, isNotNullable: true, hasDefault: false },
      { name: "credentials", type: "text", isPrimaryKey: false, isForeignKey: false, isNotNullable: true, hasDefault: true },
      { name: "updatedAt", type: "timestamp", isPrimaryKey: false, isForeignKey: false, isNotNullable: false, hasDefault: true },
    ],
  },
  {
    name: "config_sources",
    description: "Custom configuration file paths (mcp.json, plugin dirs)",
    columns: [
      { name: "id", type: "text", isPrimaryKey: true, isForeignKey: false, isNotNullable: true, hasDefault: true },
      { name: "type", type: "text", isPrimaryKey: false, isForeignKey: false, isNotNullable: true, hasDefault: false },
      { name: "path", type: "text", isPrimaryKey: false, isForeignKey: false, isNotNullable: true, hasDefault: false },
      { name: "priority", type: "integer", isPrimaryKey: false, isForeignKey: false, isNotNullable: true, hasDefault: true },
      { name: "enabled", type: "boolean", isPrimaryKey: false, isForeignKey: false, isNotNullable: true, hasDefault: true },
      { name: "createdAt", type: "timestamp", isPrimaryKey: false, isForeignKey: false, isNotNullable: false, hasDefault: true },
    ],
  },
  {
    name: "background_tasks",
    description: "Background tasks started by Claude SDK",
    columns: [
      { name: "id", type: "text", isPrimaryKey: true, isForeignKey: false, isNotNullable: true, hasDefault: true },
      { name: "subChatId", type: "text", isPrimaryKey: false, isForeignKey: true, isNotNullable: true, hasDefault: false, foreignKeyTarget: { table: "sub_chats", column: "id" } },
      { name: "chatId", type: "text", isPrimaryKey: false, isForeignKey: true, isNotNullable: true, hasDefault: false, foreignKeyTarget: { table: "chats", column: "id" } },
      { name: "toolCallId", type: "text", isPrimaryKey: false, isForeignKey: false, isNotNullable: true, hasDefault: false },
      { name: "outputFile", type: "text", isPrimaryKey: false, isForeignKey: false, isNotNullable: false, hasDefault: false },
      { name: "pid", type: "integer", isPrimaryKey: false, isForeignKey: false, isNotNullable: false, hasDefault: false },
      { name: "sdkTaskId", type: "text", isPrimaryKey: false, isForeignKey: false, isNotNullable: false, hasDefault: false },
      { name: "sdkStatus", type: "text", isPrimaryKey: false, isForeignKey: false, isNotNullable: false, hasDefault: false },
      { name: "command", type: "text", isPrimaryKey: false, isForeignKey: false, isNotNullable: false, hasDefault: false },
      { name: "description", type: "text", isPrimaryKey: false, isForeignKey: false, isNotNullable: false, hasDefault: false },
    ],
  },
  {
    name: "app_settings",
    description: "Application-level settings and migration tracking",
    columns: [
      { name: "id", type: "text", isPrimaryKey: true, isForeignKey: false, isNotNullable: true, hasDefault: false },
      { name: "lastMigrationVersion", type: "text", isPrimaryKey: false, isForeignKey: false, isNotNullable: false, hasDefault: false },
      { name: "updatedAt", type: "timestamp", isPrimaryKey: false, isForeignKey: false, isNotNullable: false, hasDefault: true },
    ],
  },
  {
    name: "devspace_settings",
    description: "DevSpace integration configuration",
    columns: [
      { name: "id", type: "text", isPrimaryKey: true, isForeignKey: false, isNotNullable: true, hasDefault: false },
      { name: "reposPath", type: "text", isPrimaryKey: false, isForeignKey: false, isNotNullable: false, hasDefault: false },
      { name: "configSubPath", type: "text", isPrimaryKey: false, isForeignKey: false, isNotNullable: true, hasDefault: true },
      { name: "startCommand", type: "text", isPrimaryKey: false, isForeignKey: false, isNotNullable: true, hasDefault: true },
      { name: "updatedAt", type: "timestamp", isPrimaryKey: false, isForeignKey: false, isNotNullable: false, hasDefault: true },
    ],
  },
  {
    name: "mcp_tool_cache",
    description: "Cached tool counts for MCP servers",
    columns: [
      { name: "serverId", type: "text", isPrimaryKey: true, isForeignKey: false, isNotNullable: true, hasDefault: false },
      { name: "toolCount", type: "integer", isPrimaryKey: false, isForeignKey: false, isNotNullable: true, hasDefault: false },
      { name: "toolNames", type: "text", isPrimaryKey: false, isForeignKey: false, isNotNullable: true, hasDefault: true },
      { name: "lastQueried", type: "timestamp", isPrimaryKey: false, isForeignKey: false, isNotNullable: false, hasDefault: true },
      { name: "configHash", type: "text", isPrimaryKey: false, isForeignKey: false, isNotNullable: false, hasDefault: false },
    ],
  },
  {
    name: "devspace_started_processes",
    description: "Processes started by DevSpace",
    columns: [
      { name: "id", type: "text", isPrimaryKey: true, isForeignKey: false, isNotNullable: true, hasDefault: true },
      { name: "pid", type: "integer", isPrimaryKey: false, isForeignKey: false, isNotNullable: true, hasDefault: false },
      { name: "serviceName", type: "text", isPrimaryKey: false, isForeignKey: false, isNotNullable: true, hasDefault: false },
      { name: "servicePath", type: "text", isPrimaryKey: false, isForeignKey: false, isNotNullable: true, hasDefault: false },
      { name: "terminalPaneId", type: "text", isPrimaryKey: false, isForeignKey: false, isNotNullable: false, hasDefault: false },
      { name: "startedAt", type: "timestamp", isPrimaryKey: false, isForeignKey: false, isNotNullable: false, hasDefault: true },
    ],
  },
  {
    name: "analysis_diagrams",
    description: "Generated React Flow diagram data for project analysis",
    columns: [
      { name: "id", type: "text", isPrimaryKey: true, isForeignKey: false, isNotNullable: true, hasDefault: true },
      { name: "projectId", type: "text", isPrimaryKey: false, isForeignKey: true, isNotNullable: true, hasDefault: false, foreignKeyTarget: { table: "projects", column: "id" } },
      { name: "type", type: "text", isPrimaryKey: false, isForeignKey: false, isNotNullable: true, hasDefault: false },
      { name: "status", type: "text", isPrimaryKey: false, isForeignKey: false, isNotNullable: true, hasDefault: true },
      { name: "nodes", type: "text", isPrimaryKey: false, isForeignKey: false, isNotNullable: true, hasDefault: true },
      { name: "edges", type: "text", isPrimaryKey: false, isForeignKey: false, isNotNullable: true, hasDefault: true },
      { name: "viewport", type: "text", isPrimaryKey: false, isForeignKey: false, isNotNullable: false, hasDefault: false },
      { name: "summary", type: "text", isPrimaryKey: false, isForeignKey: false, isNotNullable: false, hasDefault: false },
      { name: "stats", type: "text", isPrimaryKey: false, isForeignKey: false, isNotNullable: true, hasDefault: true },
      { name: "errorMessage", type: "text", isPrimaryKey: false, isForeignKey: false, isNotNullable: false, hasDefault: false },
      { name: "lastCommitHash", type: "text", isPrimaryKey: false, isForeignKey: false, isNotNullable: false, hasDefault: false },
      { name: "fileHash", type: "text", isPrimaryKey: false, isForeignKey: false, isNotNullable: false, hasDefault: false },
      { name: "createdAt", type: "timestamp", isPrimaryKey: false, isForeignKey: false, isNotNullable: false, hasDefault: true },
      { name: "updatedAt", type: "timestamp", isPrimaryKey: false, isForeignKey: false, isNotNullable: false, hasDefault: true },
    ],
  },
  {
    name: "analysis_jobs",
    description: "In-progress analysis tasks",
    columns: [
      { name: "id", type: "text", isPrimaryKey: true, isForeignKey: false, isNotNullable: true, hasDefault: true },
      { name: "projectId", type: "text", isPrimaryKey: false, isForeignKey: true, isNotNullable: true, hasDefault: false, foreignKeyTarget: { table: "projects", column: "id" } },
      { name: "diagramId", type: "text", isPrimaryKey: false, isForeignKey: true, isNotNullable: true, hasDefault: false, foreignKeyTarget: { table: "analysis_diagrams", column: "id" } },
      { name: "type", type: "text", isPrimaryKey: false, isForeignKey: false, isNotNullable: true, hasDefault: false },
      { name: "status", type: "text", isPrimaryKey: false, isForeignKey: false, isNotNullable: true, hasDefault: true },
      { name: "taskCallId", type: "text", isPrimaryKey: false, isForeignKey: false, isNotNullable: false, hasDefault: false },
      { name: "log", type: "text", isPrimaryKey: false, isForeignKey: false, isNotNullable: true, hasDefault: true },
      { name: "errorMessage", type: "text", isPrimaryKey: false, isForeignKey: false, isNotNullable: false, hasDefault: false },
      { name: "startedAt", type: "timestamp", isPrimaryKey: false, isForeignKey: false, isNotNullable: false, hasDefault: true },
      { name: "completedAt", type: "timestamp", isPrimaryKey: false, isForeignKey: false, isNotNullable: false, hasDefault: false },
    ],
  },
  {
    name: "headless_claws",
    description: "Autonomous background agents",
    columns: [
      { name: "id", type: "text", isPrimaryKey: true, isForeignKey: false, isNotNullable: true, hasDefault: true },
      { name: "name", type: "text", isPrimaryKey: false, isForeignKey: false, isNotNullable: true, hasDefault: false },
      { name: "purpose", type: "text", isPrimaryKey: false, isForeignKey: false, isNotNullable: true, hasDefault: true },
      { name: "instruction", type: "text", isPrimaryKey: false, isForeignKey: false, isNotNullable: true, hasDefault: false },
      { name: "targetWorktree", type: "text", isPrimaryKey: false, isForeignKey: false, isNotNullable: true, hasDefault: false },
      { name: "triggerType", type: "text", isPrimaryKey: false, isForeignKey: false, isNotNullable: true, hasDefault: false },
      { name: "triggerConfig", type: "text", isPrimaryKey: false, isForeignKey: false, isNotNullable: true, hasDefault: false },
      { name: "isEnabled", type: "boolean", isPrimaryKey: false, isForeignKey: false, isNotNullable: true, hasDefault: true },
      { name: "allowedDirectories", type: "text", isPrimaryKey: false, isForeignKey: false, isNotNullable: true, hasDefault: true },
      { name: "allowedMcpServers", type: "text", isPrimaryKey: false, isForeignKey: false, isNotNullable: true, hasDefault: true },
      { name: "sandboxMode", type: "text", isPrimaryKey: false, isForeignKey: false, isNotNullable: true, hasDefault: true },
      { name: "createdAt", type: "timestamp", isPrimaryKey: false, isForeignKey: false, isNotNullable: false, hasDefault: true },
      { name: "updatedAt", type: "timestamp", isPrimaryKey: false, isForeignKey: false, isNotNullable: false, hasDefault: true },
    ],
  },
  {
    name: "claw_executions",
    description: "Headless agent execution history",
    columns: [
      { name: "id", type: "text", isPrimaryKey: true, isForeignKey: false, isNotNullable: true, hasDefault: true },
      { name: "clawId", type: "text", isPrimaryKey: false, isForeignKey: true, isNotNullable: true, hasDefault: false, foreignKeyTarget: { table: "headless_claws", column: "id" } },
      { name: "subChatId", type: "text", isPrimaryKey: false, isForeignKey: false, isNotNullable: false, hasDefault: false, foreignKeyTarget: { table: "sub_chats", column: "id" } },
      { name: "sessionId", type: "text", isPrimaryKey: false, isForeignKey: false, isNotNullable: false, hasDefault: false, foreignKeyTarget: { table: "chat_sessions", column: "id" } },
      { name: "status", type: "text", isPrimaryKey: false, isForeignKey: false, isNotNullable: true, hasDefault: false },
      { name: "logs", type: "text", isPrimaryKey: false, isForeignKey: false, isNotNullable: true, hasDefault: true },
      { name: "exitCode", type: "integer", isPrimaryKey: false, isForeignKey: false, isNotNullable: false, hasDefault: false },
      { name: "startedAt", type: "timestamp", isPrimaryKey: false, isForeignKey: false, isNotNullable: false, hasDefault: true },
      { name: "completedAt", type: "timestamp", isPrimaryKey: false, isForeignKey: false, isNotNullable: false, hasDefault: false },
    ],
  },
  {
    name: "github_settings",
    description: "GitHub credentials (encrypted)",
    columns: [
      { name: "id", type: "text", isPrimaryKey: true, isForeignKey: false, isNotNullable: true, hasDefault: false },
      { name: "encryptedToken", type: "text", isPrimaryKey: false, isForeignKey: false, isNotNullable: false, hasDefault: false },
      { name: "updatedAt", type: "timestamp", isPrimaryKey: false, isForeignKey: false, isNotNullable: false, hasDefault: true },
    ],
  },
  {
    name: "slack_settings",
    description: "Slack app credentials (encrypted)",
    columns: [
      { name: "id", type: "text", isPrimaryKey: true, isForeignKey: false, isNotNullable: true, hasDefault: false },
      { name: "encryptedAppToken", type: "text", isPrimaryKey: false, isForeignKey: false, isNotNullable: false, hasDefault: false },
      { name: "encryptedBotToken", type: "text", isPrimaryKey: false, isForeignKey: false, isNotNullable: false, hasDefault: false },
      { name: "isSocketModeEnabled", type: "boolean", isPrimaryKey: false, isForeignKey: false, isNotNullable: false, hasDefault: true },
      { name: "updatedAt", type: "timestamp", isPrimaryKey: false, isForeignKey: false, isNotNullable: false, hasDefault: true },
    ],
  },
  {
    name: "whatsapp_settings",
    description: "WhatsApp connection status",
    columns: [
      { name: "id", type: "text", isPrimaryKey: true, isForeignKey: false, isNotNullable: true, hasDefault: false },
      { name: "isConnected", type: "boolean", isPrimaryKey: false, isForeignKey: false, isNotNullable: false, hasDefault: true },
      { name: "sessionPath", type: "text", isPrimaryKey: false, isForeignKey: false, isNotNullable: false, hasDefault: true },
      { name: "updatedAt", type: "timestamp", isPrimaryKey: false, isForeignKey: false, isNotNullable: false, hasDefault: true },
    ],
  },
  {
    name: "system_prompts",
    description: "Editable system prompts for AI interactions",
    columns: [
      { name: "id", type: "text", isPrimaryKey: true, isForeignKey: false, isNotNullable: true, hasDefault: true },
      { name: "key", type: "text", isPrimaryKey: false, isForeignKey: false, isNotNullable: true, hasDefault: false },
      { name: "name", type: "text", isPrimaryKey: false, isForeignKey: false, isNotNullable: true, hasDefault: false },
      { name: "description", type: "text", isPrimaryKey: false, isForeignKey: false, isNotNullable: true, hasDefault: false },
      { name: "content", type: "text", isPrimaryKey: false, isForeignKey: false, isNotNullable: true, hasDefault: false },
      { name: "category", type: "text", isPrimaryKey: false, isForeignKey: false, isNotNullable: true, hasDefault: true },
      { name: "isEditable", type: "boolean", isPrimaryKey: false, isForeignKey: false, isNotNullable: true, hasDefault: true },
      { name: "defaultValue", type: "text", isPrimaryKey: false, isForeignKey: false, isNotNullable: true, hasDefault: false },
      { name: "createdAt", type: "timestamp", isPrimaryKey: false, isForeignKey: false, isNotNullable: false, hasDefault: true },
      { name: "updatedAt", type: "timestamp", isPrimaryKey: false, isForeignKey: false, isNotNullable: false, hasDefault: true },
    ],
  },
  {
    name: "hooks",
    description: "Lifecycle hooks for workflow automation",
    columns: [
      { name: "id", type: "text", isPrimaryKey: true, isForeignKey: false, isNotNullable: true, hasDefault: true },
      { name: "name", type: "text", isPrimaryKey: false, isForeignKey: false, isNotNullable: true, hasDefault: false },
      { name: "description", type: "text", isPrimaryKey: false, isForeignKey: false, isNotNullable: false, hasDefault: false },
      { name: "hookType", type: "text", isPrimaryKey: false, isForeignKey: false, isNotNullable: true, hasDefault: false },
      { name: "matcher", type: "text", isPrimaryKey: false, isForeignKey: false, isNotNullable: true, hasDefault: false },
      { name: "command", type: "text", isPrimaryKey: false, isForeignKey: false, isNotNullable: true, hasDefault: false },
      { name: "scope", type: "text", isPrimaryKey: false, isForeignKey: false, isNotNullable: true, hasDefault: false },
      { name: "projectId", type: "text", isPrimaryKey: false, isForeignKey: true, isNotNullable: false, hasDefault: false, foreignKeyTarget: { table: "projects", column: "id" } },
      { name: "enabled", type: "boolean", isPrimaryKey: false, isForeignKey: false, isNotNullable: true, hasDefault: true },
      { name: "createdAt", type: "timestamp", isPrimaryKey: false, isForeignKey: false, isNotNullable: false, hasDefault: true },
      { name: "updatedAt", type: "timestamp", isPrimaryKey: false, isForeignKey: false, isNotNullable: false, hasDefault: true },
    ],
  },
  {
    name: "chat_sessions",
    description: "Persistent chat sessions for WhatsApp/Slack",
    columns: [
      { name: "id", type: "text", isPrimaryKey: true, isForeignKey: false, isNotNullable: true, hasDefault: true },
      { name: "clawId", type: "text", isPrimaryKey: false, isForeignKey: true, isNotNullable: true, hasDefault: false, foreignKeyTarget: { table: "headless_claws", column: "id" } },
      { name: "externalId", type: "text", isPrimaryKey: false, isForeignKey: false, isNotNullable: true, hasDefault: false },
      { name: "platform", type: "text", isPrimaryKey: false, isForeignKey: false, isNotNullable: true, hasDefault: false },
      { name: "status", type: "text", isPrimaryKey: false, isForeignKey: false, isNotNullable: true, hasDefault: true },
      { name: "currentExecutionId", type: "text", isPrimaryKey: false, isForeignKey: false, isNotNullable: false, hasDefault: false, foreignKeyTarget: { table: "claw_executions", column: "id" } },
      { name: "context", type: "text", isPrimaryKey: false, isForeignKey: false, isNotNullable: true, hasDefault: true },
      { name: "lastActivityAt", type: "timestamp", isPrimaryKey: false, isForeignKey: false, isNotNullable: false, hasDefault: true },
      { name: "createdAt", type: "timestamp", isPrimaryKey: false, isForeignKey: false, isNotNullable: false, hasDefault: true },
      { name: "updatedAt", type: "timestamp", isPrimaryKey: false, isForeignKey: false, isNotNullable: false, hasDefault: true },
    ],
  },
  {
    name: "whatsapp_bridges",
    description: "WhatsApp-Chat bidirectional bridges",
    columns: [
      { name: "id", type: "text", isPrimaryKey: true, isForeignKey: false, isNotNullable: true, hasDefault: true },
      { name: "chatId", type: "text", isPrimaryKey: false, isForeignKey: true, isNotNullable: true, hasDefault: false, foreignKeyTarget: { table: "chats", column: "id" } },
      { name: "subChatId", type: "text", isPrimaryKey: false, isForeignKey: true, isNotNullable: true, hasDefault: false, foreignKeyTarget: { table: "sub_chats", column: "id" } },
      { name: "whatsappJid", type: "text", isPrimaryKey: false, isForeignKey: false, isNotNullable: true, hasDefault: false },
      { name: "whatsappGroupName", type: "text", isPrimaryKey: false, isForeignKey: false, isNotNullable: false, hasDefault: false },
      { name: "isActive", type: "boolean", isPrimaryKey: false, isForeignKey: false, isNotNullable: true, hasDefault: true },
      { name: "createdAt", type: "timestamp", isPrimaryKey: false, isForeignKey: false, isNotNullable: false, hasDefault: true },
      { name: "updatedAt", type: "timestamp", isPrimaryKey: false, isForeignKey: false, isNotNullable: false, hasDefault: true },
    ],
  },
]

/**
 * Generate React Flow nodes from schema
 */
export function generateNodesFromSchema(): Node[] {
  return clawSchema.map((table) => ({
    id: table.name,
    type: "table",
    position: { x: 0, y: 0 }, // Will be positioned by layout algorithm
    data: {
      tableName: table.name,
      columns: table.columns.map((col) => ({
        name: col.name,
        type: col.type,
        isPrimaryKey: col.isPrimaryKey,
        isForeignKey: col.isForeignKey,
        isNotNullable: col.isNotNullable,
        hasDefault: col.hasDefault,
        foreignKeyTarget: col.foreignKeyTarget,
      })),
      description: table.description,
    } as TableNodeData,
  }))
}

/**
 * Generate React Flow edges from foreign key relationships
 */
export function generateEdgesFromSchema(): Edge[] {
  const edges: Edge[] = []

  clawSchema.forEach((table) => {
    table.columns.forEach((col) => {
      if (col.isForeignKey && col.foreignKeyTarget) {
        edges.push({
          id: `${table.name}.${col.name}->${col.foreignKeyTarget.table}.${col.foreignKeyTarget.column}`,
          source: table.name,
          target: col.foreignKeyTarget.table,
          sourceHandle: `${col.name}-bottom`,
          targetHandle: `${col.foreignKeyTarget.column}-top`,
          type: "smoothstep",
          label: col.name,
          style: { stroke: "#64748b", strokeWidth: 2 },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color: "#64748b",
          },
        })
      }
    })
  })

  return edges
}
