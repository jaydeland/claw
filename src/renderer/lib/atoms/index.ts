import { atom } from "jotai"
import { atomWithStorage } from "jotai/utils"

// ============================================
// RE-EXPORT FROM FEATURES/AGENTS/ATOMS (source of truth)
// ============================================

export {
  // Chat atoms
  selectedAgentChatIdAtom,
  isPlanModeAtom,
  lastSelectedModelIdAtom,
  lastSelectedAgentIdAtom,
  lastSelectedRepoAtom,
  selectedProjectAtom,
  agentsUnseenChangesAtom,
  agentsSubChatUnseenChangesAtom,
  loadingSubChatsAtom,
  setLoading,
  clearLoading,
  MODEL_ID_MAP,
  lastChatModesAtom,

  // Sidebar atoms
  agentsSidebarOpenAtom,
  agentsSidebarWidthAtom,
  sidebarContentWidthAtom,
  // DEPRECATED: No longer used after layout refactoring. Can be removed in future cleanup.
  agentsSubChatsSidebarModeAtom,
  // DEPRECATED: No longer used after layout refactoring. Can be removed in future cleanup.
  agentsSubChatsSidebarWidthAtom,
  selectedSidebarTabAtom,
  type SidebarTab,

  // Preview atoms
  previewPathAtomFamily,
  viewportModeAtomFamily,
  previewScaleAtomFamily,
  mobileDeviceAtomFamily,
  agentsPreviewSidebarWidthAtom,
  agentsPreviewSidebarOpenAtom,

  // Diff atoms
  agentsDiffSidebarWidthAtom,
  agentsChangesPanelWidthAtom,
  agentsDiffSidebarOpenAtom,
  agentsFocusedDiffFileAtom,
  filteredDiffFilesAtom,
  subChatFilesAtom,

  // Archive atoms
  archiveRepositoryFilterAtom,

  // UI state
  agentsMobileViewModeAtom,

  // Debug mode
  agentsDebugModeAtom,

  // Todos
  currentTodosAtomFamily,

  // AskUserQuestion
  pendingUserQuestionsAtom,

  // Types
  type SavedRepo,
  type SelectedProject,
  type AgentsMobileViewMode,
  type AgentsDebugMode,
  type SubChatFileChange,
} from "../../features/agents/atoms"

// ============================================
// TEAM ATOMS (unique to lib/atoms)
// ============================================

export const selectedTeamIdAtom = atomWithStorage<string | null>(
  "agents:selectedTeamId",
  null,
  undefined,
  { getOnInit: true },
)

export const createTeamDialogOpenAtom = atom<boolean>(false)

// ============================================
// MULTI-SELECT ATOMS - Chats (unique to lib/atoms)
// ============================================

export const selectedAgentChatIdsAtom = atom<Set<string>>(new Set<string>())

export const isAgentMultiSelectModeAtom = atom((get) => {
  return get(selectedAgentChatIdsAtom).size > 0
})

export const selectedAgentChatsCountAtom = atom((get) => {
  return get(selectedAgentChatIdsAtom).size
})

export const toggleAgentChatSelectionAtom = atom(
  null,
  (get, set, chatId: string) => {
    const currentSet = get(selectedAgentChatIdsAtom)
    const newSet = new Set(currentSet)
    if (newSet.has(chatId)) {
      newSet.delete(chatId)
    } else {
      newSet.add(chatId)
    }
    set(selectedAgentChatIdsAtom, newSet)
  },
)

export const selectAllAgentChatsAtom = atom(
  null,
  (_get, set, chatIds: string[]) => {
    set(selectedAgentChatIdsAtom, new Set(chatIds))
  },
)

export const clearAgentChatSelectionAtom = atom(null, (_get, set) => {
  set(selectedAgentChatIdsAtom, new Set())
})

// ============================================
// MULTI-SELECT ATOMS - Sub-Chats (unique to lib/atoms)
// ============================================

export const selectedSubChatIdsAtom = atom<Set<string>>(new Set<string>())

export const isSubChatMultiSelectModeAtom = atom((get) => {
  return get(selectedSubChatIdsAtom).size > 0
})

export const selectedSubChatsCountAtom = atom((get) => {
  return get(selectedSubChatIdsAtom).size
})

