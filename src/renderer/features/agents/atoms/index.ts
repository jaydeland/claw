import { atom } from "jotai"
import { atomFamily, atomWithStorage } from "jotai/utils"

// Selected agent chat ID - null means "new chat" view (persisted to restore on reload)
export const selectedAgentChatIdAtom = atomWithStorage<string | null>(
  "agents:selectedChatId",
  null,
  undefined,
  { getOnInit: true },
)

// Previous agent chat ID - used to navigate back after archiving current chat
// Not persisted - only tracks within current session
export const previousAgentChatIdAtom = atom<string | null>(null)

// Selected draft ID - when user clicks on a draft in sidebar, this is set
// NewChatForm uses this to restore the draft text
// Reset to null when "New Workspace" is clicked or chat is created
export const selectedDraftIdAtom = atom<string | null>(null)

// Preview paths storage - stores all preview paths keyed by chatId
const previewPathsStorageAtom = atomWithStorage<Record<string, string>>(
  "agents:previewPaths",
  {},
  undefined,
  { getOnInit: true },
)

// atomFamily to get/set preview path per chatId
export const previewPathAtomFamily = atomFamily((chatId: string) =>
  atom(
    (get) => get(previewPathsStorageAtom)[chatId] ?? "/",
    (get, set, newPath: string) => {
      const current = get(previewPathsStorageAtom)
      set(previewPathsStorageAtom, { ...current, [chatId]: newPath })
    },
  ),
)

// Preview viewport modes storage - stores viewport mode per chatId
const viewportModesStorageAtom = atomWithStorage<
  Record<string, "desktop" | "mobile">
>("agents:viewportModes", {}, undefined, { getOnInit: true })

// atomFamily to get/set viewport mode per chatId
export const viewportModeAtomFamily = atomFamily((chatId: string) =>
  atom(
    (get) => get(viewportModesStorageAtom)[chatId] ?? "desktop",
    (get, set, newMode: "desktop" | "mobile") => {
      const current = get(viewportModesStorageAtom)
      set(viewportModesStorageAtom, { ...current, [chatId]: newMode })
    },
  ),
)

// Preview scales storage - stores scale per chatId
const previewScalesStorageAtom = atomWithStorage<Record<string, number>>(
  "agents:previewScales",
  {},
  undefined,
  { getOnInit: true },
)

// atomFamily to get/set preview scale per chatId
export const previewScaleAtomFamily = atomFamily((chatId: string) =>
  atom(
    (get) => get(previewScalesStorageAtom)[chatId] ?? 100,
    (get, set, newScale: number) => {
      const current = get(previewScalesStorageAtom)
      set(previewScalesStorageAtom, { ...current, [chatId]: newScale })
    },
  ),
)

// Mobile device dimensions storage - stores device settings per chatId
type MobileDeviceSettings = {
  width: number
  height: number
  preset: string
}

const mobileDevicesStorageAtom = atomWithStorage<
  Record<string, MobileDeviceSettings>
>("agents:mobileDevices", {}, undefined, { getOnInit: true })

// atomFamily to get/set mobile device settings per chatId
export const mobileDeviceAtomFamily = atomFamily((chatId: string) =>
  atom(
    (get) =>
      get(mobileDevicesStorageAtom)[chatId] ?? {
        width: 393,
        height: 852,
        preset: "iPhone 16",
      },
    (get, set, newDevice: MobileDeviceSettings) => {
      const current = get(mobileDevicesStorageAtom)
      set(mobileDevicesStorageAtom, { ...current, [chatId]: newDevice })
    },
  ),
)

// Loading sub-chats: Map<subChatId, parentChatId>
// Used to show loading indicators on tabs and sidebar
// Set when generation starts, cleared when onFinish fires
export const loadingSubChatsAtom = atom<Map<string, string>>(new Map())

// Helper to set loading state
export const setLoading = (
  setter: (fn: (prev: Map<string, string>) => Map<string, string>) => void,
  subChatId: string,
  parentChatId: string,
) => {
  setter((prev) => {
    // Only create new Map if value actually changed
    // This prevents unnecessary re-renders
    if (prev.get(subChatId) === parentChatId) return prev
    const next = new Map(prev)
    next.set(subChatId, parentChatId)
    return next
  })
}

