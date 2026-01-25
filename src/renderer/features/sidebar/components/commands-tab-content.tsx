"use client"

import React, { useMemo, useState } from "react"
import { Terminal, ChevronRight } from "lucide-react"
import { cn } from "../../../lib/utils"
import { trpc } from "../../../lib/trpc"
import { Input } from "../../../components/ui/input"
import { selectedProjectAtom } from "../../agents/atoms"
import { selectWorkflowItemAtom } from "../../workflows/atoms"
import { useAtom, useAtomValue, useSetAtom } from "jotai"
import { groupWorkflowsByNamespace } from "../../workflows/lib/parse-workflow-name"
import { CollapsibleWorkflowGroup } from "./collapsible-workflow-group"
import { commandsExpansionAtom } from "../atoms/workflow-expansion-atoms"

interface CommandsTabContentProps {
  className?: string
  isMobileFullscreen?: boolean
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

  // Group commands by namespace
  const groupedCommands = useMemo(() => {
    return groupWorkflowsByNamespace(filteredCommands)
  }, [filteredCommands])

  // Toggle group expansion
  const toggleGroup = (namespace: string) => {
    setExpandedGroups((prev) => {
      const newSet = new Set(prev)
      if (newSet.has(namespace)) {
        newSet.delete(namespace)
      } else {
        newSet.add(namespace)
      }
      return newSet
    })
  }

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
            {Object.entries(groupedCommands).map(([namespace, cmds]) => (
              <CollapsibleWorkflowGroup
                key={namespace}
                title={namespace}
                count={cmds.length}
                expanded={expandedGroups.has(namespace)}
                onToggle={() => toggleGroup(namespace)}
              >
                {cmds.map((cmd) => (
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
                          /{cmd.name}
                        </span>
                        {cmd.source === "project" && (
                          <div className="h-1.5 w-1.5 rounded-full bg-blue-500 flex-shrink-0" title="Project-specific" />
                        )}
                      </div>
                    </div>
                    <ChevronRight className="h-3 w-3 flex-shrink-0 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground/50" />
                  </div>
                ))}
              </CollapsibleWorkflowGroup>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
