export interface ClaudeModel {
  id: string
  name: string
  badge?: "TEAM" | "NEW"
}

export const CLAUDE_MODELS: ClaudeModel[] = [
  { id: "opus-team", name: "Opus Team", badge: "TEAM" },
  { id: "opus", name: "Opus" },
  { id: "sonnet", name: "Sonnet" },
  { id: "haiku", name: "Haiku" },
]
