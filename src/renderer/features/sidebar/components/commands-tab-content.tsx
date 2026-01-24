"use client"

import React, { useMemo, useState } from "react"
import { Terminal, ChevronRight } from "lucide-react"
import { cn } from "../../../lib/utils"
import { trpc } from "../../../lib/trpc"
import { Input } from "../../../components/ui/input"
import { selectedProjectAtom } from "../../agents/atoms"
import { useAtomValue } from "jotai"

interface CommandsTabContentProps {
  className?: string
  isMobileFullscreen?: boolean
}

/**
 * Badge component to show the source of a command
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

export function CommandsTabContent({ className, isMobileFullscreen }: CommandsTabContentProps) {
  const [searchQuery, setSearchQuery] = useState("")
  const selectedProject = useAtomValue(selectedProjectAtom)

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

  // Group commands by namespace (prefix before colon)
  const groupedCommands = useMemo(() => {
    const groups: Record<string, typeof filteredCommands> = {}

    for (const cmd of filteredCommands) {
      const colonIndex = cmd.name.indexOf(":")
      const namespace = colonIndex > 0 ? cmd.name.slice(0, colonIndex) : "General"

      if (!groups[namespace]) {
        groups[namespace] = []
      }
      groups[namespace].push(cmd)
    }

    return groups
  }, [filteredCommands])

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
          Object.entries(groupedCommands).map(([namespace, cmds]) => (
            <div key={namespace} className="mb-3">
              <div className="flex items-center h-4 mb-1 px-1">
                <h3 className="text-xs font-medium text-muted-foreground whitespace-nowrap">
                  {namespace}
                </h3>
              </div>
              <div className="space-y-0.5">
                {cmds.map((cmd) => (
                  <div
                    key={cmd.path}
                    className="group flex items-start gap-2 px-2 py-1.5 rounded-md hover:bg-foreground/5 cursor-default"
                  >
                    <Terminal className="h-4 w-4 flex-shrink-0 mt-0.5 text-muted-foreground" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-foreground truncate">
                          /{cmd.name}
                        </span>
                        <SourceBadge source={cmd.source} />
                      </div>
                      {cmd.description && (
                        <p className="text-xs text-muted-foreground truncate mt-0.5">
                          {cmd.description}
                        </p>
                      )}
                    </div>
                    <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/50 flex-shrink-0 mt-1 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
