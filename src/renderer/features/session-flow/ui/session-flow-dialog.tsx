import { useAtom } from "jotai"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { sessionFlowDialogOpenAtom } from "../atoms"
import { SessionFlowPanel } from "./session-flow-panel"

interface SessionFlowDialogProps {
  onScrollToMessage: (messageId: string, partIndex?: number) => void
}

export function SessionFlowDialog({ onScrollToMessage }: SessionFlowDialogProps) {
  const [open, setOpen] = useAtom(sessionFlowDialogOpenAtom)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-6xl h-[80vh] flex flex-col p-0">
        <DialogHeader className="px-6 py-4 border-b">
          <DialogTitle>Session Flow</DialogTitle>
        </DialogHeader>
        <div className="flex-1 min-h-0 overflow-hidden">
          <SessionFlowPanel onScrollToMessage={onScrollToMessage} />
        </div>
      </DialogContent>
    </Dialog>
  )
}
