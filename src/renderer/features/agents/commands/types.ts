/**
 * Slash command types for agent chat
 */

export type SlashCommandCategory = "builtin" | "repository" | "gsd"

export interface SlashCommand {
  id: string
  name: string // Display name without slash, e.g. "clear", "help"
  description: string
  category: SlashCommandCategory
  // For repository commands - the prompt content from .md file
  prompt?: string
  // For repository commands - path to the .md file
  path?: string
  // For repository commands - the repository name
  repository?: string
  // For custom commands - hint for expected arguments (e.g. "[file_path]")
  argumentHint?: string
  // Source of the command (SDK, skill, bundled, etc.)
  source?: string
}

export interface SlashCommandOption extends SlashCommand {
  // Full command string for display, e.g. "/clear"
  command: string
}

// Trigger payload for slash command dropdown
export interface SlashTriggerPayload {
  searchText: string
  rect: DOMRect
}

// Builtin command action handlers
export type BuiltinCommandAction = never

// Result of selecting a slash command
export type SlashCommandSelection =
  | { category: "builtin"; action: BuiltinCommandAction }
  | { category: "repository"; prompt: string; name: string }
  | { category: "gsd"; name: string }
