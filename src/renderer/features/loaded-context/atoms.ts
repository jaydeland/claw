import { atom } from "jotai"
import { atomWithStorage } from "jotai/utils"
import type { DisplayMode } from "./types"

/**
 * Display mode for loaded context panel - matches session flow pattern
 * "side-peek" = sidebar panel
 * "center-peek" = dialog/modal
 * "full-page" = fullscreen view
 */
export const loadedContextDisplayModeAtom = atomWithStorage<DisplayMode>(
  "loaded-context-display-mode",
  "side-peek",
  undefined,
  { getOnInit: true },
)

/**
 * Sidebar open state (persisted) - used for side-peek mode
 */
export const loadedContextSidebarOpenAtom = atomWithStorage<boolean>(
  "loaded-context-sidebar-open",
  false,
  undefined,
  { getOnInit: true },
)

/**
 * Runtime-only open state for dialog and fullscreen modes (not persisted)
 */
export const loadedContextSidebarOpenRuntimeAtom = atom<boolean>(false)

/**
 * Sidebar width (persisted)
 */
export const loadedContextSidebarWidthAtom = atomWithStorage<number>(
  "loaded-context-sidebar-width",
  320,
  undefined,
  { getOnInit: true },
)

/**
 * Track which sections are expanded in the panel
 * Default: all sections expanded
 */
export const loadedContextExpandedSectionsAtom = atomWithStorage<string[]>(
  "loaded-context-expanded-sections",
  ["claudeMd", "mcpServers", "skills", "agents"],
  undefined,
  { getOnInit: true },
)
