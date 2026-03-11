import { atom } from "jotai"
import { atomFamily, atomWithStorage } from "jotai/utils"

/**
 * Display mode for dev server preview panel
 * "side-peek" = sidebar panel (persisted open state)
 * "center-peek" = dialog/modal (runtime open state only)
 * "full-page" = fullscreen view (runtime open state only)
 */
export const devServerPreviewDisplayModeAtom = atomWithStorage<
  "side-peek" | "center-peek" | "full-page"
>(
  "dev-server-preview:displayMode",
  "side-peek",
  undefined,
  { getOnInit: true },
)

/**
 * Dev server preview sidebar open state (right sidebar in chat view)
 * Controls visibility of the dev server preview sidebar
 * Used for "side-peek" mode (persisted)
 */
export const devServerPreviewSidebarOpenAtom = atomWithStorage<boolean>(
  "dev-server-preview:sidebarOpen",
  false,
  undefined,
  { getOnInit: true },
)

/**
 * Runtime-only open state for dev server preview dialog and fullscreen modes
 * Not persisted - dialogs should not auto-open on page load
 */
export const devServerPreviewSidebarOpenRuntimeAtom = atom<boolean>(false)

/**
 * Dev server preview sidebar width for resizable sidebar (persisted)
 * Default width is 500px
 */
export const devServerPreviewSidebarWidthAtom = atomWithStorage<number>(
  "dev-server-preview:sidebarWidth",
  500,
  undefined,
  { getOnInit: true },
)

/**
 * Selected URL per chat (persisted) - stores last viewed dev server URL
 * Structure: { [chatId]: url }
 */
const devServerPreviewUrlsStorageAtom = atomWithStorage<Record<string, string>>(
  "dev-server-preview:urls",
  {},
  undefined,
  { getOnInit: true },
)

/**
 * atomFamily to get/set dev server preview URL per chatId
 */
export const devServerPreviewUrlAtomFamily = atomFamily((chatId: string) =>
  atom(
    (get) => get(devServerPreviewUrlsStorageAtom)[chatId] ?? "",
    (get, set, newUrl: string) => {
      const current = get(devServerPreviewUrlsStorageAtom)
      set(devServerPreviewUrlsStorageAtom, { ...current, [chatId]: newUrl })
    },
  ),
)

/**
 * Selected port per chat (persisted) - stores last selected port number
 * Structure: { [chatId]: port }
 */
const devServerPreviewPortsStorageAtom = atomWithStorage<
  Record<string, number>
>("dev-server-preview:ports", {}, undefined, { getOnInit: true })

/**
 * atomFamily to get/set selected port per chatId
 */
export const devServerPreviewPortAtomFamily = atomFamily((chatId: string) =>
  atom(
    (get) => get(devServerPreviewPortsStorageAtom)[chatId] ?? null,
    (get, set, newPort: number | null) => {
      const current = get(devServerPreviewPortsStorageAtom)
      set(devServerPreviewPortsStorageAtom, { ...current, [chatId]: newPort ?? 0 })
    },
  ),
)

/**
 * Clean up localStorage entries for dev server preview on chat deletion
 */
export function cleanupDevServerPreviewLocalStorage(chatId: string) {
  if (typeof window === "undefined") return

  const storageKeys = [
    "dev-server-preview:urls",
    "dev-server-preview:ports",
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
}