export const toggleSubChatSelectionAtom = atom(
  null,
  (get, set, subChatId: string) => {
    const currentSet = get(selectedSubChatIdsAtom)
    const newSet = new Set(currentSet)
    if (newSet.has(subChatId)) {
      newSet.delete(subChatId)
    } else {
      newSet.add(subChatId)
    }
    set(selectedSubChatIdsAtom, newSet)
  },
)

export const selectAllSubChatsAtom = atom(
  null,
  (_get, set, subChatIds: string[]) => {
    set(selectedSubChatIdsAtom, new Set(subChatIds))
  },
)

export const clearSubChatSelectionAtom = atom(null, (_get, set) => {
  set(selectedSubChatIdsAtom, new Set())
})

// ============================================
// DIALOG ATOMS (unique to lib/atoms)
// ============================================

// Settings dialog
export type SettingsTab =
  | "profile"
  | "providers"
  | "appearance"
  | "keyboard"
  | "preferences"
  | "kubernetes"
  | "github"
  | "advanced"
  | "worktrees"
  | "backup"
  | "beta"
  | "debug"
  | `project-${string}` // Dynamic project tabs
export const agentsSettingsDialogActiveTabAtom = atom<SettingsTab>("profile")
export const agentsSettingsDialogOpenAtom = atom<boolean>(false)

export interface OllamaModelConfig {
  id: string
  name: string
  description?: string
  size?: string
  contextWindow?: number // Context window size in tokens
  isPulled?: boolean // Whether the model has been pulled locally
}

// ============================================
// PROVIDER-SPECIFIC CONFIG TYPES
// ============================================

/**
 * Ollama-specific configuration
 * Stored independently from other providers to preserve settings when switching
 */
export type OllamaConfig = {
  model: string
  baseUrl: string
  token: string
  ollamaApiKey?: string
  ollamaModels?: OllamaModelConfig[] // User's selected/favorite Ollama models
  contextWindow?: number // Context window size in tokens (e.g., 189000 for glm-5)
}

/**
 * Custom API-specific configuration
 * Stored independently from other providers to preserve settings when switching
 */
export type CustomApiConfig = {
  model: string
  baseUrl: string
  token: string
  apiKey?: string
  contextWindow?: number // Context window size in tokens
}

/**
 * Legacy unified config type (deprecated)
 * @deprecated Use OllamaConfig or CustomApiConfig instead
 */
export type CustomClaudeConfig = {
  model: string
  token: string
  baseUrl: string
  apiKey?: string
  ollamaApiKey?: string
  ollamaModels?: OllamaModelConfig[] // User's selected/favorite Ollama models
}

// Model profile system - support multiple configs
export type ModelProfile = {
  id: string
  name: string
  config: CustomClaudeConfig
}

// Legacy single config (deprecated, kept for backwards compatibility and migration)
export const customClaudeConfigAtom = atomWithStorage<CustomClaudeConfig>(
  "agents:claude-custom-config",
  {
    model: "",
    token: "",
    baseUrl: "",
    apiKey: "",
    ollamaApiKey: "",
  },
  undefined,
  { getOnInit: true },
)

// ============================================
// PROVIDER-SPECIFIC CONFIG ATOMS
// ============================================

/**
 * Ollama configuration (independent storage)
 * Persists Ollama settings even when switching to other providers
 */
export const ollamaConfigAtom = atomWithStorage<OllamaConfig>(
  "agents:ollama-config",
  {
    model: "",
    baseUrl: "http://localhost:11434",
    token: "ollama",
    ollamaApiKey: "",
  },
  undefined,
  { getOnInit: true },
)

/**
 * Custom API configuration (independent storage)
 * Persists Custom API settings even when switching to other providers
 */
export const customApiConfigAtom = atomWithStorage<CustomApiConfig>(
  "agents:custom-api-config",
  {
    model: "",
    baseUrl: "",
    token: "",
    apiKey: "",
  },
  undefined,
  { getOnInit: true },
)

// New: Model profiles storage
export const modelProfilesAtom = atomWithStorage<ModelProfile[]>(
  "agents:model-profiles",
  [], // Start empty
  undefined,
  { getOnInit: true },
)

// Active profile ID (null = use Claude Code default)
export const activeProfileIdAtom = atomWithStorage<string | null>(
  "agents:active-profile-id",
  null,
  undefined,
  { getOnInit: true },
)

