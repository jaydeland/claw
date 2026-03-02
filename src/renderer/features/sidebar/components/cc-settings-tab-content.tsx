"use client"

import React, { useState } from "react"
import {
  Server,
  Settings2,
  ChevronDown,
  ChevronRight,
  LayoutDashboard,
  ShieldCheck,
  Webhook,
  TerminalSquare,
  Bot,
  Sparkles,
  Plug,
  Plus,
  AlertTriangle,
  CheckCircle,
  Network,
  Cpu,
} from "lucide-react"
import { useAtom, useAtomValue, useSetAtom } from "jotai"
import { cn } from "../../../lib/utils"
import { selectedSettingsCategoryAtom, selectedProjectAtom, type SettingsCategory } from "../../agents/atoms"
import { selectWorkflowItemAtom, selectedWorkflowCategoryAtom } from "../../workflows/atoms"
import { trpc } from "../../../lib/trpc"
import { AiAssistantDialog } from "../../../components/ai-assistant-dialog"
import { parseMcpConfig, MCP_GREETING, MCP_COMPLETION_PHRASES } from "../../mcp/ui/mcp-config-chat"

// ─── Settings sub-categories (static) ───────────────────────────────────────

const SETTINGS_SUB_CATEGORIES = [
  { id: "overview" as SettingsCategory, label: "Overview", icon: LayoutDashboard },
  { id: "permissions" as SettingsCategory, label: "Permissions", icon: ShieldCheck },
  { id: "hooks" as SettingsCategory, label: "Hooks", icon: Webhook },
  { id: "status-line" as SettingsCategory, label: "Status Line", icon: TerminalSquare },
]

// ─── Agents Section ──────────────────────────────────────────────────────────

function AgentsSection({ isExpanded }: { isExpanded: boolean }) {
  const selectedProject = useAtomValue(selectedProjectAtom)
  const selectWorkflowItem = useSetAtom(selectWorkflowItemAtom)
  const setSettingsCategory = useSetAtom(selectedSettingsCategoryAtom)

  const { data: agents = [], isLoading } = trpc.agents.list.useQuery(
    { cwd: selectedProject?.path },
    { enabled: isExpanded }
  )

  const handleClick = (agent: { name: string; path: string }) => {
    setSettingsCategory(null)
    selectWorkflowItem({
      node: { id: agent.name, name: agent.name, type: "agent", sourcePath: agent.path },
      category: "agents",
    })
  }

  if (!isExpanded) return null

  return (
    <div className="ml-[18px] pl-3 space-y-0.5 relative">
      <div className="absolute -left-3 top-0 bottom-0 w-px bg-muted-foreground/20" />
      {isLoading ? (
        <p className="text-[11px] text-muted-foreground/60 px-2 py-1 italic">Loading agents…</p>
      ) : agents.length === 0 ? (
        <div className="flex items-center gap-2 px-2 py-1.5 text-[11px] text-muted-foreground/60 italic">
          <Bot className="h-3 w-3 flex-shrink-0" />
          No agents found
        </div>
      ) : (
        agents.map((agent, idx) => {
          const isLast = idx === agents.length - 1
          return (
            <div key={agent.path} className="relative">
              <div className={cn("absolute -left-3 w-px bg-muted-foreground/20", isLast ? "top-0 h-1/2" : "top-0 bottom-0")} />
              <div className="absolute -left-3 top-1/2 w-2.5 h-px bg-muted-foreground/20" />
              <button
                type="button"
                onClick={() => handleClick(agent)}
                className="flex items-center gap-2 w-full px-2.5 py-1.5 rounded-md text-left transition-colors text-muted-foreground hover:text-foreground hover:bg-foreground/8"
              >
                <Bot className="h-3 w-3 flex-shrink-0" />
                <span className="text-xs font-medium truncate flex-1">{agent.name}</span>
                {agent.source === "project" && (
                  <div className="h-1.5 w-1.5 rounded-full bg-blue-500 flex-shrink-0" title="Project-specific" />
                )}
              </button>
            </div>
          )
        })
      )}
    </div>
  )
}

