import { atom } from "jotai"
import { atomFamily, atomWithStorage } from "jotai/utils"
import { atomWithWindowStorage } from "../../lib/window-storage"
import type { TerminalInstance } from "./types"

// Special ID for global terminals (not tied to any specific chat)
export const GLOBAL_TERMINAL_ID = "__global__"

// Storage atom for persisting per-chat terminal sidebar state - window-scoped
const terminalSidebarOpenStorageAtom = atomWithWindowStorage<Record<string, boolean>>(
  "terminal-sidebar-open-by-chat",
  {},
  { getOnInit: true },
)

// Per-chat terminal sidebar open state (like diffSidebarOpenAtomFamily)
export const terminalSidebarOpenAtomFamily = atomFamily((chatId: string) =>
  atom(
    (get) => get(terminalSidebarOpenStorageAtom)[chatId] ?? false,
    (get, set, isOpen: boolean) => {
      const current = get(terminalSidebarOpenStorageAtom)
      set(terminalSidebarOpenStorageAtom, { ...current, [chatId]: isOpen })
    },
  ),
)

// Deprecated: Keep for backwards compatibility, but should not be used
// Use terminalSidebarOpenAtomFamily(chatId) instead
export const terminalSidebarOpenAtom = atom(false)

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

// Terminal cwd tracking - window-scoped, maps paneId to current working directory
export const terminalCwdAtom = atomWithWindowStorage<Record<string, string>>(
  "terminal-cwds",
  {},
  { getOnInit: true },
)

// Terminal search open state - maps paneId to search visibility
export const terminalSearchOpenAtom = atom<Record<string, boolean>>({})

// ============================================================================
// Multi-Terminal State Management
// ============================================================================

/**
 * Map of chatId -> terminal instances.
 * Window-scoped so each window manages its own terminal instances.
 */
export const terminalsAtom = atomWithWindowStorage<
  Record<string, TerminalInstance[]>
>("terminals-by-chat", {}, { getOnInit: true })

/**
 * Map of chatId -> active terminal id.
 * Window-scoped - tracks which terminal is currently active for each chat in this window.
 */
export const activeTerminalIdAtom = atomWithWindowStorage<
  Record<string, string | null>
>("active-terminal-by-chat", {}, { getOnInit: true })

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