// ============================================
// AI PROVIDER SELECTION
// ============================================

export type AIProvider = "anthropic-oauth" | "aws-bedrock" | "ollama" | "custom-api" | null

/**
 * Active AI provider selection
 * - "anthropic-oauth": Claude Code via OAuth (default)
 * - "aws-bedrock": AWS Bedrock via SSO or profile
 * - "ollama": Local or cloud Ollama instance
 * - "custom-api": Custom API endpoint
 * - null: No provider selected (use default)
 */
export const activeProviderAtom = atomWithStorage<AIProvider>(
  "agents:active-provider",
  "anthropic-oauth", // Default to Claude Code OAuth
  undefined,
  { getOnInit: true },
)

// ============================================
// MODEL SELECTION ATOMS (per provider)
// ============================================

/**
 * Model selection for Anthropic OAuth provider
 * Stores the selected model tier (opus/sonnet/haiku)
 */
export const anthropicModelAtom = atomWithStorage<string>(
  "agents:anthropic-model",
  "sonnet", // default
  undefined,
  { getOnInit: true },
)

/**
 * Model selection for AWS Bedrock provider
 * Stores the selected model tier (opus/sonnet/haiku)
 */
export const bedrockModelAtom = atomWithStorage<string>(
  "agents:bedrock-model",
  "sonnet", // default
  undefined,
  { getOnInit: true },
)

/**
 * Normalize legacy CustomClaudeConfig
 * @deprecated Use normalizeOllamaConfig or normalizeCustomApiConfig instead
 */
export function normalizeCustomClaudeConfig(
  config: CustomClaudeConfig,
): CustomClaudeConfig | undefined {
  const model = config.model.trim()
  const token = config.token.trim()
  const baseUrl = config.baseUrl.trim()
  const apiKey = config.apiKey?.trim() || ""
  const ollamaApiKey = config.ollamaApiKey?.trim() || ""

  if (!model || !token || !baseUrl) return undefined

  return { model, token, baseUrl, apiKey, ollamaApiKey }
}

/**
 * Normalize Ollama config for use with Claude SDK
 */
export function normalizeOllamaConfig(
  config: OllamaConfig,
): CustomClaudeConfig | undefined {
  const model = config.model.trim()
  const token = config.token.trim()
  const baseUrl = config.baseUrl.trim()
  const ollamaApiKey = config.ollamaApiKey?.trim() || ""
  const ollamaModels = config.ollamaModels

  if (!model || !token || !baseUrl) return undefined

  return { model, token, baseUrl, apiKey: "", ollamaApiKey, ollamaModels }
}

/**
 * Normalize Custom API config for use with Claude SDK
 */
export function normalizeCustomApiConfig(
  config: CustomApiConfig,
): CustomClaudeConfig | undefined {
  const model = config.model.trim()
  const token = config.token.trim()
  const baseUrl = config.baseUrl.trim()
  const apiKey = config.apiKey?.trim() || ""

  if (!model || !token || !baseUrl) return undefined

  return { model, token, baseUrl, apiKey, ollamaApiKey: "" }
}

// Get active config based on current provider
export const activeConfigAtom = atom((get) => {
  const activeProvider = get(activeProviderAtom)
  const activeProfileId = get(activeProfileIdAtom)
  const profiles = get(modelProfilesAtom)

  // If specific profile is selected, use it (highest priority)
  if (activeProfileId) {
    const profile = profiles.find(p => p.id === activeProfileId)
    if (profile) {
      return profile.config
    }
  }

  // Select config based on active provider
  if (activeProvider === "ollama") {
    const ollamaConfig = get(ollamaConfigAtom)
    return normalizeOllamaConfig(ollamaConfig)
  }

  if (activeProvider === "custom-api") {
    const customApiConfig = get(customApiConfigAtom)
    return normalizeCustomApiConfig(customApiConfig)
  }

  // anthropic-oauth and aws-bedrock don't use custom config
  // Fallback to legacy config if set (for backwards compatibility)
  const legacyConfig = get(customClaudeConfigAtom)
  const normalized = normalizeCustomClaudeConfig(legacyConfig)
  if (normalized) {
    return normalized
  }

  // No custom config
  return undefined
})

