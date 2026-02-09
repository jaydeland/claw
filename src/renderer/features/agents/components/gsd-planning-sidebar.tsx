"use client"

import { useCallback, useEffect } from "react"
import { useAtom, useAtomValue, useSetAtom } from "jotai"
import { ResizableSidebar } from "@/components/ui/resizable-sidebar"
import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { DialogIcons, DialogIconSizes } from "@/lib/dialog-icons"
import { GsdPlanningRightPanel } from "../../gsd/ui/gsd-planning-right-panel"
import {
  gsdDisplayModeAtom,
  gsdChatSidebarOpenAtom,
  gsdChatSidebarOpenRuntimeAtom,
  gsdSidebarWidthAtom,
  selectedProjectAtom,
} from "../atoms"
import { selectedGsdProjectIdAtom } from "../../gsd/atoms"

interface GsdPlanningSidebarProps {
  onRunCommand: (command: string) => void
  onViewDocument: (path: string) => void
}

export function GsdPlanningSidebar({ onRunCommand, onViewDocument }: GsdPlanningSidebarProps) {
  const displayMode = useAtomValue(gsdDisplayModeAtom)
  const [isOpen, setIsOpen] = useAtom(gsdChatSidebarOpenAtom)
  const setRuntimeOpen = useSetAtom(gsdChatSidebarOpenRuntimeAtom)
  const selectedProject = useAtomValue(selectedProjectAtom)
  const [selectedProjectId, setSelectedProjectId] = useAtom(selectedGsdProjectIdAtom)

  // Sync project selection - use current chat's project if none selected
  useEffect(() => {
    if (!selectedProjectId && selectedProject?.id) {
      setSelectedProjectId(selectedProject.id)
    }
  }, [selectedProjectId, selectedProject?.id, setSelectedProjectId])

  const closeSidebar = useCallback(() => {
    if (displayMode === "side-peek") {
      setIsOpen(false)
    } else {
      setRuntimeOpen(false)
    }
  }, [displayMode, setIsOpen, setRuntimeOpen])

  return (
    <ResizableSidebar
      isOpen={isOpen}
      onClose={closeSidebar}
      widthAtom={gsdSidebarWidthAtom}
      side="right"
      minWidth={280}
      maxWidth={500}
      animationDuration={0}
      initialWidth={0}
      exitWidth={0}
      showResizeTooltip={true}
      className="bg-background border-l"
      style={{ borderLeftWidth: "0.5px", overflow: "hidden" }}
    >
      <div className="flex flex-col h-full min-w-0 overflow-hidden">
        {/* Header with close button */}
        <div className="flex items-center gap-1 px-2 py-1.5 flex-shrink-0 border-b border-border/50">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={closeSidebar}
                className="h-6 w-6 p-0 hover:bg-foreground/10 transition-[background-color,transform] duration-150 ease-out active:scale-[0.97] text-foreground flex-shrink-0 rounded-md"
                aria-label="Close GSD planning"
              >
                <DialogIcons.CloseSidebar className={DialogIconSizes.default} />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Close GSD planning</TooltipContent>
          </Tooltip>
          <span className="text-sm font-medium ml-1">Planning Docs</span>
        </div>

        {/* Right Panel Content - File list and next actions */}
        <div className="flex-1 min-h-0 overflow-hidden">
          <GsdPlanningRightPanel onRunCommand={onRunCommand} />
        </div>
      </div>
    </ResizableSidebar>
  )
}