// ─── Skills Section ──────────────────────────────────────────────────────────

function SkillsSection({ isExpanded }: { isExpanded: boolean }) {
  const selectedProject = useAtomValue(selectedProjectAtom)
  const selectWorkflowItem = useSetAtom(selectWorkflowItemAtom)
  const setSettingsCategory = useSetAtom(selectedSettingsCategoryAtom)

  const { data: items = [], isLoading } = trpc.skills.listCombined.useQuery(
    { cwd: selectedProject?.path },
    { enabled: isExpanded }
  )

  const handleClick = (item: { name: string; path: string; type: "skill" | "command" }) => {
    setSettingsCategory(null)
    selectWorkflowItem({
      node: { id: item.name, name: item.name, type: item.type, sourcePath: item.path },
      category: "skills",
    })
  }

  if (!isExpanded) return null

  return (
    <div className="ml-[18px] pl-3 space-y-0.5 relative">
      <div className="absolute -left-3 top-0 bottom-0 w-px bg-muted-foreground/20" />
      {isLoading ? (
        <p className="text-[11px] text-muted-foreground/60 px-2 py-1 italic">Loading skills…</p>
      ) : items.length === 0 ? (
        <div className="flex items-center gap-2 px-2 py-1.5 text-[11px] text-muted-foreground/60 italic">
          <Sparkles className="h-3 w-3 flex-shrink-0" />
          No skills found
        </div>
      ) : (
        items.map((item, idx) => {
          const isLast = idx === items.length - 1
          return (
            <div key={item.path} className="relative">
              <div className={cn("absolute -left-3 w-px bg-muted-foreground/20", isLast ? "top-0 h-1/2" : "top-0 bottom-0")} />
              <div className="absolute -left-3 top-1/2 w-2.5 h-px bg-muted-foreground/20" />
              <button
                type="button"
                onClick={() => handleClick(item)}
                className="flex items-center gap-2 w-full px-2.5 py-1.5 rounded-md text-left transition-colors text-muted-foreground hover:text-foreground hover:bg-foreground/8"
              >
                <Sparkles className="h-3 w-3 flex-shrink-0" />
                <span className="text-xs font-medium truncate flex-1">{item.name}</span>
                {item.source === "project" && (
                  <div className="h-1.5 w-1.5 rounded-full bg-blue-500 flex-shrink-0" title="Project-specific" />
                )}
              </button>
            </div>
          )
        })
      )}
    </div>
  )
}

// ─── MCPs Section ────────────────────────────────────────────────────────────

