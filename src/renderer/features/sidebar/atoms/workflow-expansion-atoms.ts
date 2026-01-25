import { atomWithStorage } from "jotai/utils"

/**
 * Storage implementation for Set<string>
 * Jotai atomWithStorage needs custom serialization for Sets
 */
const setStorage = {
  getItem: (key: string): Set<string> => {
    const value = localStorage.getItem(key)
    if (!value) return new Set()
    try {
      const parsed = JSON.parse(value)
      return new Set(parsed)
    } catch {
      return new Set()
    }
  },
  setItem: (key: string, value: Set<string>) => {
    localStorage.setItem(key, JSON.stringify(Array.from(value)))
  },
  removeItem: (key: string) => {
    localStorage.removeItem(key)
  },
}

/**
 * Track expanded workflow groups in agents tab
 * Stores namespace keys (e.g., "gsd", "vidyard")
 */
export const agentsExpansionAtom = atomWithStorage<Set<string>>(
  "sidebar:agents-expansion",
  new Set(),
  setStorage,
  { getOnInit: true }
)

/**
 * Track expanded workflow groups in commands tab
 * Stores namespace keys (e.g., "gsd", "vidyard")
 */
export const commandsExpansionAtom = atomWithStorage<Set<string>>(
  "sidebar:commands-expansion",
  new Set(),
  setStorage,
  { getOnInit: true }
)

/**
 * Track expanded workflow groups in skills tab
 * Stores namespace keys (e.g., "gsd", "vidyard")
 */
export const skillsExpansionAtom = atomWithStorage<Set<string>>(
  "sidebar:skills-expansion",
  new Set(),
  setStorage,
  { getOnInit: true }
)