// Preferences - Extended Thinking
// When enabled, Claude will use adaptive thinking for deeper reasoning.
// Adaptive thinking (Opus 4.6, Sonnet 4.6) automatically determines when and
// how much to think, and is compatible with streaming.
export const extendedThinkingEnabledAtom = atomWithStorage<boolean>(
  "preferences:extended-thinking-enabled",
  false,
  undefined,
  { getOnInit: true },
)

// Preferences - History (Rollback)
// When enabled, allow rollback to previous assistant messages
export const historyEnabledAtom = atomWithStorage<boolean>(
  "preferences:history-enabled",
  false,
  undefined,
  { getOnInit: true },
)

// Preferences - Sound Notifications
// When enabled, play a sound when agent completes work (if not viewing the chat)
export const soundNotificationsEnabledAtom = atomWithStorage<boolean>(
  "preferences:sound-notifications-enabled",
  true,
  undefined,
  { getOnInit: true },
)

// Preferences - Desktop Notifications (Windows)
// When enabled, show Windows desktop notification when agent completes work
export const desktopNotificationsEnabledAtom = atomWithStorage<boolean>(
  "preferences:desktop-notifications-enabled",
  true,
  undefined,
  { getOnInit: true },
)

// Preferences - Windows Window Frame Style
// When true, uses native frame (standard Windows title bar)
// When false, uses frameless window (dark custom title bar)
// Only applies on Windows, requires app restart to take effect
export const useNativeFrameAtom = atomWithStorage<boolean>(
  "preferences:windows-use-native-frame",
  false, // Default: frameless (dark title bar)
  undefined,
  { getOnInit: true },
)

// Beta: Enable git features in diff sidebar (commit, staging, file selection)
// When enabled, shows checkboxes for file selection and commit UI in diff sidebar
// When disabled, shows simple file list with "Create PR" button
export const betaGitFeaturesEnabledAtom = atomWithStorage<boolean>(
  "preferences:beta-git-features-enabled",
  false, // Default OFF
  undefined,
  { getOnInit: true },
)

// Preferences - Ctrl+Tab Quick Switch Target
// When "workspaces" (default), Ctrl+Tab switches between workspaces, and Opt+Ctrl+Tab switches between agents
// When "agents", Ctrl+Tab switches between agents, and Opt+Ctrl+Tab switches between workspaces
export type CtrlTabTarget = "workspaces" | "agents"
export const ctrlTabTargetAtom = atomWithStorage<CtrlTabTarget>(
  "preferences:ctrl-tab-target",
  "workspaces", // Default: Ctrl+Tab switches workspaces, Opt+Ctrl+Tab switches agents
  undefined,
  { getOnInit: true },
)

// Preferences - VS Code Code Themes
// Selected themes for code syntax highlighting (separate for light/dark UI themes)
export const vscodeCodeThemeLightAtom = atomWithStorage<string>(
  "preferences:vscode-code-theme-light",
  "github-light",
  undefined,
  { getOnInit: true },
)

export const vscodeCodeThemeDarkAtom = atomWithStorage<string>(
  "preferences:vscode-code-theme-dark",
  "github-dark",
  undefined,
  { getOnInit: true },
)

// ============================================
// FULL VS CODE THEME ATOMS
// ============================================

/**
 * Full VS Code theme data type
 * Contains colors for UI, terminal, and tokenColors for syntax highlighting
 */
export type VSCodeFullTheme = {
  id: string
  name: string
  type: "light" | "dark"
  colors: Record<string, string> // UI and terminal colors
  tokenColors?: any[] // Syntax highlighting rules
  semanticHighlighting?: boolean // Enable semantic highlighting
  semanticTokenColors?: Record<string, any> // Semantic token color overrides
  source: "builtin" | "imported" | "discovered"
  path?: string // File path for imported/discovered themes
}

/**
 * Selected full theme ID
 * When null, uses system light/dark mode with the themes specified in systemLightThemeIdAtom/systemDarkThemeIdAtom
 */
export const selectedFullThemeIdAtom = atomWithStorage<string | null>(
  "preferences:selected-full-theme-id",
  null, // null means use system default
  undefined,
  { getOnInit: true },
)

/**
 * Theme to use when system is in light mode (only used when selectedFullThemeIdAtom is null)
 */
