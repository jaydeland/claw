import { memo } from "react"
import { useAtom, useAtomValue } from "jotai"
import { ResizableSidebar } from "../../../components/ui/resizable-sidebar"
import { SessionFlowSidebar } from "./session-flow-sidebar"
import { SessionFlowDialog } from "./session-flow-dialog"
import { SessionFlowFullScreen } from "./session-flow-fullscreen"
import {
  sessionFlowDisplayModeAtom,
  sessionFlowSidebarOpenAtom,
  sessionFlowSidebarOpenRuntimeAtom,
} from "../atoms"

interface SessionFlowRendererProps {
  onScrollToMessage: (messageId: string, partIndex?: number) => void
}

export const SessionFlowRenderer = memo(function SessionFlowRenderer({
  onScrollToMessage,
}: SessionFlowRendererProps) {
  const displayMode = useAtomValue(sessionFlowDisplayModeAtom)
  const [isOpen, setIsOpen] = useAtom(sessionFlowSidebarOpenAtom)
  const [runtimeOpen, setRuntimeOpen] = useAtom(sessionFlowSidebarOpenRuntimeAtom)

  // Determine which open state to use based on display mode
  const effectiveOpen = displayMode === "side-peek" ? isOpen : runtimeOpen

  const handleClose = () => {
    if (displayMode === "side-peek") {
      setIsOpen(false)
    } else {
      setRuntimeOpen(false)
    }
  }

  // Render based on display mode
  if (displayMode === "side-peek") {
    return <SessionFlowSidebar onScrollToMessage={onScrollToMessage} />
  }

  if (displayMode === "center-peek") {
    return (
      <SessionFlowDialog
        isOpen={effectiveOpen}
        onClose={handleClose}
        onScrollToMessage={onScrollToMessage}
      />
    )
  }

  if (displayMode === "full-page") {
    return (
      <SessionFlowFullScreen
        isOpen={effectiveOpen}
        onClose={handleClose}
        onScrollToMessage={onScrollToMessage}
      />
    )
  }

  return null
})
