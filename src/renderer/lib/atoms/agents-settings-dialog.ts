// Stub atoms for agents settings dialog
import { atom } from "jotai"

export const agentsSettingsDialogOpenAtom = atom(false)

// Settings tab types - matches MAIN_TABS + ADVANCED_TABS in agents-settings-dialog.tsx
export type SettingsTab =
  | "profile"
  | "providers"
  | "appearance"
  | "keyboard"
  | "preferences"
  | "kubernetes"
  | "github"
  | "slack"
  | "whatsapp"
  | "advanced"
  | "worktrees"
  | "backup"
  | "debug"

export const agentsSettingsDialogActiveTabAtom = atom<SettingsTab | null>(null)