// Helper to clear loading state
export const clearLoading = (
  setter: (fn: (prev: Map<string, string>) => Map<string, string>) => void,
  subChatId: string,
) => {
  setter((prev) => {
    // Only create new Map if subChatId was actually in loading state
    // This prevents unnecessary re-renders when switching between non-loading sub-chats
    if (!prev.has(subChatId)) return prev
    const next = new Map(prev)
    next.delete(subChatId)
    return next
  })
}

// Persisted preferences for agents page
export type SavedRepo = {
  id: string
  name: string
  full_name: string
  sandbox_status?: "not_setup" | "in_progress" | "ready" | "error"
  installation_id?: string
  isPublicImport?: boolean
} | null

export const lastSelectedRepoAtom = atomWithStorage<SavedRepo>(
  "agents:lastSelectedRepo",
  null,
  undefined,
  { getOnInit: true },
)

// Selected local project (persisted)
export type SelectedProject = {
  id: string
  name: string
  path: string
  gitRemoteUrl?: string | null
  gitProvider?: "github" | "gitlab" | "bitbucket" | null
  gitOwner?: string | null
  gitRepo?: string | null
} | null

export const selectedProjectAtom = atomWithStorage<SelectedProject>(
  "agents:selectedProject",
  null,
  undefined,
  { getOnInit: true },
)

export const lastSelectedAgentIdAtom = atomWithStorage<string>(
  "agents:lastSelectedAgentId",
  "claude-code",
  undefined,
  { getOnInit: true },
)

export const lastSelectedModelIdAtom = atomWithStorage<string>(
  "agents:lastSelectedModelId",
  "sonnet",
  undefined,
  { getOnInit: true },
)

// Agent mode type - supports agent and plan modes
export type AgentMode = "agent" | "plan"

// Primary mode atom - bi-state for agent and plan modes
export const agentModeAtom = atomWithStorage<AgentMode>(
  "agents:agentMode",
  "agent", // default to agent mode
  undefined,
  { getOnInit: true },
)

// Backward compatibility - derived atom for existing code using isPlanModeAtom
// Getter: returns true if mode is "plan"
// Setter: sets mode to "plan" if true, otherwise sets to "agent" (not swarm)
export const isPlanModeAtom = atom(
  (get) => get(agentModeAtom) === "plan",
  (get, set, value: boolean) => {
    const current = get(agentModeAtom)
    if (value) {
      set(agentModeAtom, "plan")
    } else {
      // If turning off plan mode, go back to agent (not swarm)
      set(agentModeAtom, current === "plan" ? "agent" : current)
    }
  }
)

// Model ID to full Claude model string mapping
export const MODEL_ID_MAP: Record<string, string> = {
  opus: "opus",
  sonnet: "sonnet",
  haiku: "haiku",
}

// Sidebar state
export const agentsSidebarOpenAtom = atomWithStorage<boolean>(
  "agents-sidebar-open",
  true,
  undefined,
  { getOnInit: true },
)

// Sidebar width with localStorage persistence
export const agentsSidebarWidthAtom = atomWithStorage<number>(
  "agents-sidebar-width",
  224,
  undefined,
  { getOnInit: true },
)

// Sidebar content panel width (left panel showing workspaces/history/etc)
export const sidebarContentWidthAtom = atomWithStorage<number>(
  "agents-sidebar-content-width",
  256, // default width (was w-64)
  undefined,
  { getOnInit: true },
)

// Preview sidebar (right) width and open state
export const agentsPreviewSidebarWidthAtom = atomWithStorage<number>(
  "agents-preview-sidebar-width",
  500,
  undefined,
  { getOnInit: true },
)

export const agentsPreviewSidebarOpenAtom = atomWithStorage<boolean>(
  "agents-preview-sidebar-open",
  true,
  undefined,
  { getOnInit: true },
)

// Diff sidebar (right) width (global - same width for all chats)
export const agentsDiffSidebarWidthAtom = atomWithStorage<number>(
  "agents-diff-sidebar-width",
  800,
  undefined,
  { getOnInit: true },
)

// Changes panel (file list) width within the diff sidebar
export const agentsChangesPanelWidthAtom = atomWithStorage<number>(
  "agents-changes-panel-width",
  280,
  undefined,
  { getOnInit: true },
)

