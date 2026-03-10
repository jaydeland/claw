export interface ClaudeModel {
  id: string
  name: string
  badge?: "TEAM" | "NEW"
}

export const CLAUDE_MODELS: ClaudeModel[] = [
  { id: "haiku", name: "Haiku" },
  { id: "opus", name: "Opus" },
  { id: "sonnet", name: "Sonnet" },
]
