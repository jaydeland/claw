import { useCallback } from "react"
import { useAtom } from "jotai"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { Play, Pause } from "lucide-react"
import { SessionFlowPanel } from "./session-flow-panel"
import { sessionFlowLiveAtom } from "../atoms"

interface SessionFlowDialogProps {
  isOpen: boolean
  onClose: () => void
  onScrollToMessage: (messageId: string, partIndex?: number) => void
}

export function SessionFlowDialog({ isOpen, onClose, onScrollToMessage }: SessionFlowDialogProps) {
  const [isLive, setIsLive] = useAtom(sessionFlowLiveAtom)

  const toggleLive = useCallback(() => {
    setIsLive(prev => !prev)
  }, [setIsLive])

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-6xl h-[80vh] flex flex-col p-0">
        <DialogHeader className="px-6 py-4 border-b flex flex-row items-center justify-between">
          <DialogTitle>Session Flow</DialogTitle>

          {/* Live Toggle Button */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                onClick={toggleLive}
                className={`
                  h-6 px-2 text-xs font-medium rounded-md
                  transition-colors duration-150 ease-out
                  ${isLive
                    ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20'
                    : 'bg-muted/80 text-muted-foreground hover:bg-muted'
                  }
                `}
              >
                {isLive ? (
                  <Play className="h-3 w-3 fill-current mr-1" />
                ) : (
                  <Pause className="h-3 w-3 mr-1" />
                )}
                <span>Live</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              {isLive ? 'Auto-following new nodes' : 'Paused - click to resume'}
            </TooltipContent>
          </Tooltip>
        </DialogHeader>
        <div className="flex-1 min-h-0 overflow-hidden">
          <SessionFlowPanel onScrollToMessage={onScrollToMessage} />
        </div>
      </DialogContent>
    </Dialog>
  )
}