export const systemLightThemeIdAtom = atomWithStorage<string>(
  "preferences:system-light-theme-id",
  "21st-light", // Default light theme
  undefined,
  { getOnInit: true },
)

/**
 * Theme to use when system is in dark mode (only used when selectedFullThemeIdAtom is null)
 */
export const systemDarkThemeIdAtom = atomWithStorage<string>(
  "preferences:system-dark-theme-id",
  "21st-dark", // Default dark theme
  undefined,
  { getOnInit: true },
)

/**
 * Show workspace icon in sidebar
 * When disabled, hides the project icon and moves loader/status indicators to the right of the name
 */
export const showWorkspaceIconAtom = atomWithStorage<boolean>(
  "preferences:show-workspace-icon",
  false, // Hidden by default
  undefined,
  { getOnInit: true },
)

/**
 * Cached full theme data for the selected theme
 * This is populated when a theme is selected and used for applying CSS variables
 */
export const fullThemeDataAtom = atom<VSCodeFullTheme | null>(null)

/**
 * All available full themes (built-in + imported + discovered)
 * This is a derived atom that combines all theme sources
 */
export const allFullThemesAtom = atom<VSCodeFullTheme[]>((get) => {
  // This will be populated by the theme provider
  // For now, return empty - will be set imperatively
  return []
})

// ============================================
// CUSTOM HOTKEYS CONFIGURATION
// ============================================

import type { CustomHotkeysConfig } from "../hotkeys/types"
export type { CustomHotkeysConfig }

/**
 * Custom hotkey overrides storage
 * Maps action IDs to custom hotkey strings (or null for default)
 */
export const customHotkeysAtom = atomWithStorage<CustomHotkeysConfig>(
  "preferences:custom-hotkeys",
  { version: 1, bindings: {} },
  undefined,
  { getOnInit: true },
)

/**
 * Currently recording hotkey for action (UI state)
 * null when not recording
 */
export const recordingHotkeyForActionAtom = atom<string | null>(null)

// ============================================
// CLAWS FEATURE ATOMS
// ============================================

export type SelectedClawInfo = {
  id: string
  name: string
  triggerType: "cron" | "github_poll" | "manual"
} | null

// Currently selected claw for detail view in main content area
export const selectedClawAtom = atom<SelectedClawInfo>(null)

// Track whether we're in edit mode for the selected claw (shows edit form in main view instead of modal)
export const isEditingClawAtom = atom<boolean>(false)

// Claw execution viewing state for chat integration
export const viewingClawExecutionAtom = atom<{
  executionId: string
  clawName: string
  subChatId?: string
  subChatName?: string
} | null>(null)

// Track if we're viewing a claw chat (to show chat view instead of list)
export const isViewingClawChatAtom = atom<boolean>(false)

// Login modal (shown when Claude Code auth fails)
export const agentsLoginModalOpenAtom = atom<boolean>(false)

// Help popover
export const agentsHelpPopoverOpenAtom = atom<boolean>(false)

// Quick switch dialog - Agents
export const agentsQuickSwitchOpenAtom = atom<boolean>(false)
export const agentsQuickSwitchSelectedIndexAtom = atom<number>(0)

// Quick switch dialog - Sub-chats
export const subChatsQuickSwitchOpenAtom = atom<boolean>(false)
export const subChatsQuickSwitchSelectedIndexAtom = atom<number>(0)

// ============================================
// UPDATE ATOMS
// ============================================

export type UpdateStatus =
  | "idle"
  | "checking"
  | "available"
  | "downloading"
  | "ready"
  | "error"

export type UpdateState = {
  status: UpdateStatus
  version?: string
  progress?: number // 0-100
  bytesPerSecond?: number
  transferred?: number
  total?: number
  error?: string
}

export const updateStateAtom = atom<UpdateState>({ status: "idle" })

// Track if app was just updated (to show "What's New" banner)
// This is set to true when app launches with a new version, reset when user dismisses
export const justUpdatedAtom = atom<boolean>(false)

// Store the version that triggered the "just updated" state
export const justUpdatedVersionAtom = atom<string | null>(null)

// Legacy atom for backwards compatibility (deprecated)
export type UpdateInfo = {
  version: string
  downloadUrl: string
  releaseNotes?: string
}

