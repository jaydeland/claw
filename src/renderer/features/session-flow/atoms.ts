import { atomWithStorage } from "jotai/utils"

export const sessionFlowSidebarOpenAtom = atomWithStorage<boolean>(
  "session-flow-sidebar-open",
  false,
  undefined,
  { getOnInit: true },
)

export const sessionFlowSidebarWidthAtom = atomWithStorage<number>(
  "session-flow-sidebar-width",
  320,
  undefined,
  { getOnInit: true },
)
