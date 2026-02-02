"use client"

import { useState } from "react"
import { useAtom } from "jotai"
import { FolderGit2, Loader2 } from "lucide-react"
import { Button } from "../../../../components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "../../../../components/ui/popover"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "../../../../components/ui/command"
import { Checkbox } from "../../../../components/ui/checkbox"
import { trpc } from "../../../../lib/trpc"
import {
  conductorSelectedWorkspaceIdsAtom,
  gsdImportDialogOpenAtom,
} from "../../atoms"
import { cn } from "../../../../lib/utils"

interface WorkspaceSelectorProps {
  className?: string
}

/**
 * Multi-select workspace dropdown for GSD import
 *
 * Shows all projects with .planning/ directories and allows
 * selecting multiple workspaces to import GSD phases from.
 */
export function WorkspaceSelector({ className }: WorkspaceSelectorProps) {
  const [selectedIds, setSelectedIds] = useAtom(conductorSelectedWorkspaceIdsAtom)
  const [importDialogOpen, setImportDialogOpen] = useAtom(gsdImportDialogOpenAtom)
  const [popoverOpen, setPopoverOpen] = useState(false)

  const { data: projects, isLoading: projectsLoading } = trpc.projects.list.useQuery()
  const { data: gsdStatus, isLoading: statusLoading } = trpc.gsd.getGsdStatusBatch.useQuery(
    {
      projectIds: projects?.map((p) => p.id) || [],
    },
    { enabled: !!projects && projects.length > 0 }
  )

  const toggleWorkspace = (projectId: string) => {
    setSelectedIds((prev) =>
      prev.includes(projectId) ? prev.filter((id) => id !== projectId) : [...prev, projectId]
    )
  }

  const selectAll = () => {
    const allGsdProjectIds = projectsWithGsd.map((p) => p.id)
    setSelectedIds(allGsdProjectIds)
  }

  const clearAll = () => {
    setSelectedIds([])
  }

  // Filter to only projects with .planning/ directory
  const projectsWithGsd =
    projects?.filter((p) => gsdStatus?.[p.id]?.hasPlanningDir) || []

  const selectedCount = selectedIds.length
  const isLoading = projectsLoading || statusLoading

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            disabled={isLoading}
          >
            {isLoading ? (
              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
            ) : (
              <FolderGit2 className="h-3 w-3 mr-1" />
            )}
            Workspaces
            {selectedCount > 0 && (
              <span className="ml-1 px-1.5 py-0.5 rounded-full bg-primary/20 text-primary text-[10px]">
                {selectedCount}
              </span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80 p-0" align="end">
          <Command>
            <CommandInput placeholder="Search workspaces..." />
            <CommandList>
              <CommandEmpty>
                {isLoading ? "Loading workspaces..." : "No workspaces with GSD found."}
              </CommandEmpty>
              <CommandGroup>
                {projectsWithGsd.map((project) => {
                  const status = gsdStatus?.[project.id]
                  const isSelected = selectedIds.includes(project.id)

                  return (
                    <CommandItem
                      key={project.id}
                      onSelect={() => toggleWorkspace(project.id)}
                      className="cursor-pointer"
                    >
                      <Checkbox checked={isSelected} className="mr-2 pointer-events-none" />
                      <div className="flex-1">
                        <div className="text-sm font-medium">{project.name}</div>
                        {status && (
                          <div className="text-xs text-muted-foreground">
                            {status.phaseCount} phases
                            {status.inProgressCount > 0 &&
                              ` • ${status.inProgressCount} in progress`}
                          </div>
                        )}
                      </div>
                    </CommandItem>
                  )
                })}
              </CommandGroup>
            </CommandList>
            <div className="border-t p-2 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={clearAll}
                  disabled={selectedCount === 0}
                  className="h-7 text-xs"
                >
                  Clear All
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={selectAll}
                  disabled={projectsWithGsd.length === 0}
                  className="h-7 text-xs"
                >
                  Select All
                </Button>
              </div>
              <Button
                size="sm"
                onClick={() => {
                  setPopoverOpen(false)
                  setImportDialogOpen(true)
                }}
                disabled={selectedCount === 0}
                className="h-7 text-xs"
              >
                Import
              </Button>
            </div>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  )
}
