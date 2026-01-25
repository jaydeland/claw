"use client"

import { useMemo, useState, useEffect, useRef } from "react"
import { useAtom, useAtomValue, useSetAtom } from "jotai"
import { Search, Loader2 } from "lucide-react"
import { trpc } from "../../../lib/trpc"
import {
  selectedWorkflowCategoryAtom,
  selectedWorkflowNodeAtom,
  workflowFileListSearchAtom,
  workflowContentPathAtom,
} from "../atoms"
import { cn } from "../../../lib/utils"
import { Input } from "../../../components/ui/input"

/**
 * File list sidebar for workflows
 * Shows filtered list of agents, commands, or skills based on selected category
 */
export function WorkflowFileList() {
  const selectedCategory = useAtomValue(selectedWorkflowCategoryAtom)
  const [selectedNode, setSelectedNode] = useAtom(selectedWorkflowNodeAtom)
  const [searchQuery, setSearchQuery] = useAtom(workflowFileListSearchAtom)
  const setWorkflowContentPath = useSetAtom(workflowContentPathAtom)
  const searchInputRef = useRef<HTMLInputElement>(null)

  // Fetch workflow data with retry and stale time
  const { data, isLoading, error } = trpc.workflows.getWorkflowGraph.useQuery(undefined, {
    retry: 1,
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: false,
  })

  // Debug logging
  useEffect(() => {
    console.log("[workflow-file-list] Component mounted, category:", selectedCategory)
    console.log("[workflow-file-list] isLoading:", isLoading, "hasData:", !!data, "error:", error)
    if (data) {
      console.log("[workflow-file-list] Data:", {
        agents: data.agents?.length,
        commands: data.commands?.length,
        skills: data.skills?.length,
      })
    }
  }, [selectedCategory, isLoading, data, error])

  // Filter files by category and search query
  const files = useMemo(() => {
    if (!data || !selectedCategory) return []

    let items: any[] = []

    if (selectedCategory === "agents") {
      items = data.agents.map(agent => ({
        id: agent.id,
        name: agent.name,
        description: agent.description,
        sourcePath: agent.sourcePath,
        type: "agent" as const,
      }))
    } else if (selectedCategory === "commands") {
      items = data.commands.map(cmd => ({
        id: cmd.id,
        name: cmd.name,
        description: cmd.description,
        sourcePath: cmd.sourcePath,
        type: "command" as const,
      }))
    } else if (selectedCategory === "skills") {
      items = data.skills.map(skill => ({
        id: skill.id,
        name: skill.name,
        description: skill.description,
        sourcePath: skill.sourcePath,
        type: "skill" as const,
      }))
    }

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      items = items.filter(
        item =>
          item.name.toLowerCase().includes(query) ||
          item.description?.toLowerCase().includes(query)
      )
    }

    return items
  }, [data, selectedCategory, searchQuery])

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

  const handleFileClick = (file: any) => {
    setSelectedNode({
      type: file.type,
      id: file.id,
      name: file.name,
      sourcePath: file.sourcePath,
    })
    setWorkflowContentPath(file.sourcePath)
  }

  // Get display label for category (agents -> subagents)
  const categoryLabel = selectedCategory === "agents" ? "Subagents" : selectedCategory

  return (
    <div className="flex flex-col h-full">
      {/* Header with search */}
      <div className="p-3 border-b space-y-3">
        <h3
          className="text-sm font-semibold capitalize"
          title={selectedCategory === "agents" ? "Subagents (formerly called agents)" : undefined}
        >
          {categoryLabel || "Workflows"}
        </h3>

        {/* Search Input */}
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            ref={searchInputRef}
            type="text"
            placeholder="Search..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="pl-9 h-9 text-sm"
          />
        </div>
      </div>

      {/* File List */}
      <div className="flex-1 overflow-y-auto">
        {error ? (
          <div className="p-4 text-center text-sm text-destructive">
            Error loading workflows: {error.message}
          </div>
        ) : isLoading ? (
          <div className="flex items-center justify-center h-32">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : files.length === 0 ? (
          <div className="p-4 text-center text-sm text-muted-foreground">
            {searchQuery ? "No results found" : `No ${selectedCategory} found`}
          </div>
        ) : (
          <div className="py-1">
            {files.map(file => (
              <button
                key={file.id}
                onClick={() => handleFileClick(file)}
                className={cn(
                  "flex flex-col items-start w-full px-3 py-2 text-left transition-colors",
                  selectedNode?.id === file.id
                    ? "bg-accent text-accent-foreground"
                    : "hover:bg-muted/50"
                )}
              >
                <div className="text-sm font-medium truncate w-full">
                  {file.name}
                </div>
                {file.description && (
                  <div className="text-xs text-muted-foreground truncate w-full mt-0.5">
                    {file.description}
                  </div>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
