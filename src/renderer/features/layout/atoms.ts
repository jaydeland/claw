import { atomWithStorage } from "jotai/utils"

/**
 * Controls whether the right icon bar is expanded to show labels
 * - false (default): Icon-only vertical bar
 * - true: Expanded horizontal buttons showing [Icon] Name [<<]
 */
export const rightIconBarExpandedAtom = atomWithStorage<boolean>(
  "agents-right-icon-bar-expanded",
  false,
  undefined,
  { getOnInit: true },
)