function McpsSection({ isExpanded }: { isExpanded: boolean }) {
  const selectedProject = useAtomValue(selectedProjectAtom)
  const selectWorkflowItem = useSetAtom(selectWorkflowItemAtom)
  const setSettingsCategory = useSetAtom(selectedSettingsCategoryAtom)
  const [addDialogOpen, setAddDialogOpen] = useState(false)

  const { data: mcpServers, isLoading } = trpc.mcp.listServers.useQuery(
    { projectPath: selectedProject?.path },
    { enabled: isExpanded }
  )
  const utils = trpc.useUtils()

  const servers = mcpServers?.servers ?? []

  const handleClick = (server: { id: string; name: string }) => {
    setSettingsCategory(null)
    selectWorkflowItem({
      node: { id: server.id, name: server.name, type: "mcpServer", sourcePath: server.id },
      category: "mcps",
    })
  }

  if (!isExpanded) return null

  return (
    <>
      <div className="ml-[18px] pl-3 space-y-0.5 relative">
        <div className="absolute -left-3 top-0 bottom-0 w-px bg-muted-foreground/20" />

        {/* Add with AI button */}
        <div className="relative">
          <div className="absolute -left-3 w-px bg-muted-foreground/20 top-0 h-1/2" />
          <div className="absolute -left-3 top-1/2 w-2.5 h-px bg-muted-foreground/20" />
          <button
            type="button"
            onClick={() => setAddDialogOpen(true)}
            className="flex items-center gap-2 w-full px-2.5 py-1.5 rounded-md text-left transition-colors text-primary hover:bg-primary/8"
          >
            <Plus className="h-3 w-3 flex-shrink-0" />
            <span className="text-xs font-medium">Add with AI</span>
            <Sparkles className="h-3 w-3 flex-shrink-0 ml-auto" />
          </button>
        </div>

        {isLoading ? (
          <p className="text-[11px] text-muted-foreground/60 px-2 py-1 italic">Loading MCPs…</p>
        ) : servers.length === 0 ? (
          <div className="flex items-center gap-2 px-2 py-1.5 text-[11px] text-muted-foreground/60 italic">
            <Plug className="h-3 w-3 flex-shrink-0" />
            No MCP servers
          </div>
        ) : (
          servers.map((server, idx) => {
            const isLast = idx === servers.length - 1
            const isReady = server.authStatus === "no_auth_needed"
            const isConfigured = server.authStatus === "configured"
            const needsAuth = server.authStatus === "missing_credentials"

            return (
              <div key={server.id} className="relative">
                <div className={cn("absolute -left-3 w-px bg-muted-foreground/20", isLast ? "top-0 h-1/2" : "top-0 bottom-0")} />
                <div className="absolute -left-3 top-1/2 w-2.5 h-px bg-muted-foreground/20" />
                <button
                  type="button"
                  onClick={() => handleClick(server)}
                  className={cn(
                    "flex items-center gap-2 w-full px-2.5 py-1.5 rounded-md text-left transition-colors text-muted-foreground hover:text-foreground hover:bg-foreground/8",
                    !server.enabled && "opacity-50"
                  )}
                >
                  <Plug className="h-3 w-3 flex-shrink-0" />
                  <span className="text-xs font-medium truncate flex-1">{server.name}</span>
                  {needsAuth && <AlertTriangle className="h-3 w-3 text-amber-500 flex-shrink-0" />}
                  {(isReady || isConfigured) && <CheckCircle className="h-3 w-3 text-green-500/60 flex-shrink-0" />}
                </button>
              </div>
            )
          })
        )}
      </div>

      <AiAssistantDialog
        open={addDialogOpen}
        onClose={() => setAddDialogOpen(false)}
        title="Add MCP Server"
        description="Configure a new MCP server"
        icon={Sparkles}
        initialGreeting={MCP_GREETING}
        placeholder="Describe the MCP server you want to add..."
        hint="The AI will generate an MCP server configuration based on your description."
        resultParser={parseMcpConfig}
        completionPhrases={MCP_COMPLETION_PHRASES}
        onResultDetected={() => utils.mcp.listServers.invalidate()}
        onComplete={() => {
          setAddDialogOpen(false)
          utils.mcp.listServers.invalidate()
        }}
        completeMessage="Configuration complete"
      />
    </>
  )
}

// ─── Root ────────────────────────────────────────────────────────────────────

interface CcSettingsTabContentProps {
  className?: string
  isMobileFullscreen?: boolean
}

