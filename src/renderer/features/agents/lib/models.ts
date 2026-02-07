export interface ClaudeModel {
  id: string
  name: string
  badge?: "TEAM" | "NEW"
}

export const CLAUDE_MODELS: ClaudeModel[] = [
  { id: "opus-4-6-team", name: "Opus 4.6 Team", badge: "TEAM" },
  { id: "opus-4-6", name: "Opus 4.6", badge: "NEW" },
  { id: "opus", name: "Opus" },
  { id: "sonnet", name: "Sonnet" },
  { id: "haiku", name: "Haiku" },
]
