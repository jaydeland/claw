"use client"

import React, { useMemo, useState } from "react"
import { Bot, ChevronRight } from "lucide-react"
import { cn } from "../../../lib/utils"
import { trpc } from "../../../lib/trpc"
import { Input } from "../../../components/ui/input"
import { selectedProjectAtom } from "../../agents/atoms"
import { useAtom, useAtomValue, useSetAtom } from "jotai"
import { selectWorkflowItemAtom } from "../../workflows/atoms"
import { groupWorkflowsHierarchically } from "../../workflows/lib/parse-workflow-name"
import { CollapsibleWorkflowGroup } from "./collapsible-workflow-group"
import { agentsExpansionAtom } from "../atoms/workflow-expansion-atoms"

interface AgentsTabContentProps {
  className?: string
  isMobileFullscreen?: boolean
}

type Agent = {
  name: string
  path: string
  source: "user" | "project" | "custom"
  description?: string
  model?: string
}

export function AgentsTabContent({ className, isMobileFullscreen }: AgentsTabContentProps) {
  const [searchQuery, setSearchQuery] = useState("")
  const selectedProject = useAtomValue(selectedProjectAtom)
  const selectWorkflowItem = useSetAtom(selectWorkflowItemAtom)
  const [expandedGroups, setExpandedGroups] = useAtom(agentsExpansionAtom)

  // Fetch agents using tRPC
  const { data: agents, isLoading } = trpc.agents.list.useQuery({
    cwd: selectedProject?.path,
  })

  // Handle agent click - switches to full-screen workflows view with agent selected
  const handleAgentClick = (agent: Agent) => {
    // Use combined action to set both category and node atomically
    selectWorkflowItem({
      node: {
        id: agent.name,
        name: agent.name,
        type: "agent",
        sourcePath: agent.path,
      },
      category: "agents",
    })
  }

  // Filter agents by search query
  const filteredAgents = useMemo(() => {
    if (!agents) return []
    if (!searchQuery.trim()) return agents

    const query = searchQuery.toLowerCase()
    return agents.filter(
      (agent) =>
        agent.name.toLowerCase().includes(query) ||
        agent.description?.toLowerCase().includes(query),
    )
  }, [agents, searchQuery])

  // Group agents hierarchically with sub-groups
  const hierarchicalGroups = useMemo(() => {
    return groupWorkflowsHierarchically(filteredAgents)
  }, [filteredAgents])

  // Toggle group expansion (supports both namespaces and sub-groups)
  const toggleGroup = (key: string) => {
    setExpandedGroups((prev) => {
      const newSet = new Set(prev)
      if (newSet.has(key)) {
        newSet.delete(key)
      } else {
        newSet.add(key)
      }
      return newSet
    })
  }

  // Render a single agent item
  const renderAgentItem = (agent: Agent & { displayName: string }) => (
    <button
      key={agent.path}
      onClick={() => handleAgentClick(agent)}
      className="group flex items-start gap-2 px-2 py-1 rounded-md hover:bg-foreground/5 cursor-pointer w-full text-left"
    >
      <Bot className="h-3.5 w-3.5 flex-shrink-0 mt-0.5 text-muted-foreground" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-medium text-foreground truncate flex-1">
            {agent.displayName}
          </span>
          {agent.source === "project" && (
            <div className="h-1.5 w-1.5 rounded-full bg-blue-500 flex-shrink-0" title="Project-specific" />
          )}
        </div>
        {agent.model && (
          <p className="text-[10px] text-muted-foreground/70 truncate mt-0.5">
            Model: {agent.model}
          </p>
        )}
      </div>
      <ChevronRight className="h-3 w-3 text-muted-foreground/50 flex-shrink-0 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity" />
    </button>
  )

  return (
    <div className={cn("flex flex-col h-full", className)}>
      {/* Search input */}
      <div className="px-2 pb-2 flex-shrink-0">
        <Input
          placeholder="Search agents..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className={cn(
            "w-full rounded-lg text-sm bg-muted border border-input placeholder:text-muted-foreground/40",
            isMobileFullscreen ? "h-10" : "h-7",
          )}
        />
      </div>

      {/* Agents list */}
      <div className="flex-1 overflow-y-auto px-2 scrollbar-thin scrollbar-thumb-muted-foreground/20 scrollbar-track-transparent">
        {isLoading ? (
          <div className="flex items-center justify-center h-20">
            <span className="text-sm text-muted-foreground">Loading agents...</span>
          </div>
        ) : filteredAgents.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-20 gap-2">
            <Bot className="h-6 w-6 text-muted-foreground/50" />
            <span className="text-sm text-muted-foreground">
              {searchQuery ? "No agents found" : "No agents available"}
            </span>
          </div>
        ) : (
          <div className="space-y-1">
            {hierarchicalGroups.map((nsGroup) => (
              <CollapsibleWorkflowGroup
                key={nsGroup.namespace}
                title={nsGroup.namespace}
                count={nsGroup.totalCount}
                expanded={expandedGroups.has(nsGroup.namespace)}
                onToggle={() => toggleGroup(nsGroup.namespace)}
              >
                {/* Sub-groups (if any) */}
                {nsGroup.subGroups.map((subGroup) => {
                  const subGroupKey = `${nsGroup.namespace}:${subGroup.name}`
                  return (
                    <CollapsibleWorkflowGroup
                      key={subGroupKey}
                      title={subGroup.name}
                      count={subGroup.items.length}
                      expanded={expandedGroups.has(subGroupKey)}
                      onToggle={() => toggleGroup(subGroupKey)}
                      nested
                    >
                      {subGroup.items.map(renderAgentItem)}
                    </CollapsibleWorkflowGroup>
                  )
                })}

                {/* Flat items (no sub-group) */}
                {nsGroup.flatItems.map(renderAgentItem)}
              </CollapsibleWorkflowGroup>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
