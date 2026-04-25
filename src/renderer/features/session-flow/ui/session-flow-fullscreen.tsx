import { useCallback } from "react"
import { useAtom } from "jotai"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { Play, Pause } from "lucide-react"
import { DialogIcons, DialogIconSizes } from "@/lib/dialog-icons"
import { SessionFlowPanel } from "./session-flow-panel"
import { sessionFlowLiveAtom } from "../atoms"

interface SessionFlowFullScreenProps {
  isOpen: boolean
  onClose: () => void
  onScrollToMessage: (messageId: string, partIndex?: number) => void
}

export function SessionFlowFullScreen({ isOpen, onClose, onScrollToMessage }: SessionFlowFullScreenProps) {
  const [isLive, setIsLive] = useAtom(sessionFlowLiveAtom)

  const toggleLive = useCallback(() => {
    setIsLive(prev => !prev)
  }, [setIsLive])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-4 px-4 py-2 border-b">
        <h1 className="text-lg font-semibold">Session Flow</h1>

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

        <div className="flex-1" />

        <Button
          variant="ghost"
          size="icon"
          onClick={onClose}
          aria-label="Exit full screen"
        >
          <DialogIcons.Close className={DialogIconSizes.default} />
        </Button>
      </div>

      {/* Flow Panel */}
      <div className="flex-1 min-h-0 overflow-hidden">
        <SessionFlowPanel onScrollToMessage={onScrollToMessage} />
      </div>
    </div>
  )
}