// Changes panel collapsed state in narrow view (collapsed by default)
export const agentsChangesPanelCollapsedAtom = atomWithStorage<boolean>(
  "agents-changes-panel-collapsed",
  true, // collapsed by default
  undefined,
  { getOnInit: true },
)

// Tasks panel visibility (not persisted - resets on app restart)
export const showTasksPanelAtom = atom<boolean>(false)

// Diff view display mode - sidebar (side peek), center dialog, or fullscreen
// Defined early because diffSidebarOpenAtomFamily depends on it
export type DiffViewDisplayMode = "side-peek" | "center-peek" | "full-page"

export const diffViewDisplayModeAtom = atomWithStorage<DiffViewDisplayMode>(
  "agents:diffViewDisplayMode",
  "full-page", // default to full-screen view
  undefined,
  { getOnInit: true },
)

// Diff sidebar open state storage - stores per chatId (persisted)
const diffSidebarOpenStorageAtom = atomWithStorage<Record<string, boolean>>(
  "agents:diffSidebarOpen",
  {},
  undefined,
  { getOnInit: true },
)

// Runtime open state - not persisted, used for dialog/fullscreen modes
const diffSidebarOpenRuntimeAtom = atom<Record<string, boolean>>({})

// atomFamily to get/set diff sidebar open state per chatId
// Only restores persisted state when display mode is "side-peek" (sidebar mode)
// For dialog/fullscreen modes, we use runtime state only (not auto-restored on page load)
export const diffSidebarOpenAtomFamily = atomFamily((chatId: string) =>
  atom(
    (get) => {
      const displayMode = get(diffViewDisplayModeAtom)
      const runtimeOpen = get(diffSidebarOpenRuntimeAtom)[chatId]

      // If we have a runtime value, use it (user explicitly opened/closed)
      if (runtimeOpen !== undefined) {
        return runtimeOpen
      }

      // For initial load: only restore persisted state for sidebar mode
      // Dialog and fullscreen should not auto-open on page load
      if (displayMode !== "side-peek") {
        return false
      }
      return get(diffSidebarOpenStorageAtom)[chatId] ?? false
    },
    (get, set, isOpen: boolean) => {
      // Always update runtime state
      const currentRuntime = get(diffSidebarOpenRuntimeAtom)
      set(diffSidebarOpenRuntimeAtom, { ...currentRuntime, [chatId]: isOpen })

      // Also persist for sidebar mode
      const current = get(diffSidebarOpenStorageAtom)
      set(diffSidebarOpenStorageAtom, { ...current, [chatId]: isOpen })
    },
  ),
)

// Diff list view mode (flat or tree)
export const diffListModeAtom = atomWithStorage<"flat" | "tree">(
  "agents-diff:list-mode",
  "tree", // Default to tree view
  undefined,
  { getOnInit: true },
)

// Legacy global atom - kept for backwards compatibility, maps to empty string key
// TODO: Remove after migration
export const agentsDiffSidebarOpenAtom = atomWithStorage<boolean>(
  "agents-diff-sidebar-open",
  false,
  undefined,
  { getOnInit: true },
)

// Focused file path in diff sidebar (for scroll-to-file feature)
// Set by AgentEditTool on click, consumed by AgentDiffView
export const agentsFocusedDiffFileAtom = atom<string | null>(null)

// Collapsed state for diff files per chat - preserved across narrow/wide layout changes
// Map<fileKey, isCollapsed>
const diffFilesCollapsedStorageAtom = atom<Record<string, Record<string, boolean>>>({})

export const diffFilesCollapsedAtomFamily = atomFamily((chatId: string) =>
  atom(
    (get) => get(diffFilesCollapsedStorageAtom)[chatId] ?? {},
    (get, set, collapsed: Record<string, boolean>) => {
      const current = get(diffFilesCollapsedStorageAtom)
      set(diffFilesCollapsedStorageAtom, { ...current, [chatId]: collapsed })
    },
  ),
)

// DEPRECATED: No longer used after layout refactoring. Can be removed in future cleanup.
// Sub-chats display mode - tabs (horizontal) or sidebar (vertical list)
export const agentsSubChatsSidebarModeAtom = atomWithStorage<
  "tabs" | "sidebar"
