"use client"

import { useMemo, useEffect, useRef } from "react"
import { useAtom, useAtomValue, useSetAtom } from "jotai"
import { Search, Loader2, Terminal, Bot, Sparkles } from "lucide-react"
import { trpc } from "../../../lib/trpc"
import {
  selectedWorkflowCategoryAtom,
  selectedWorkflowNodeAtom,
  workflowFileListSearchAtom,
  workflowContentPathAtom,
  type WorkflowNodeType,
} from "../atoms"
import { selectedProjectAtom } from "../../agents/atoms"
import { cn } from "../../../lib/utils"
import { Input } from "../../../components/ui/input"

/**
 * Badge component to show the source of an item
 */
function SourceBadge({ source }: { source: "user" | "project" | "custom" }) {
  const colors = {
    project: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
    user: "bg-green-500/10 text-green-600 dark:text-green-400",
    custom: "bg-purple-500/10 text-purple-600 dark:text-purple-400",
  }

  return (
    <span
      className={cn(
        "text-[10px] px-1.5 py-0.5 rounded-sm font-medium uppercase tracking-wide",
        colors[source],
      )}
    >
      {source}
    </span>
  )
}

/**
 * Get the appropriate icon for a workflow type
 */
function TypeIcon({ type }: { type: WorkflowNodeType }) {
  switch (type) {
    case "command":
      return <Terminal className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
    case "agent":
      return <Bot className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
    case "skill":
      return <Sparkles className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
    default:
      return <Terminal className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
  }
}

/**
 * Item interface for unified handling
 */
interface WorkflowItem {
  id: string
  name: string
  description: string
  source: "user" | "project" | "custom"
  sourcePath: string
  type: WorkflowNodeType
}

/**
 * Group header labels by category
 */
function getGroupLabel(source: "user" | "project" | "custom", category: "agents" | "commands" | "skills" | "mcps"): string {
  const categoryLabel = category === "agents" ? "Agents"
    : category === "commands" ? "Commands"
    : category === "skills" ? "Skills"
    : "MCPs"
  const sourceLabel = source === "project" ? "Project" : source === "user" ? "User" : "Custom"
  return `${sourceLabel} ${categoryLabel}`
}

/**
 * Flat file list for workflows
 * Shows items grouped by source (project, user, custom)
 * Filters by selected category (agents, commands, skills, mcps)
 */
