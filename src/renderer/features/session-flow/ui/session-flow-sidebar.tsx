import { useCallback, useMemo } from "react"
import { useAtom, useAtomValue } from "jotai"
import { atom } from "jotai"
import { ResizableSidebar } from "@/components/ui/resizable-sidebar"
import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { Download } from "lucide-react"
import { DialogIcons, DialogIconSizes } from "@/lib/dialog-icons"
import { SessionFlowPanel } from "./session-flow-panel"
// NOTE: Todos, SubAgents, and Tasks have been moved to the SessionStatusBar component
// in the chat input area for better accessibility and UX.
// NOTE: SubAgentOutputDialog is now rendered in active-chat.tsx
// They were moved outside the ResizableSidebar to ensure they remain mounted when the sidebar closes.
// This prevents issues where the dialog state (Jotai atoms) would persist but the component would unmount,
// causing problems when the sidebar reopens with stale dialog state.
import {
  sessionFlowSidebarOpenAtom,
  sessionFlowSidebarWidthAtom,
  sessionFlowDialogOpenAtom,
  sessionFlowFullScreenAtom,
} from "../atoms"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { messageIdsAtom, messageAtomFamily, type Message } from "../../agents/stores/message-store"
import { exportSessionFlowAsMarkdown } from "../lib/export-markdown"

interface SessionFlowSidebarProps {
  onScrollToMessage: (messageId: string, partIndex?: number) => void
}

export function SessionFlowSidebar({ onScrollToMessage }: SessionFlowSidebarProps) {
  const [isOpen, setIsOpen] = useAtom(sessionFlowSidebarOpenAtom)
  const [dialogOpen, setDialogOpen] = useAtom(sessionFlowDialogOpenAtom)
  const [fullScreen, setFullScreen] = useAtom(sessionFlowFullScreenAtom)

  // Get all messages for export
  const messageIds = useAtomValue(messageIdsAtom)
  const allMessages = useMemo(() => {
    const messagesAtom = atom((get) => {
      return messageIds
        .map((id) => get(messageAtomFamily(id)))
        .filter((msg): msg is Message => msg !== null)
    })
    return messagesAtom
  }, [messageIds])
  const messages = useAtomValue(allMessages)

  const closeSidebar = useCallback(() => {
    setIsOpen(false)
  }, [setIsOpen])

  const openDialog = useCallback(() => {
    setDialogOpen(true)
  }, [setDialogOpen])

  const toggleFullScreen = useCallback(() => {
    setFullScreen(!fullScreen)
  }, [fullScreen, setFullScreen])

  // Handle export as PNG
  const handleExportPNG = useCallback(() => {
    // Use ReactFlow's built-in export via domtoimage
    // This is a placeholder - will be implemented with proper ReactFlow API
    console.log("Export as PNG - using ReactFlow screenshot functionality")
    // TODO: Implement proper PNG export using ReactFlow's getViewport/toObject
  }, [])

  // Handle export as Markdown
  const handleExportMD = useCallback(() => {
    const markdown = exportSessionFlowAsMarkdown(messages)

    // Download as MD file
    const blob = new Blob([markdown], { type: "text/markdown" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.download = `session-flow-${Date.now()}.md`
    link.href = url
    link.click()
    URL.revokeObjectURL(url)
  }, [messages])

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
                <DialogIcons.CloseSidebar className={DialogIconSizes.default} />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Close session flow</TooltipContent>
          </Tooltip>
          <span className="text-sm font-medium ml-1">Session Flow</span>

          {/* Export and View Options */}
          <div className="flex-1" />

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={openDialog}
                className="h-6 w-6 p-0 hover:bg-foreground/10 transition-[background-color,transform] duration-150 ease-out active:scale-[0.97] text-foreground flex-shrink-0 rounded-md"
                aria-label="Open in dialog"
              >
                <DialogIcons.OpenDialog className={DialogIconSizes.small} />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Open in dialog</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={toggleFullScreen}
                className="h-6 w-6 p-0 hover:bg-foreground/10 transition-[background-color,transform] duration-150 ease-out active:scale-[0.97] text-foreground flex-shrink-0 rounded-md"
                aria-label="Toggle full screen"
              >
                <DialogIcons.FullScreen className={DialogIconSizes.small} />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Toggle full screen</TooltipContent>
          </Tooltip>

          <DropdownMenu>
            <Tooltip>
              <TooltipTrigger asChild>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 p-0 hover:bg-foreground/10 transition-[background-color,transform] duration-150 ease-out active:scale-[0.97] text-foreground flex-shrink-0 rounded-md"
                    aria-label="Export"
                  >
                    <Download className={DialogIconSizes.small} />
                  </Button>
                </DropdownMenuTrigger>
              </TooltipTrigger>
              <TooltipContent side="bottom">Export session flow</TooltipContent>
            </Tooltip>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={handleExportPNG}>
                Export as PNG
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleExportMD}>
                Export as Markdown
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Flow Diagram - Full Height */}
        <div className="flex-1 min-h-0 overflow-hidden">
          <SessionFlowPanel onScrollToMessage={onScrollToMessage} />
        </div>

        {/* NOTE: Dialogs moved to active-chat.tsx to prevent mount/unmount issues */}
      </div>
    </ResizableSidebar>
  )
}
