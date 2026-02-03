"use client"

import { Terminal } from "lucide-react"
import { trpc } from "../../../lib/trpc"
import { useAtomValue } from "jotai"
import { selectedProjectAtom } from "../atoms"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuPortal,
} from "../../../components/ui/dropdown-menu"
import { IconChevronDown, IconSpinner } from "../../../components/ui/icons"
import { useMemo } from "react"
import { groupWorkflowsHierarchically } from "../../workflows/lib/parse-workflow-name"

interface CommandsDropdownProps {
  onCommandSelect: (command: string) => void
  disabled?: boolean
}

export function CommandsDropdown({
  onCommandSelect,
  disabled = false,
}: CommandsDropdownProps) {
  const selectedProject = useAtomValue(selectedProjectAtom)

  // Fetch commands using the commands router (same as commands-tab-content)
  const { data: commands = [], isLoading } = trpc.commands.list.useQuery(
    { projectPath: selectedProject?.path },
    {
      staleTime: 30_000, // Cache for 30 seconds
      refetchOnWindowFocus: false,
    }
  )

  // Filter out GSD-related commands (those with gsd: prefix in their name)
  // These should only appear in the GSD dropdown
  const nonGsdCommands = useMemo(() => {
    return commands.filter((cmd) => !cmd.name.startsWith("gsd:"))
  }, [commands])

  // Group commands hierarchically (same as commands-tab-content)
  const hierarchicalGroups = useMemo(() => {
    return groupWorkflowsHierarchically(nonGsdCommands)
  }, [nonGsdCommands])

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="flex items-center gap-1 px-1.5 py-1 text-xs text-muted-foreground hover:text-foreground transition-[background-color,color] duration-150 ease-out rounded-md hover:bg-muted/50 outline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring/70 disabled:opacity-50 disabled:cursor-not-allowed"
          disabled={disabled}
        >
          <span>Commands</span>
          <span className="text-[10px] opacity-70">({nonGsdCommands.length})</span>
          <IconChevronDown className="h-3 w-3 shrink-0 opacity-50" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-[220px]">
        {isLoading ? (
          <div className="flex items-center justify-center py-4">
            <IconSpinner className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : hierarchicalGroups.length === 0 ? (
          <div className="px-2 py-4 text-sm text-muted-foreground text-center">
            No commands found
          </div>
        ) : (
          <>
            {hierarchicalGroups.map((group) => (
              <DropdownMenuSub key={group.namespace}>
                <DropdownMenuSubTrigger className="flex items-center gap-2">
                  <span className="flex-1">{group.namespace}</span>
                  <span className="text-[10px] text-muted-foreground">
                    ({group.totalCount})
                  </span>
                </DropdownMenuSubTrigger>
                <DropdownMenuPortal>
                  <DropdownMenuSubContent className="w-[220px] max-h-[400px] overflow-y-auto">
                    {/* Sub-groups as nested submenus */}
                    {group.subGroups.map((subGroup) => (
                      <DropdownMenuSub key={`${group.namespace}:${subGroup.name}`}>
                        <DropdownMenuSubTrigger className="flex items-center gap-2">
                          <span className="flex-1">{subGroup.name}</span>
                          <span className="text-[10px] text-muted-foreground">
                            ({subGroup.items.length})
                          </span>
                        </DropdownMenuSubTrigger>
                        <DropdownMenuPortal>
                          <DropdownMenuSubContent className="w-[200px] max-h-[300px] overflow-y-auto">
                            {subGroup.items.map((cmd) => (
                              <DropdownMenuItem
                                key={cmd.path}
                                onClick={() => onCommandSelect(`/${cmd.name}`)}
                                className="flex items-center gap-2"
                              >
                                <Terminal className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                <span className="truncate">{cmd.displayName}</span>
                              </DropdownMenuItem>
                            ))}
                          </DropdownMenuSubContent>
                        </DropdownMenuPortal>
                      </DropdownMenuSub>
                    ))}

                    {/* Flat items directly in the namespace submenu */}
                    {group.flatItems.map((cmd) => (
                      <DropdownMenuItem
                        key={cmd.path}
                        onClick={() => onCommandSelect(`/${cmd.name}`)}
                        className="flex items-center gap-2"
                      >
                        <Terminal className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <span className="truncate">{cmd.displayName}</span>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuSubContent>
                </DropdownMenuPortal>
              </DropdownMenuSub>
            ))}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
