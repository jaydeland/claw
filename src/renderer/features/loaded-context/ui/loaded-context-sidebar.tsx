import { useCallback } from "react"
import { useAtom, useSetAtom } from "jotai"
import { ResizableSidebar } from "@/components/ui/resizable-sidebar"
import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { DialogIcons, DialogIconSizes } from "@/lib/dialog-icons"
import { LoadedContextPanel } from "./loaded-context-panel"
import { LoadedContextViewModeSwitcher } from "./loaded-context-view-mode-switcher"
import {
  loadedContextDisplayModeAtom,
  loadedContextSidebarOpenAtom,
  loadedContextSidebarOpenRuntimeAtom,
  loadedContextSidebarWidthAtom,
} from "../atoms"

interface LoadedContextSidebarProps {
  projectPath?: string
}

export function LoadedContextSidebar({ projectPath }: LoadedContextSidebarProps) {
  const [displayMode, setDisplayMode] = useAtom(loadedContextDisplayModeAtom)
  const [isOpen, setIsOpen] = useAtom(loadedContextSidebarOpenAtom)
  const setRuntimeOpen = useSetAtom(loadedContextSidebarOpenRuntimeAtom)

  const closeSidebar = useCallback(() => {
    if (displayMode === "side-peek") {
      setIsOpen(false)
    } else {
      setRuntimeOpen(false)
    }
  }, [displayMode, setIsOpen, setRuntimeOpen])

  const handleModeChange = useCallback((newMode: "side-peek" | "center-peek" | "full-page") => {
    setDisplayMode(newMode)
    if (newMode === "side-peek") {
      setIsOpen(true)
      setRuntimeOpen(false)
    } else {
      setRuntimeOpen(true)
    }
  }, [setDisplayMode, setIsOpen, setRuntimeOpen])

  return (
    <ResizableSidebar
      isOpen={isOpen}
      onClose={closeSidebar}
      widthAtom={loadedContextSidebarWidthAtom}
      side="right"
      minWidth={200}
      animationDuration={0}
      initialWidth={0}
      exitWidth={0}
      showResizeTooltip={true}
      className="bg-background border-l"
      style={{ borderLeftWidth: "0.5px", overflow: "hidden" }}
    >
      <div className="flex flex-col h-full min-w-0 overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-1 px-2 py-1.5 flex-shrink-0 border-b border-border/50">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={closeSidebar}
                className="h-6 w-6 p-0 hover:bg-foreground/10 transition-[background-color,transform] duration-150 ease-out active:scale-[0.97] text-foreground flex-shrink-0 rounded-md"
                aria-label="Close loaded context"
              >
                <DialogIcons.CloseSidebar className={DialogIconSizes.default} />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Close loaded context</TooltipContent>
          </Tooltip>
          <span className="text-sm font-medium ml-1">Loaded Context</span>

          {/* Spacer */}
          <div className="flex-1" />

          {/* Display Mode Switcher */}
          <LoadedContextViewModeSwitcher
            mode={displayMode}
            onModeChange={handleModeChange}
          />
        </div>

        {/* Content */}
        <div className="flex-1 min-h-0 overflow-auto">
          <LoadedContextPanel projectPath={projectPath} />
        </div>
      </div>
    </ResizableSidebar>
  )
}
