"use client"

import React, { useMemo, useState } from "react"
import { Terminal, ChevronRight } from "lucide-react"
import { cn } from "../../../lib/utils"
import { trpc } from "../../../lib/trpc"
import { Input } from "../../../components/ui/input"
import { selectedProjectAtom } from "../../agents/atoms"
import { selectWorkflowItemAtom } from "../../workflows/atoms"
import { useAtom, useAtomValue, useSetAtom } from "jotai"
import { groupWorkflowsHierarchically } from "../../workflows/lib/parse-workflow-name"
import { CollapsibleWorkflowGroup } from "./collapsible-workflow-group"
import { commandsExpansionAtom } from "../atoms/workflow-expansion-atoms"

interface CommandsTabContentProps {
  className?: string
  isMobileFullscreen?: boolean
}

type Command = {
  name: string
  path: string
  source: "user" | "project" | "custom"
  description?: string
}

export function CommandsTabContent({ className, isMobileFullscreen }: CommandsTabContentProps) {
  const [searchQuery, setSearchQuery] = useState("")
  const selectedProject = useAtomValue(selectedProjectAtom)
  const selectWorkflowItem = useSetAtom(selectWorkflowItemAtom)
  const [expandedGroups, setExpandedGroups] = useAtom(commandsExpansionAtom)

  // Fetch commands using tRPC
  const { data: commands, isLoading } = trpc.commands.list.useQuery({
    projectPath: selectedProject?.path,
  })

  // Filter commands by search query
  const filteredCommands = useMemo(() => {
    if (!commands) return []
    if (!searchQuery.trim()) return commands

    const query = searchQuery.toLowerCase()
    return commands.filter(
      (cmd) =>
        cmd.name.toLowerCase().includes(query) ||
        cmd.description?.toLowerCase().includes(query),
    )
  }, [commands, searchQuery])

  // Group commands hierarchically with sub-groups
  const hierarchicalGroups = useMemo(() => {
    return groupWorkflowsHierarchically(filteredCommands)
  }, [filteredCommands])

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

  // Render a single command item
  const renderCommandItem = (cmd: Command & { displayName: string }) => (
    <div
      key={cmd.path}
      onClick={() => {
        // Use combined action to set both category and node atomically
        selectWorkflowItem({
          node: {
            id: cmd.name,
            name: cmd.name,
            type: "command",
            sourcePath: cmd.path,
          },
          category: "commands",
        })
      }}
      className={cn(
        "group flex items-start gap-2 px-2 py-1 rounded-md cursor-pointer transition-colors",
        "hover:bg-foreground/5"
      )}
    >
      <Terminal className="h-3.5 w-3.5 flex-shrink-0 mt-0.5 text-muted-foreground" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-medium truncate text-foreground flex-1">
            {cmd.displayName}
          </span>
          {cmd.source === "project" && (
            <div className="h-1.5 w-1.5 rounded-full bg-blue-500 flex-shrink-0" title="Project-specific" />
          )}
        </div>
      </div>
      <ChevronRight className="h-3 w-3 flex-shrink-0 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground/50" />
    </div>
  )

  return (
    <div className={cn("flex flex-col h-full", className)}>
      {/* Search input */}
      <div className="px-2 pb-2 flex-shrink-0">
        <Input
          placeholder="Search commands..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className={cn(
            "w-full rounded-lg text-sm bg-muted border border-input placeholder:text-muted-foreground/40",
            isMobileFullscreen ? "h-10" : "h-7",
          )}
        />
      </div>

      {/* Commands list */}
      <div className="flex-1 overflow-y-auto px-2 scrollbar-thin scrollbar-thumb-muted-foreground/20 scrollbar-track-transparent">
        {isLoading ? (
          <div className="flex items-center justify-center h-20">
            <span className="text-sm text-muted-foreground">Loading commands...</span>
          </div>
        ) : filteredCommands.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-20 gap-2">
            <Terminal className="h-6 w-6 text-muted-foreground/50" />
            <span className="text-sm text-muted-foreground">
              {searchQuery ? "No commands found" : "No commands available"}
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
                      {subGroup.items.map(renderCommandItem)}
                    </CollapsibleWorkflowGroup>
                  )
                })}

                {/* Flat items (no sub-group) */}
                {nsGroup.flatItems.map(renderCommandItem)}
              </CollapsibleWorkflowGroup>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