>("agents-subchats-mode", "tabs", undefined, { getOnInit: true })

// DEPRECATED: No longer used after layout refactoring. Can be removed in future cleanup.
// Sub-chats sidebar width (left side of chat area)
export const agentsSubChatsSidebarWidthAtom = atomWithStorage<number>(
  "agents-subchats-sidebar-width",
  200,
  undefined,
  { getOnInit: true },
)

// Track chats with unseen changes (finished streaming but user hasn't opened them)
// Updated by onFinish callback in Chat instances
export const agentsUnseenChangesAtom = atom<Set<string>>(new Set<string>())

// Current todos state per sub-chat
// Syncs the first (creation) todo tool with subsequent updates
// Map structure: { [subChatId]: TodoState }
interface TodoItem {
  content: string
  status: "pending" | "in_progress" | "completed"
  activeForm?: string
}

interface TodoState {
  todos: TodoItem[]
  creationToolCallId: string | null // ID of the tool call that created the todos
}

const allTodosStorageAtom = atom<Record<string, TodoState>>({})

// atomFamily to get/set todos per subChatId
export const currentTodosAtomFamily = atomFamily((subChatId: string) =>
  atom(
    (get) => get(allTodosStorageAtom)[subChatId] ?? { todos: [], creationToolCallId: null },
    (get, set, newState: TodoState) => {
      const current = get(allTodosStorageAtom)
      set(allTodosStorageAtom, { ...current, [subChatId]: newState })
    },
  ),
)

// Track sub-chats with unseen changes (finished streaming but user hasn't viewed them)
// Updated by onFinish callback in Chat instances
export const agentsSubChatUnseenChangesAtom = atom<Set<string>>(
  new Set<string>(),
)

// Repository filter for archive (null = all repositories)
export const archiveRepositoryFilterAtom = atom<string | null>(null)

// Track last used mode (plan/agent/swarm) per chat
// Map<chatId, AgentMode>
export const lastChatModesAtom = atom<Map<string, AgentMode>>(
  new Map<string, AgentMode>(),
)

// Mobile view mode - chat (default, shows NewChatForm), chats list, preview, diff, or terminal
export type AgentsMobileViewMode = "chats" | "chat" | "preview" | "diff" | "terminal"
export const agentsMobileViewModeAtom = atom<AgentsMobileViewMode>("chat")

// Debug mode for testing first-time user experience
// Only works in development mode
export interface AgentsDebugMode {
  enabled: boolean
  simulateNoTeams: boolean // Simulate no teams available
  simulateNoRepos: boolean // Simulate no repositories connected
  simulateNoReadyRepos: boolean // Simulate only non-ready repos (in_progress/error)
  resetOnboarding: boolean // Reset onboarding dialog on next load
  bypassConnections: boolean // Allow going through onboarding steps even if already connected
  forceStep:
    | "workspace"
    | "profile"
    | "claude-code"
    | "github"
    | "discord"
    | null // Force a specific onboarding step
  simulateCompleted: boolean // Simulate onboarding as completed
}

export const agentsDebugModeAtom = atomWithStorage<AgentsDebugMode>(
  "agents:debugMode",
  {
    enabled: false,
    simulateNoTeams: false,
    simulateNoRepos: false,
    simulateNoReadyRepos: false,
    resetOnboarding: false,
    bypassConnections: false,
    forceStep: null,
    simulateCompleted: false,
  },
  undefined,
  { getOnInit: true },
)

// Changed files per sub-chat for tracking edits/writes
// Map<subChatId, FileChange[]>
export interface SubChatFileChange {
  filePath: string
  displayPath: string
  additions: number
  deletions: number
}

export const subChatFilesAtom = atom<Map<string, SubChatFileChange[]>>(
  new Map(),
)

// Mapping from subChatId to chatId (workspace ID) for aggregating stats
// Map<subChatId, chatId>
export const subChatToChatMapAtom = atom<Map<string, string>>(new Map())

// Filter files for diff sidebar (null = show all files)
// When set, AgentDiffView will only show files matching these paths
export const filteredDiffFilesAtom = atom<string[] | null>(null)

// Selected file path in diff sidebar (for highlighting in file list and showing in diff view)
// Using atom instead of useState to prevent re-renders of unrelated components
export const selectedDiffFilePathAtom = atom<string | null>(null)