export function CcSettingsTabContent({ className }: CcSettingsTabContentProps) {
  const [selectedCategory, setSelectedCategory] = useAtom(selectedSettingsCategoryAtom)
  const setWorkflowCategory = useSetAtom(selectedWorkflowCategoryAtom)
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(["settings"])
  )

  const toggleSection = (sectionId: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev)
      if (next.has(sectionId)) {
        next.delete(sectionId)
      } else {
        next.add(sectionId)
      }
      return next
    })
  }

  const handleSettingsSubCatClick = (id: SettingsCategory) => {
    setSelectedCategory(id)
    // Clear workflow selection so the settings content area shows
    setWorkflowCategory(null)
  }

  const sections = [
    {
      id: "agents",
      label: "Agents",
      icon: Network,
      content: <AgentsSection isExpanded={expandedSections.has("agents")} />,
      countQuery: null as null,
    },
    {
      id: "skills",
      label: "Skills",
      icon: Cpu,
      content: <SkillsSection isExpanded={expandedSections.has("skills")} />,
    },
    {
      id: "mcps",
      label: "MCPs",
      icon: Server,
      content: <McpsSection isExpanded={expandedSections.has("mcps")} />,
    },
  ]

  return (
    <div className={cn("flex flex-col h-full", className)}>
      {/* Header */}
      <div className="px-3 py-2 border-b border-border/50 flex-shrink-0">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
          Claude Code
        </p>
      </div>

      {/* Category tree */}
      <div className="flex-1 overflow-y-auto p-1.5 scrollbar-thin scrollbar-thumb-muted-foreground/20 scrollbar-track-transparent">
        <div className="space-y-0.5">

          {/* Agents / Skills / MCPs — dynamic item lists */}
          {sections.map((section) => {
            const SectionIcon = section.icon
            const isExpanded = expandedSections.has(section.id)

            return (
              <div key={section.id} className="space-y-0.5">
                <button
                  type="button"
                  onClick={() => toggleSection(section.id)}
                  className="w-full flex items-center gap-1.5 pl-2 pr-2 py-1 rounded-md text-left hover:bg-foreground/5 transition-colors"
                >
                  {isExpanded ? (
                    <ChevronDown className="h-3 w-3 flex-shrink-0 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="h-3 w-3 flex-shrink-0 text-muted-foreground" />
                  )}
                  <SectionIcon className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
                  <span className="text-xs font-medium text-muted-foreground flex-1 truncate">
                    {section.label}
                  </span>
                </button>
                {section.content}
              </div>
            )
          })}

          {/* Settings — static sub-categories */}
          <div className="space-y-0.5">
            <button
              type="button"
              onClick={() => toggleSection("settings")}
              className="w-full flex items-center gap-1.5 pl-2 pr-2 py-1 rounded-md text-left hover:bg-foreground/5 transition-colors"
            >
              {expandedSections.has("settings") ? (
                <ChevronDown className="h-3 w-3 flex-shrink-0 text-muted-foreground" />
              ) : (
                <ChevronRight className="h-3 w-3 flex-shrink-0 text-muted-foreground" />
              )}
              <Settings2 className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
              <span className="text-xs font-medium text-muted-foreground flex-1 truncate">Settings</span>
              <span className="text-[10px] text-muted-foreground">{SETTINGS_SUB_CATEGORIES.length}</span>
            </button>

            {expandedSections.has("settings") && (
              <div className="ml-[18px] pl-3 space-y-0.5 relative">
                <div className="absolute -left-3 top-0 bottom-0 w-px bg-muted-foreground/20" />
                {SETTINGS_SUB_CATEGORIES.map((sub, idx) => {
                  const SubIcon = sub.icon
                  const isActive = selectedCategory === sub.id
                  const isLast = idx === SETTINGS_SUB_CATEGORIES.length - 1

                  return (
                    <div key={sub.id} className="relative">
                      <div
                        className={cn(
                          "absolute -left-3 w-px bg-muted-foreground/20",
                          isLast ? "top-0 h-1/2" : "top-0 bottom-0"
                        )}
                      />
                      <div className="absolute -left-3 top-1/2 w-2.5 h-px bg-muted-foreground/20" />
                      <button
                        type="button"
                        onClick={() => handleSettingsSubCatClick(sub.id)}
                        className={cn(
                          "flex items-center gap-2.5 w-full px-2.5 py-2 rounded-md text-left transition-colors",
                          isActive
                            ? "bg-primary/10 text-primary"
                            : "text-muted-foreground hover:text-foreground hover:bg-foreground/8"
                        )}
                      >
                        <SubIcon className="h-3.5 w-3.5 flex-shrink-0" />
                        <span className="text-xs font-medium truncate">{sub.label}</span>
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  )
}
