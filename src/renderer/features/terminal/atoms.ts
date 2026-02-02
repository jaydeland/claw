import { atom } from "jotai"
import { atomWithStorage } from "jotai/utils"
import type { SearchAddon } from "@xterm/addon-search"
import type { TerminalInstance } from "./types"

// Special ID for global terminals (not tied to any specific chat)
export const GLOBAL_TERMINAL_ID = "__global__"

// Special ID for DevSpace terminals (shown in both DevSpace tab and Terminal view)
export const DEVSPACE_TERMINAL_ID = "devspace"

export const terminalSidebarOpenAtom = atomWithStorage<boolean>(
  "terminal-sidebar-open",
  false,
  undefined,
  { getOnInit: true },
)

// Terminal dialog open state (modal version, opened with Cmd+`)
export const terminalDialogOpenAtom = atomWithStorage<boolean>(
  "terminal-dialog-open",
  false,
  undefined,
  { getOnInit: true },
)

export const terminalSidebarWidthAtom = atomWithStorage<number>(
  "terminal-sidebar-width",
  500,
  undefined,
  { getOnInit: true },
)

// Terminal cwd tracking - maps paneId to current working directory
export const terminalCwdAtom = atomWithStorage<Record<string, string>>(
  "terminal-cwds",
  {},
  undefined,
  { getOnInit: true },
)

// Terminal search open state - maps paneId to search visibility
export const terminalSearchOpenAtom = atom<Record<string, boolean>>({})

// ============================================================================
// Multi-Terminal State Management
// ============================================================================

/**
 * Map of chatId -> terminal instances.
 * Each chat can have multiple terminal instances.
 */
export const terminalsAtom = atomWithStorage<
  Record<string, TerminalInstance[]>
>("terminals-by-chat", {}, undefined, { getOnInit: true })

/**
 * Map of chatId -> active terminal id.
 * Tracks which terminal is currently active for each chat.
 */
export const activeTerminalIdAtom = atomWithStorage<
  Record<string, string | null>
>("active-terminal-by-chat", {}, undefined, { getOnInit: true })

// ============================================================================
// Terminal Dialog State Management
// ============================================================================

/**
 * Terminal instances for the dialog (global, not scoped to chat).
 * The terminal dialog provides a quick-access terminal modal.
 */
export const dialogTerminalsAtom = atomWithStorage<TerminalInstance[]>(
  "terminal-dialog-instances",
  [],
  undefined,
  { getOnInit: true },
)

/**
 * Active terminal id for the dialog.
 */
export const dialogActiveTerminalIdAtom = atomWithStorage<string | null>(
  "terminal-dialog-active-id",
  null,
  undefined,
  { getOnInit: true },
)

/**
 * Request to create a new terminal with custom properties.
 * Set this atom to create a terminal and open the dialog.
 * The value should be an object with optional cwd, name, and initialCommands.
 */
export interface CreateTerminalRequest {
  name?: string
  cwd?: string
  initialCommands?: string[]
}

export const createTerminalRequestAtom = atom<CreateTerminalRequest | null>(null)

// ============================================================================
// Terminal Settings
// ============================================================================

/**
 * Terminal word wrap setting (global, applies to all terminals).
 * When enabled, long lines wrap instead of requiring horizontal scroll.
 */
export const terminalWordWrapAtom = atomWithStorage<boolean>(
  "terminal-word-wrap",
  false,
  undefined,
  { getOnInit: true },
)

/**
 * Maps paneId to SearchAddon instance (runtime only, not persisted).
 * Used to share SearchAddon references between Terminal and TerminalTabs components.
 */
export const terminalSearchAddonAtom = atom<Record<string, SearchAddon | null>>({})
