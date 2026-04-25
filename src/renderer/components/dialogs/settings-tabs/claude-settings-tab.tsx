import { useState } from "react"
import { ChevronRight, ChevronDown, FileText, Puzzle, Bot, Webhook } from "lucide-react"
import { cn } from "@/lib/utils"
import { trpc } from "@/lib/trpc"
import { useAtom } from "jotai"
import { selectedProjectAtom } from "@/features/agents/atoms"

/**
 * Claude Settings Tab
 *
 * Provides a tree view of Skills, MCPs, Agents, and Hooks with split-pane editing.
 * Supports both global and project-scoped settings.
 */

type TreeItemType = "mcp" | "skill" | "agent" | "hook"
type SettingsScope = "global" | "project"

interface TreeItem {
  id: string
  type: TreeItemType
  name: string
  path?: string
  scope: SettingsScope
  source?: string
}

interface McpSource {
  type: string
  path: string
  exists: boolean
}

interface SkillItem {
  name: string
  path: string
  source: string
}

interface AgentItem {
  name: string
  path: string
  source: string
}

interface HookItem {
  id: string
  name: string
  scope: string
}

export function ClaudeSettingsTab() {
  const [selectedProject] = useAtom(selectedProjectAtom)
  const [expandedCategories, setExpandedCategories] = useState<string[]>([
    "mcps",
    "skills",
    "agents",
    "hooks",
  ])
  const [selectedItem, setSelectedItem] = useState<TreeItem | null>(null)
  const [scope, setScope] = useState<SettingsScope>("global")

  // Fetch data from tRPC
  const { data: mcpConfig } = trpc.configManagement.listMcpConfigFiles.useQuery({})
  const { data: skills } = trpc.skills.listCombined.useQuery({})
  const { data: agents } = trpc.agents.listEnabled.useQuery({})
  const { data: hooks } = trpc.hooks.list.useQuery({
    projectId: selectedProject?.id,
    scope: "all",
  })

  // Build tree categories
  const categories = [
    {
      id: "mcps",
      label: "MCP Servers",
      icon: Puzzle,
      expanded: expandedCategories.includes("mcps"),
      items:
        (mcpConfig?.configs
          ?.flatMap((config: McpSource) => config.exists ? [config] : [])
          .map((source: McpSource) => ({
            id: `mcp-${source.path}`,
            type: "mcp" as TreeItemType,
            name: source.type === "user" ? "~/.claude/mcp.json" : source.path.split("/").pop() || source.path,
            path: source.path,
            scope: (source.type === "project" ? "project" : "global") as SettingsScope,
            source: source.type,
          })) || []),
    },
    {
      id: "skills",
      label: "Skills",
      icon: FileText,
      expanded: expandedCategories.includes("skills"),
      items:
        (skills?.map((skill: SkillItem) => ({
          id: `skill-${skill.name}`,
          type: "skill" as TreeItemType,
          name: skill.name,
          path: skill.path,
          scope: (skill.source === "project" ? "project" : "global") as SettingsScope,
          source: skill.source,
        })) || []),
    },
    {
      id: "agents",
      label: "Agents",
      icon: Bot,
      expanded: expandedCategories.includes("agents"),
      items:
        (agents?.map((agent: AgentItem) => ({
          id: `agent-${agent.name}`,
          type: "agent" as TreeItemType,
          name: agent.name,
          path: agent.path,
          scope: (agent.source === "project" ? "project" : "global") as SettingsScope,
          source: agent.source,
        })) || []),
    },
    {
      id: "hooks",
      label: "Hooks",
      icon: Webhook,
      expanded: expandedCategories.includes("hooks"),
      items:
        (hooks?.map((hook: HookItem) => ({
          id: `hook-${hook.id}`,
          type: "hook" as TreeItemType,
          name: hook.name,
          scope: hook.scope as SettingsScope,
        })) || []),
    },
  ]

  const toggleCategory = (categoryId: string) => {
    setExpandedCategories((prev) =>
      prev.includes(categoryId) ? prev.filter((id) => id !== categoryId) : [...prev, categoryId]
    )
  }

  return (
    <div className="flex h-full flex-col p-6 space-y-4">
      {/* Header */}
      <div>
        <h3 className="text-sm font-semibold text-foreground">Claude Settings</h3>
        <p className="text-xs text-muted-foreground">
          Manage Skills, MCPs, Agents, and Hooks
        </p>
      </div>

      {/* Scope Toggle */}
      <div className="flex items-center gap-2">
        <label className="text-sm font-medium">Scope:</label>
        <div className="flex rounded-lg border border-border">
          <button
            onClick={() => setScope("global")}
            className={cn(
              "px-3 py-1 text-sm transition-colors rounded-l-lg",
              scope === "global"
                ? "bg-primary text-primary-foreground"
                : "hover:bg-muted"
            )}
          >
            Global
          </button>
          <button
            onClick={() => setScope("project")}
            className={cn(
              "px-3 py-1 text-sm transition-colors rounded-r-lg border-l border-border",
              scope === "project"
                ? "bg-primary text-primary-foreground"
                : "hover:bg-muted"
            )}
            disabled={!selectedProject}
          >
            Project
          </button>
        </div>
        {!selectedProject && scope === "project" && (
          <span className="text-xs text-muted-foreground">(Select a project first)</span>
        )}
      </div>

      {/* Tree View */}
      <div className="flex-1 overflow-hidden rounded-lg border border-border">
        <div className="h-full overflow-y-auto p-4">
          {categories.map((category) => (
            <div key={category.id} className="mb-2">
              <button
                onClick={() => toggleCategory(category.id)}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium hover:bg-muted"
              >
                {category.expanded ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
                <category.icon className="h-4 w-4" />
                {category.label}
                <span className="ml-auto text-xs text-muted-foreground">
                  {category.items.filter((item) =>
                    scope === "global" ? item.scope === "global" : item.scope === "project"
                  ).length}
                </span>
              </button>

              {category.expanded && (
                <div className="ml-6 mt-1 space-y-1">
                  {category.items
                    .filter((item) =>
                      scope === "global" ? item.scope === "global" : item.scope === "project"
                    )
                    .map((item) => (
                      <button
                        key={item.id}
                        onClick={() => setSelectedItem(item)}
                        className={cn(
                          "flex w-full items-center gap-2 rounded-md px-2 py-1 text-sm hover:bg-muted",
                          selectedItem?.id === item.id && "bg-muted"
                        )}
                      >
                        <FileText className="h-3 w-3" />
                        <span className="truncate">{item.name}</span>
                      </button>
                    ))}
                  {category.items.filter((item) =>
                    scope === "global" ? item.scope === "global" : item.scope === "project"
                  ).length === 0 && (
                    <div className="px-2 py-1 text-xs text-muted-foreground">
                      No {scope} {category.label.toLowerCase()} found
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Selected Item Display */}
      {selectedItem && (
        <div className="rounded-lg border border-border bg-muted/50 p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">{selectedItem.name}</span>
            <span className="text-xs text-muted-foreground capitalize">{selectedItem.scope}</span>
          </div>
          <div className="text-xs text-muted-foreground">
            Type: {selectedItem.type}
            {selectedItem.path && <div className="mt-1 truncate">Path: {selectedItem.path}</div>}
          </div>
          <div className="mt-3 text-xs text-yellow-600 dark:text-yellow-500">
            ⚠️ File viewer and scoped chat coming in next update
          </div>
        </div>
      )}
    </div>
  )
}