// PR creation loading state - atom to allow ChatViewInner to reset it after sending message
export const isCreatingPrAtom = atom<boolean>(false)

// Merge with AI loading state (similar to isCreatingPrAtom)
export const isMergingWithAiAtom = atom<boolean>(false)

// Pending merge message to send to chat (similar to pendingPrMessageAtom)
export const pendingMergeMessageAtom = atom<string | null>(null)

// Filter by subchat ID for diff sidebar and changes panel (null = show all)
// When set by Review button, both diff view and file list filter to this subchat's files
export const filteredSubChatIdAtom = atom<string | null>(null)

// Selected commit for viewing in diff view
// null = show working tree diff (current behavior)
// When set, diff view shows files from this commit instead of working tree
export type SelectedCommit = {
	hash: string
	shortHash: string
	message: string
	description?: string
	author?: string
	date?: Date
} | null
export const selectedCommitAtom = atom<SelectedCommit>(null)

// Pending PR message to send to chat
// Set by ChatView when "Create PR" is clicked, consumed by ChatViewInner
export const pendingPrMessageAtom = atom<string | null>(null)

// Pending Review message to send to chat
// Set by ChatView when "Review" is clicked, consumed by ChatViewInner
export const pendingReviewMessageAtom = atom<string | null>(null)

// Pending merge conflict resolution message to send to chat
// Set when user clicks "Fix Conflicts" button, consumed by ChatViewInner
export const pendingConflictResolutionMessageAtom = atom<string | null>(null)

// Pending post-merge message to send to chat
// Set when user completes a merge, consumed by ChatViewInner
export const pendingPostMergeMessageAtom = atom<string | null>(null)

// Pending auth retry - stores failed message when auth-error occurs
// After successful OAuth flow, this triggers automatic retry of the message
export type PendingAuthRetryMessage = {
  subChatId: string  // Required: only retry in the correct chat
  prompt: string
  images?: Array<{
    base64Data: string
    mediaType: string
    filename?: string
  }>
  readyToRetry?: boolean  // Only retry when this is true (set by modal on OAuth success)
}
export const pendingAuthRetryMessageAtom = atom<PendingAuthRetryMessage | null>(null)

// Work mode preference (local = work in project dir, worktree = create isolated worktree)
export type WorkMode = "local" | "worktree"
export const lastSelectedWorkModeAtom = atomWithStorage<WorkMode>(
  "agents:lastSelectedWorkMode",
  "worktree", // default to worktree for current behavior
  undefined,
  { getOnInit: true },
)

// Last selected branch per project (persisted)
// Maps projectId -> branchName
export const lastSelectedBranchesAtom = atomWithStorage<Record<string, string>>(
  "agents:lastSelectedBranches",
  {},
  undefined,
  { getOnInit: true },
)

// Compacting status per sub-chat
// Set<subChatId> - subChats currently being compacted
export const compactingSubChatsAtom = atom<Set<string>>(new Set<string>())

// Track IDs of chats/subchats created in this browser session (NOT persisted - resets on reload)
// Used to determine whether to show placeholder + typewriter effect
export const justCreatedIdsAtom = atom<Set<string>>(new Set<string>())

// Pending user questions from AskUserQuestion tool
// Set when Claude requests user input, cleared when answered or skipped
export const QUESTIONS_SKIPPED_MESSAGE = "User skipped questions - proceed with defaults"

export type PendingUserQuestion = {
  subChatId: string
  parentChatId: string
  toolUseId: string
  questions: Array<{
    question: string
    header: string
    options: Array<{ label: string; description: string }>
    multiSelect: boolean
  }>
}
// Map<subChatId, PendingUserQuestion> - supports multiple pending questions across workspaces
export const pendingUserQuestionsAtom = atom<Map<string, PendingUserQuestion>>(new Map())

// Legacy type alias for backwards compatibility
export type PendingUserQuestions = PendingUserQuestion

// Track sub-chats with pending plan approval (plan ready but not yet implemented)
// Set<subChatId>
export const pendingPlanApprovalsAtom = atom<Set<string>>(new Set<string>())

// File content dialog state
export interface FileContentDialogData {
  filePath: string
  displayPath: string
  content: string
  language?: string
}