export function WorkflowFlatFileList() {
  const selectedCategory = useAtomValue(selectedWorkflowCategoryAtom)
  const selectedProject = useAtomValue(selectedProjectAtom)
  const [selectedNode, setSelectedNode] = useAtom(selectedWorkflowNodeAtom)
  const [searchQuery, setSearchQuery] = useAtom(workflowFileListSearchAtom)
  const setWorkflowContentPath = useSetAtom(workflowContentPathAtom)
  const searchInputRef = useRef<HTMLInputElement>(null)

  // Fetch workflow data with project path for project-level items
  const { data: workflowGraph, isLoading, error } = trpc.workflows.getWorkflowGraph.useQuery(
    { projectPath: selectedProject?.path },
    {
      retry: 1,
      staleTime: 5 * 60 * 1000, // 5 minutes
      refetchOnWindowFocus: false,
    }
  )

  // Debug logging
  useEffect(() => {
    console.log("[workflow-flat-file-list] Component mounted")
    console.log("[workflow-flat-file-list] category:", selectedCategory)
    console.log("[workflow-flat-file-list] selectedNode:", selectedNode)
    console.log("[workflow-flat-file-list] isLoading:", isLoading, "hasData:", !!workflowGraph, "error:", error)
    if (workflowGraph) {
      console.log("[workflow-flat-file-list] Data:", {
        agents: workflowGraph.agents?.length,
        commands: workflowGraph.commands?.length,
        skills: workflowGraph.skills?.length,
      })
    }
  }, [selectedCategory, selectedNode, isLoading, workflowGraph, error])

  // Transform items based on selected category
  const items = useMemo((): WorkflowItem[] => {
    if (!workflowGraph || !selectedCategory) return []

    if (selectedCategory === "commands") {
      return workflowGraph.commands.map(cmd => ({
        id: cmd.id,
        name: cmd.name,
        description: cmd.description || "",
        source: cmd.source,
        sourcePath: cmd.sourcePath,
        type: "command" as const,
      }))
    } else if (selectedCategory === "agents") {
      return workflowGraph.agents.map(agent => ({
        id: agent.id,
        name: agent.name,
        description: agent.description || "",
        source: agent.source,
        sourcePath: agent.sourcePath,
        type: "agent" as const,
      }))
    } else if (selectedCategory === "skills") {
      return workflowGraph.skills.map(skill => ({
        id: skill.id,
        name: skill.name,
        description: skill.description || "",
        source: skill.source,
        sourcePath: skill.sourcePath,
        type: "skill" as const,
      }))
    }

    return []
  }, [workflowGraph, selectedCategory])

  // Filter items by search query
  const filteredItems = useMemo(() => {
    if (!searchQuery.trim()) return items

    const query = searchQuery.toLowerCase()
    return items.filter(
      item =>
        item.name.toLowerCase().includes(query) ||
        item.description.toLowerCase().includes(query)
    )
  }, [items, searchQuery])

  // Group items by source (project first, then user, then custom)
  const groupedItems = useMemo(() => {
    const groups: Record<"project" | "user" | "custom", WorkflowItem[]> = {
      project: [],
      user: [],
      custom: [],
    }

    for (const item of filteredItems) {
      groups[item.source].push(item)
    }

    // Return in priority order: project, user, custom
    return groups
  }, [filteredItems])

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd+F or Ctrl+F to focus search
      if ((e.metaKey || e.ctrlKey) && e.key === "f") {
        e.preventDefault()
        searchInputRef.current?.focus()
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [])

  // Clear search when category changes
  useEffect(() => {
    setSearchQuery("")
  }, [selectedCategory, setSearchQuery])

  const handleItemClick = (item: WorkflowItem) => {
    setSelectedNode({
      type: item.type,
      id: item.id,
      name: item.name,
      sourcePath: item.sourcePath,
    })
    setWorkflowContentPath(item.sourcePath)
  }

  // Get category label for header
  const categoryLabel = selectedCategory === "agents"
    ? "Agents"
    : selectedCategory === "commands"
    ? "Commands"
    : selectedCategory === "skills"
    ? "Skills"
    : "Workflows"

  // Check if any groups have items
  const hasAnyItems = groupedItems.project.length > 0 ||
                      groupedItems.user.length > 0 ||
                      groupedItems.custom.length > 0

  return (
    <div className="flex flex-col h-full">
      {/* Header with search */}
      <div className="p-3 border-b space-y-3">
        <h3 className="text-sm font-semibold">{categoryLabel}</h3>

        {/* Search Input */}
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            ref={searchInputRef}
            type="text"
            placeholder={`Search ${categoryLabel.toLowerCase()}...`}
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="pl-9 h-9 text-sm"
          />
        </div>
      </div>

      {/* Item List */}
      <div className="flex-1 overflow-y-auto">
        {error ? (
          <div className="p-4 text-center text-sm text-destructive">
            Error loading {categoryLabel.toLowerCase()}: {error.message}
          </div>
        ) : isLoading ? (
          <div className="flex items-center justify-center h-32">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : !hasAnyItems ? (
          <div className="p-4 text-center text-sm text-muted-foreground">
            {searchQuery ? "No results found" : `No ${categoryLabel.toLowerCase()} found`}
          </div>
        ) : (
          <div className="py-1">
            {/* Render groups in priority order: project, user, custom */}
            {(["project", "user", "custom"] as const).map(source => {
              const sourceItems = groupedItems[source]
              if (sourceItems.length === 0) return null

              return (
                <div key={source} className="mb-3">
                  {/* Group Header */}
                  <div className="flex items-center h-6 mb-1 px-3">
                    <h4 className="text-xs font-medium text-muted-foreground">
                      {selectedCategory && getGroupLabel(source, selectedCategory)}
                    </h4>
                  </div>

                  {/* Items */}
                  {sourceItems.map(item => (
                    <button
                      key={`${item.source}-${item.id}`}
                      onClick={() => handleItemClick(item)}
                      className={cn(
                        "flex flex-col items-start w-full px-3 py-2 text-left transition-colors",
                        selectedNode?.sourcePath === item.sourcePath
                          ? "bg-accent text-accent-foreground"
                          : "hover:bg-foreground/5"
                      )}
                    >
                      <div className="flex items-center gap-2 w-full">
                        <TypeIcon type={item.type} />
                        <span className="text-sm font-medium truncate flex-1">
                          {item.type === "command" ? `/${item.name}` : item.name}
                        </span>
                        <SourceBadge source={item.source} />
                      </div>
                      {item.description && (
                        <div className="text-xs text-muted-foreground truncate w-full mt-0.5 pl-6">
                          {item.description}
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
