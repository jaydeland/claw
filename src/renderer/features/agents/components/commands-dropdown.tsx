"use client"

import { Terminal, ChevronRight } from "lucide-react"
import { trpc } from "../../../lib/trpc"
import { useAtom, useAtomValue } from "jotai"
import { selectedProjectAtom } from "../atoms"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
} from "../../../components/ui/dropdown-menu"
import { IconChevronDown, IconSpinner } from "../../../components/ui/icons"
import { useMemo } from "react"
import { cn } from "../../../lib/utils"
import { groupWorkflowsHierarchically } from "../../workflows/lib/parse-workflow-name"
import { commandsExpansionAtom } from "../../sidebar/atoms/workflow-expansion-atoms"

interface CommandsDropdownProps {
  onCommandSelect: (command: string) => void
  disabled?: boolean
}

export function CommandsDropdown({
  onCommandSelect,
  disabled = false,
}: CommandsDropdownProps) {
  const selectedProject = useAtomValue(selectedProjectAtom)
  const [expandedGroups, setExpandedGroups] = useAtom(commandsExpansionAtom)

  // Fetch commands using the commands router (same as commands-tab-content)
  const { data: commands = [], isLoading } = trpc.commands.list.useQuery(
    { projectPath: selectedProject?.path },
    {
      staleTime: 30_000, // Cache for 30 seconds
      refetchOnWindowFocus: false,
    }
  )

  // Group commands hierarchically (same as commands-tab-content)
  const hierarchicalGroups = useMemo(() => {
    return groupWorkflowsHierarchically(commands)
  }, [commands])

  // Toggle group expansion
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

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="flex items-center gap-1.5 px-2 py-1 text-sm text-muted-foreground hover:text-foreground transition-[background-color,color] duration-150 ease-out rounded-md hover:bg-muted/50 outline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring/70 disabled:opacity-50 disabled:cursor-not-allowed"
          disabled={disabled}
        >
          <Terminal className="h-3.5 w-3.5" />
          <span>Commands</span>
          <IconChevronDown className="h-3 w-3 shrink-0 opacity-50" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-[280px] max-h-[400px] overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center py-4">
            <IconSpinner className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : hierarchicalGroups.length === 0 ? (
          <div className="px-2 py-4 text-sm text-muted-foreground text-center">
            No commands found
          </div>
        ) : (
          <div className="py-1">
            {hierarchicalGroups.map((group) => {
              const isExpanded = expandedGroups.has(group.namespace)
              return (
                <div key={group.namespace} className="mb-1 last:mb-0">
                  {/* Namespace header */}
                  <button
                    onClick={() => toggleGroup(group.namespace)}
                    className={cn(
                      "w-full flex items-center gap-1 px-2 py-1.5 text-xs font-semibold",
                      "hover:bg-accent/50 transition-colors rounded-sm"
                    )}
                  >
                    <ChevronRight className={cn("h-3 w-3 transition-transform", isExpanded && "rotate-90")} />
                    <span>{group.namespace}</span>
                    <span className="text-[10px] opacity-60 ml-auto">({group.totalCount})</span>
                  </button>

                  {/* Namespace contents */}
                  {isExpanded && (
                    <div className="pl-2">
                      {/* Sub-groups */}
                      {group.subGroups.map((subGroup) => {
                        const subGroupKey = `${group.namespace}:${subGroup.name}`
                        const isSubExpanded = expandedGroups.has(subGroupKey)
                        return (
                          <div key={subGroupKey} className="mb-1">
                            {/* Sub-group header */}
                            <button
                              onClick={() => toggleGroup(subGroupKey)}
                              className={cn(
                                "w-full flex items-center gap-1 px-2 py-1 text-xs font-medium",
                                "hover:bg-accent/50 transition-colors rounded-sm"
                              )}
                            >
                              <ChevronRight className={cn("h-3 w-3 transition-transform", isSubExpanded && "rotate-90")} />
                              <span>{subGroup.name}</span>
                              <span className="text-[10px] opacity-60 ml-auto">({subGroup.items.length})</span>
                            </button>

                            {/* Sub-group items */}
                            {isSubExpanded && (
                              <div className="pl-2">
                                {subGroup.items.map((cmd) => (
                                  <button
                                    key={cmd.path}
                                    onClick={() => onCommandSelect(`/${cmd.name}`)}
                                    className={cn(
                                      "w-full flex items-center gap-1.5 px-2 py-1.5 text-xs",
                                      "hover:bg-accent transition-colors rounded-sm text-left"
                                    )}
                                  >
                                    <Terminal className="h-3 w-3 text-muted-foreground shrink-0" />
                                    <span className="flex-1 truncate">/{cmd.displayName}</span>
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        )
                      })}

                      {/* Flat items in namespace */}
                      {group.flatItems.map((cmd) => (
                        <button
                          key={cmd.path}
                          onClick={() => onCommandSelect(`/${cmd.name}`)}
                          className={cn(
                            "w-full flex items-center gap-1.5 px-2 py-1.5 text-xs",
                            "hover:bg-accent transition-colors rounded-sm text-left"
                          )}
                        >
                          <Terminal className="h-3 w-3 text-muted-foreground shrink-0" />
                          <span className="flex-1 truncate">/{cmd.displayName}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
