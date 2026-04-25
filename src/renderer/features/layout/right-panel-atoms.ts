import { atom } from "jotai"
import { atomWithStorage } from "jotai/utils"

/**
 * Right panel tab types:
 * - "changes": Changes/Diff view
 * - "session-flow": Session execution flow
 * - null: No panel open
 */
export type RightPanelTab = "changes" | "session-flow" | null

/**
 * Currently selected right panel tab (persisted)
 * null means no panel is open
 */
export const selectedRightPanelTabAtom = atomWithStorage<RightPanelTab>(
  "agents:selectedRightPanelTab",
  null,
  undefined,
  { getOnInit: true },
)

/**
 * Right panel width (persisted)
 */
export const rightPanelWidthAtom = atomWithStorage<number>(
  "agents:rightPanelWidth",
  400,
  undefined,
  { getOnInit: true },
)

/**
 * Right panel collapsed state (when tab is selected but panel is minimized)
 */
export const rightPanelCollapsedAtom = atomWithStorage<boolean>(
  "agents:rightPanelCollapsed",
  false,
  undefined,
  { getOnInit: true },
)