export const fileContentDialogOpenAtom = atom<boolean>(false)
export const selectedFileContentAtom = atom<FileContentDialogData | null>(null)

// Store AskUserQuestion results by toolUseId for real-time updates
// Map<toolUseId, result>
export const askUserQuestionResultsAtom = atom<Map<string, unknown>>(new Map())

// Unified undo stack for workspace and sub-chat archivation
// Supports Cmd+Z to restore the last archived item (workspace or sub-chat)
export type UndoItem =
  | { type: "workspace"; chatId: string; timeoutId: ReturnType<typeof setTimeout> }
  | { type: "subchat"; subChatId: string; chatId: string; timeoutId: ReturnType<typeof setTimeout> }

export const undoStackAtom = atom<UndoItem[]>([])

// Viewed files state for diff review (GitHub-style "Viewed" checkbox)
// Tracks which files have been reviewed with content hash to detect changes
export type ViewedFileState = {
  viewed: boolean
  contentHash: string // Hash of diffText when marked as viewed
}

// Storage atom for viewed files per chat
// Structure: { [chatId]: { [fileKey]: ViewedFileState } }
const viewedFilesStorageAtom = atomWithStorage<
  Record<string, Record<string, ViewedFileState>>
>(
  "agents:viewedFiles",
  {},
  undefined,
  { getOnInit: true },
)

// atomFamily to get/set viewed files per chatId
export const viewedFilesAtomFamily = atomFamily((chatId: string) =>
  atom(
    (get) => get(viewedFilesStorageAtom)[chatId] ?? {},
    (get, set, newState: Record<string, ViewedFileState>) => {
      const current = get(viewedFilesStorageAtom)
      set(viewedFilesStorageAtom, { ...current, [chatId]: newState })
    },
  ),
)

// ============================================
// COMMAND SELECTION
// ============================================

// ============================================
// SIDEBAR TAB NAVIGATION
// ============================================

/**
 * Sidebar tab types:
 * - "history": Chat history view
 * - "chats": Default chat list view
 * - "agents": List of available agents
 * - "skills": List of available skills (includes commands)
 * - "mcps": List of MCP servers
 * - "clusters": Cluster management
 * - "terminal": Terminal sessions list
 * - "gsd": GSD (Get Shit Done) planning framework
 * - "github": GitHub view (PRs, Issues, Code, Visualize)
 * - "prompts": System prompts management
 */
export type SidebarTab = "history" | "chats" | "agents" | "skills" | "mcps" | "clusters" | "terminal" | "gsd" | "github" | "prompts" | "settings" | "er-diagram"

/**
 * Currently selected sidebar tab (persisted)
 * Defaults to "chats" which shows the workspace list
 */
export const selectedSidebarTabAtom = atomWithStorage<SidebarTab>(
  "agents:selectedSidebarTab",
  "chats",
  undefined,
  { getOnInit: true },
)

/**
 * Selected CC Settings category
 * Controls which settings section is shown in the main content area
 */
export type SettingsCategory =
  // General Settings
  | "overview"
  | "permissions"
  | "hooks"
  | "status-line"
  // Agents
  | "agents-overview"
  | "agents-permissions"
  // Skills
  | "skills-overview"
  | "skills-hooks"
  // MCPs
  | "mcps-overview"
  | "mcps-permissions"

export const selectedSettingsCategoryAtom = atom<SettingsCategory | null>(null)

/**
 * Sidebar content collapsed state (persisted)
 * When collapsed, only the tab bar is shown, not the tab content
 */
export const sidebarContentCollapsedAtom = atomWithStorage<boolean>(
  "agents:sidebarContentCollapsed",
  false,
  undefined,
  { getOnInit: true },
)

/**
 * Expanded workspace IDs in tree view (persisted)
 * Tracks which workspaces are expanded to show their nested chats
 */
export const expandedWorkspaceIdsAtom = atomWithStorage<Set<string>>(
  "agents:expandedWorkspaceIds",
  new Set(),
  {
    getItem: (key, initialValue) => {
      const stored = localStorage.getItem(key)
      if (!stored) return initialValue
      try {
        const arr = JSON.parse(stored) as string[]
        return new Set(arr)
      } catch {
        return initialValue
      }
    },
    setItem: (key, value) => {
      localStorage.setItem(key, JSON.stringify(Array.from(value)))
    },
    removeItem: (key) => {
      localStorage.removeItem(key)
    },
  },
  { getOnInit: true },
)

