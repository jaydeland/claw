import { useCallback, useState, useRef, useMemo } from "react"
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
import { SessionFlowTodos } from "./session-flow-todos"
import { SessionSubAgentsList } from "./session-sub-agents-list"
import { SessionFlowTasks } from "./session-flow-tasks"
// NOTE: SubAgentOutputDialog is now rendered in active-chat.tsx
// They were moved outside the ResizableSidebar to ensure they remain mounted when the sidebar closes.
// This prevents issues where the dialog state (Jotai atoms) would persist but the component would unmount,
// causing problems when the sidebar reopens with stale dialog state.
import {
  sessionFlowSidebarOpenAtom,
  sessionFlowSidebarWidthAtom,
  sessionFlowTodosSplitAtom,
  sessionFlowDialogOpenAtom,
  sessionFlowFullScreenAtom,
  sessionFlowBottomTabAtom,
  sessionFlowTodosAtom,
  sessionFlowSubAgentsAtom,
} from "../atoms"
import { selectedAgentChatIdAtom } from "../../agents/atoms"
import { trpc } from "../../../lib/trpc"
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

const MIN_PANEL_PERCENT = 20 // Minimum 20% for either panel
const MAX_PANEL_PERCENT = 80 // Maximum 80% for either panel

export function SessionFlowSidebar({ onScrollToMessage }: SessionFlowSidebarProps) {
  const [isOpen, setIsOpen] = useAtom(sessionFlowSidebarOpenAtom)
  const [splitPercent, setSplitPercent] = useAtom(sessionFlowTodosSplitAtom)
  const [dialogOpen, setDialogOpen] = useAtom(sessionFlowDialogOpenAtom)
  const [fullScreen, setFullScreen] = useAtom(sessionFlowFullScreenAtom)
  const [bottomTab, setBottomTab] = useAtom(sessionFlowBottomTabAtom)
  const [isResizing, setIsResizing] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  // Get counts for tab badges
  const todosData = useAtomValue(sessionFlowTodosAtom)
  const subAgents = useAtomValue(sessionFlowSubAgentsAtom)
  const chatId = useAtomValue(selectedAgentChatIdAtom)

  const todosCount = todosData.todos.length
  const subAgentsCount = subAgents.length

  // Get running tasks count
  const { data: runningCount } = trpc.tasks.getRunningCount.useQuery(
    { chatId: chatId || "" },
    { enabled: !!chatId, refetchInterval: 5000 }
  )
  const tasksCount = runningCount?.total ?? 0

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

  // Handle vertical resize
  const handleResizePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) return

      event.preventDefault()
      event.stopPropagation()

      const container = containerRef.current
      if (!container) return

      const startY = event.clientY
      const containerRect = container.getBoundingClientRect()
      const containerHeight = containerRect.height
      const startPercent = splitPercent
      const pointerId = event.pointerId

      const handleElement = event.currentTarget as HTMLElement
      handleElement.setPointerCapture?.(pointerId)
      setIsResizing(true)

      const handlePointerMove = (moveEvent: PointerEvent) => {
        const deltaY = moveEvent.clientY - startY
        const deltaPercent = (deltaY / containerHeight) * 100
        const newPercent = Math.min(
          MAX_PANEL_PERCENT,
          Math.max(MIN_PANEL_PERCENT, startPercent + deltaPercent)
        )
        setSplitPercent(newPercent)
      }

      const handlePointerUp = () => {
        if (handleElement.hasPointerCapture?.(pointerId)) {
          handleElement.releasePointerCapture(pointerId)
        }
        document.removeEventListener("pointermove", handlePointerMove)
        document.removeEventListener("pointerup", handlePointerUp)
        document.removeEventListener("pointercancel", handlePointerUp)
        setIsResizing(false)
      }

      document.addEventListener("pointermove", handlePointerMove)
      document.addEventListener("pointerup", handlePointerUp, { once: true })
      document.addEventListener("pointercancel", handlePointerUp, { once: true })
    },
    [splitPercent, setSplitPercent]
  )

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

        {/* Split Panel Container */}
        <div ref={containerRef} className="flex-1 flex flex-col min-h-0 overflow-hidden">
          {/* Top Panel - Flow Diagram */}
          <div
            className="min-h-0 overflow-hidden"
            style={{ height: `${splitPercent}%` }}
          >
            <SessionFlowPanel onScrollToMessage={onScrollToMessage} />
          </div>

          {/* Resize Handle */}
          <div
            className="h-1 flex-shrink-0 cursor-row-resize relative group"
            onPointerDown={handleResizePointerDown}
          >
            {/* Visual indicator */}
            <div
              className={`absolute inset-x-0 top-1/2 -translate-y-1/2 h-[1px] transition-colors ${
                isResizing
                  ? "bg-foreground/40"
                  : "bg-border group-hover:bg-foreground/30"
              }`}
            />
            {/* Extended hit area */}
            <div className="absolute inset-x-0 -top-1 -bottom-1" />
          </div>

          {/* Bottom Panel - Tabs */}
          <div
            className="min-h-0 overflow-hidden border-t border-border/50 flex flex-col"
            style={{ height: `${100 - splitPercent}%` }}
          >
            {/* Tab switcher */}
            <div className="flex items-center gap-1 px-2 py-1.5 border-b border-border/50 flex-shrink-0">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setBottomTab("todos")}
                className={`h-6 px-2 text-xs transition-colors ${
                  bottomTab === "todos"
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                }`}
              >
                Todos {todosCount > 0 && <span className="ml-1 opacity-60">({todosCount})</span>}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setBottomTab("subAgents")}
                className={`h-6 px-2 text-xs transition-colors ${
                  bottomTab === "subAgents"
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                }`}
              >
                Sub Agents {subAgentsCount > 0 && <span className="ml-1 opacity-60">({subAgentsCount})</span>}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setBottomTab("tasks")}
                className={`h-6 px-2 text-xs transition-colors ${
                  bottomTab === "tasks"
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                }`}
              >
                Tasks {tasksCount > 0 && <span className="ml-1 opacity-60">({tasksCount})</span>}
              </Button>
            </div>

            {/* Tab content */}
            <div className="flex-1 min-h-0 overflow-hidden">
              {bottomTab === "todos" ? (
                <SessionFlowTodos onScrollToMessage={onScrollToMessage} />
              ) : bottomTab === "subAgents" ? (
                <SessionSubAgentsList onScrollToMessage={onScrollToMessage} />
              ) : (
                <SessionFlowTasks />
              )}
            </div>
          </div>
        </div>

        {/* NOTE: Dialogs moved to active-chat.tsx to prevent mount/unmount issues */}
      </div>
    </ResizableSidebar>
  )
}
