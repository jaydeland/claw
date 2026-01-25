import { useAtom } from "jotai"
import { Button } from "@/components/ui/button"
import { DialogIcons, DialogIconSizes } from "@/lib/dialog-icons"
import { sessionFlowFullScreenAtom } from "../atoms"
import { SessionFlowPanel } from "./session-flow-panel"

interface SessionFlowFullScreenProps {
  onScrollToMessage: (messageId: string, partIndex?: number) => void
}

export function SessionFlowFullScreen({ onScrollToMessage }: SessionFlowFullScreenProps) {
  const [fullScreen, setFullScreen] = useAtom(sessionFlowFullScreenAtom)

  if (!fullScreen) return null

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b">
        <h1 className="text-lg font-semibold">Session Flow</h1>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setFullScreen(false)}
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