export const updateInfoAtom = atom<UpdateInfo | null>(null)

// ============================================
// DESKTOP/FULLSCREEN STATE ATOMS
// ============================================

// Whether app is running in Electron desktop environment
export const isDesktopAtom = atom<boolean>(false)

// Fullscreen state - null means not initialized yet
// null = not yet loaded, false = not fullscreen, true = fullscreen
export const isFullscreenAtom = atom<boolean | null>(null)

// ============================================
// ONBOARDING ATOMS
// ============================================

// Billing method selected during onboarding
// "claude-subscription" = use Claude Pro/Max via OAuth
// "api-key" = use Anthropic API key directly
// "custom-model" = use custom base URL and model (e.g. for proxies or alternative providers)
// "aws-bedrock" = use AWS Bedrock via SSO
// null = not yet selected (show billing method selection screen)
export type BillingMethod = "claude-subscription" | "api-key" | "custom-model" | "aws-bedrock" | "ollama" | null

export const billingMethodAtom = atomWithStorage<BillingMethod>(
  "onboarding:billing-method",
  null,
  undefined,
  { getOnInit: true },
)

// Whether user has completed Anthropic OAuth during onboarding
// Reset on logout
export const anthropicOnboardingCompletedAtom = atomWithStorage<boolean>(
  "onboarding:anthropic-completed",
  false,
  undefined,
  { getOnInit: true },
)

// Whether user has completed API key configuration during onboarding
// Only relevant when billingMethod is "api-key"
export const apiKeyOnboardingCompletedAtom = atomWithStorage<boolean>(
  "onboarding:api-key-completed",
  false,
  undefined,
  { getOnInit: true },
)

// Whether user has completed AWS Bedrock SSO configuration during onboarding
// Only relevant when billingMethod is "aws-bedrock"
export const awsBedrockOnboardingCompletedAtom = atomWithStorage<boolean>(
  "onboarding:aws-bedrock-completed",
  false,
  undefined,
  { getOnInit: true },
)

// Whether user has completed Ollama configuration during onboarding
// Only relevant when billingMethod is "ollama"
export const ollamaOnboardingCompletedAtom = atomWithStorage<boolean>(
  "onboarding:ollama-completed",
  false,
  undefined,
  { getOnInit: true },
)

// ============================================
// SESSION INFO ATOMS (MCP, Plugins, Tools)
// ============================================

export type MCPServerStatus = "connected" | "failed" | "pending" | "needs-auth"

export type MCPServer = {
  name: string
  status: MCPServerStatus
  serverInfo?: {
    name: string
    version: string
  }
  error?: string
}

export type SDKSlashCommand = {
  name: string
  description: string
  source: "builtin" | "custom" | "skill" | "plugin"
  argumentHint?: string
}

export type SessionInfo = {
  tools: string[]
  mcpServers: MCPServer[]
  plugins: { name: string; path: string }[]
  skills: string[]
  slashCommands: SDKSlashCommand[]
}

// Session info from SDK init message
// Contains MCP servers, plugins, available tools, and skills
// Persisted to localStorage so MCP tools are visible after page refresh
// Updated when a new chat session starts
export const sessionInfoAtom = atomWithStorage<SessionInfo | null>(
  "21st-session-info",
  null,
  undefined,
  { getOnInit: true },
)

// ============================================
// CLUSTERS FEATURE ATOMS
// ============================================

// Feature flag for Kubernetes Clusters feature - OFF by default
// Enable via Settings > Beta tab
export const clustersFeatureEnabledAtom = atomWithStorage<boolean>(
  "preferences:clusters-feature-enabled",
  false,
  undefined,
  { getOnInit: true },
)

// Default namespace override for Kubernetes clusters
// When null, uses derived value from DEVELOPER_EMAIL/GITHUB_EMAIL/git config
// User can override in Settings > Beta tab
export const clustersDefaultNamespaceAtom = atomWithStorage<string | null>(
  "preferences:clusters-default-namespace",
  null,
  undefined,
  { getOnInit: true },
)

// Feature flag for DevSpace feature - OFF by default
// Enable via Settings > Kubernetes tab
export const devspaceFeatureEnabledAtom = atomWithStorage<boolean>(
  "preferences:devspace-feature-enabled",
  false,
  undefined,
  { getOnInit: true },
)
