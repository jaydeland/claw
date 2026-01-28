import type { BuiltinCommandAction, SlashCommandOption } from "./types"

/**
 * Claw-specific slash commands that are handled client-side (not sent to SDK)
 * Commands that modify UI state or trigger Claw-specific features
 */
export const BUILTIN_SLASH_COMMANDS: SlashCommandOption[] = [
  {
    id: "builtin:clear",
    name: "clear",
    command: "/clear",
    description: "Start a new conversation (creates new sub-chat)",
    category: "builtin",
  },
  {
    id: "builtin:plan",
    name: "plan",
    command: "/plan",
    description: "Switch to Plan mode (creates plan before making changes)",
    category: "builtin",
  },
  {
    id: "builtin:agent",
    name: "agent",
    command: "/agent",
    description: "Switch to Agent mode (applies changes directly)",
    category: "builtin",
  },
  {
    id: "builtin:tasks",
    name: "tasks",
    command: "/tasks",
    description: "View background tasks running in this session",
    category: "builtin",
  },
]

// Note: /compact, /review, /pr-comments, /release-notes, /security-review, /commit, /worktree-setup
// are now handled by the SDK natively. They will appear from SDK's slash_commands discovery.

/**
 * Filter builtin commands by search text
 */
export function filterBuiltinCommands(
  searchText: string,
): SlashCommandOption[] {
  if (!searchText) return BUILTIN_SLASH_COMMANDS

  const query = searchText.toLowerCase()
  return BUILTIN_SLASH_COMMANDS.filter(
    (cmd) =>
      cmd.name.toLowerCase().includes(query) ||
      cmd.description.toLowerCase().includes(query),
  )
}
