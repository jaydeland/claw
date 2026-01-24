import { useCallback } from "react"
import { useAtom } from "jotai"
import { ResizableSidebar } from "@/components/ui/resizable-sidebar"
import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { IconDoubleChevronRight } from "@/components/ui/icons"
import { SessionFlowPanel } from "./session-flow-panel"
import {
  sessionFlowSidebarOpenAtom,
  sessionFlowSidebarWidthAtom,
} from "../atoms"

interface SessionFlowSidebarProps {
  onScrollToMessage: (messageId: string, partIndex?: number) => void
}

export function SessionFlowSidebar({ onScrollToMessage }: SessionFlowSidebarProps) {
  const [isOpen, setIsOpen] = useAtom(sessionFlowSidebarOpenAtom)

  const closeSidebar = useCallback(() => {
    setIsOpen(false)
  }, [setIsOpen])

  return (
    <ResizableSidebar
      isOpen={isOpen}
      onClose={closeSidebar}
      widthAtom={sessionFlowSidebarWidthAtom}
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
        {/* Header */}
        <div className="flex items-center gap-1 px-2 py-1.5 flex-shrink-0 border-b border-border/50">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={closeSidebar}
                className="h-6 w-6 p-0 hover:bg-foreground/10 transition-[background-color,transform] duration-150 ease-out active:scale-[0.97] text-foreground flex-shrink-0 rounded-md"
                aria-label="Close session flow"
              >
                <IconDoubleChevronRight className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Close session flow</TooltipContent>
          </Tooltip>
          <span className="text-sm font-medium ml-1">Session Flow</span>
        </div>

        {/* Flow Panel */}
        <div className="flex-1 min-h-0">
          <SessionFlowPanel onScrollToMessage={onScrollToMessage} />
        </div>
      </div>
    </ResizableSidebar>
  )
}