/**
 * Selected project ID for project detail view
 * When set, shows project settings page in main content area instead of chat
 * null = show chat view (default)
 */
export const selectedProjectDetailIdAtom = atom<string | null>(null)

/**
 * When a prompt chat is clicked from the sidebar, store the promptId to auto-select in PromptsView
 * Consumed and cleared by PromptsView on mount/update
 */
export const pendingPromptNavigationAtom = atom<string | null>(null)

// ============================================
// HISTORY TAB
// ============================================

/**
 * ID of the chat being viewed in the History tab (read-only mode)
 * null = no chat selected for viewing
 * Used by agents-content.tsx to display session flow for archived chats
 */
export const viewingHistoryChatIdAtom = atom<string | null>(null)

// ============================================
// GSD CHAT SIDEBAR
// ============================================

/**
 * Display mode for GSD planning panel
 * "side-peek" = sidebar panel (persisted open state)
 * "center-peek" = dialog/modal (runtime open state only)
 * "full-page" = fullscreen view (runtime open state only)
 */
export const gsdDisplayModeAtom = atomWithStorage<"side-peek" | "center-peek" | "full-page">(
  "agents:gsdDisplayMode",
  "side-peek",
  undefined,
  { getOnInit: true },
)

/**
 * GSD planning sidebar open state (right sidebar in chat view)
 * Controls visibility of the GSD planning sidebar that shows STATE.md data
 * Used for "side-peek" mode (persisted)
 */
export const gsdChatSidebarOpenAtom = atomWithStorage<boolean>(
  "agents:gsdChatSidebarOpen",
  false,
  undefined,
  { getOnInit: true },
)

/**
 * Runtime-only open state for GSD dialog and fullscreen modes
 * Not persisted - dialogs should not auto-open on page load
 */
export const gsdChatSidebarOpenRuntimeAtom = atom<boolean>(false)

/**
 * Currently selected GSD document for viewing in dialog
 * null = no document selected
 */
export const selectedGsdDocumentAtom = atom<string | null>(null)

/**
 * GSD sidebar width for resizable sidebar (persisted)
 * Default width is 400px
 */
export const gsdSidebarWidthAtom = atomWithStorage<number>(
  "agents:gsdSidebarWidth",
  400,
  undefined,
  { getOnInit: true },
)

// ============================================
// CLEANUP - Release localStorage on chat deletion
// ============================================

/**
 * Clean up all localStorage entries for a deleted chat
 * Call this when a chat is permanently deleted or archived
 */
export function cleanupChatLocalStorage(chatId: string) {
  if (typeof window === "undefined") return

  // Clear per-chat atomWithStorage entries
  const storageKeys = [
    "agents:previewPaths",
    "agents:viewportModes",
    "agents:previewScales",
    "agents:mobileDevices",
    "agents:diffSidebarOpen",
    "agents:viewedFiles",
  ]

  for (const key of storageKeys) {
    try {
      const stored = localStorage.getItem(key)
      if (!stored) continue
      const data = JSON.parse(stored)
      if (chatId in data) {
        delete data[chatId]
        localStorage.setItem(key, JSON.stringify(data))
      }
    } catch {
      // Ignore parse errors
    }
  }

  // Clear sub-chat localStorage entries (from sub-chat-store.ts)
  localStorage.removeItem(`agent-open-sub-chats-${chatId}`)
  localStorage.removeItem(`agent-active-sub-chats-${chatId}`)
  localStorage.removeItem(`agent-pinned-sub-chats-${chatId}`)
}

// ============================================
// DEV SERVER PREVIEW
// ============================================

// Re-export dev server preview atoms from feature module
export {
  devServerPreviewDisplayModeAtom,
  devServerPreviewSidebarOpenAtom,
  devServerPreviewSidebarOpenRuntimeAtom,
  devServerPreviewSidebarWidthAtom,
  devServerPreviewUrlAtomFamily,
  devServerPreviewPortAtomFamily,
  cleanupDevServerPreviewLocalStorage,
} from "../../dev-server-preview/atoms"
