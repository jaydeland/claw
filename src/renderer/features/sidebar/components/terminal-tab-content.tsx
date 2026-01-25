"use client"

import { useCallback, useMemo } from "react"
import { useAtom, useAtomValue } from "jotai"
import { Plus, X, TerminalSquare } from "lucide-react"
import { Button } from "../../../components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "../../../components/ui/tooltip"
import { cn } from "../../../lib/utils"
import { selectedAgentChatIdAtom, selectedProjectAtom } from "../../agents/atoms"
import {
  terminalsAtom,
  activeTerminalIdAtom,
  terminalCwdAtom,
  terminalSidebarOpenAtom,
  GLOBAL_TERMINAL_ID,
} from "../../terminal/atoms"
import { trpc } from "../../../lib/trpc"
import type { TerminalInstance } from "../../terminal/types"

interface TerminalTabContentProps {
  className?: string
}

/**
 * Generate a unique terminal ID
 */
function generateTerminalId(): string {
  return crypto.randomUUID().slice(0, 8)
}

/**
 * Generate a paneId for TerminalManager
 */
function generatePaneId(chatId: string, terminalId: string): string {
  return `${chatId}:term:${terminalId}`
}

/**
 * Get the next terminal name based on existing terminals
 */
function getNextTerminalName(terminals: TerminalInstance[]): string {
  const existingNumbers = terminals
    .map((t) => {
      const match = t.name.match(/^Terminal (\d+)$/)
      return match ? parseInt(match[1], 10) : 0
    })
    .filter((n) => n > 0)

  const maxNumber =
    existingNumbers.length > 0 ? Math.max(...existingNumbers) : 0
  return `Terminal ${maxNumber + 1}`
}

/**
 * Get short path display (last folder name or full path if short)
 */
function getShortPath(cwd: string | undefined, initialCwd: string): string {
  const path = cwd || initialCwd
  if (!path) return ""
  const parts = path.split("/").filter(Boolean)
  return parts.length > 0 ? parts[parts.length - 1] : path
}

export function TerminalTabContent({ className }: TerminalTabContentProps) {
  const selectedChatId = useAtomValue(selectedAgentChatIdAtom)
  const selectedProject = useAtomValue(selectedProjectAtom)
  const [allTerminals, setAllTerminals] = useAtom(terminalsAtom)
  const [allActiveIds, setAllActiveIds] = useAtom(activeTerminalIdAtom)
  const terminalCwds = useAtomValue(terminalCwdAtom)
  const [, setTerminalSidebarOpen] = useAtom(terminalSidebarOpenAtom)

  // Get chat data for worktree path (if chat is selected)
  const { data: chatData } = trpc.chats.get.useQuery(
    { id: selectedChatId! },
    { enabled: !!selectedChatId }
  )

  const worktreePath = chatData?.worktreePath as string | undefined

  // Determine default working directory: worktree → project path → home directory
  const defaultCwd = worktreePath || selectedProject?.path || "~"

  // Use global terminal ID if no chat is selected
  const terminalContextId = selectedChatId || GLOBAL_TERMINAL_ID

  // tRPC mutation for killing terminal sessions
  const killMutation = trpc.terminal.kill.useMutation()

  // Get terminals for this context (chat or global)
  const terminals = useMemo(
    () => allTerminals[terminalContextId] || [],
    [allTerminals, terminalContextId]
  )

  // Get active terminal ID for this context
  const activeTerminalId = useMemo(
    () => allActiveIds[terminalContextId] || null,
    [allActiveIds, terminalContextId]
  )

  // Create a new terminal and open the sidebar
  const createTerminal = useCallback(() => {
    const id = generateTerminalId()
    const paneId = generatePaneId(terminalContextId, id)
    const name = getNextTerminalName(terminals)

    const newTerminal: TerminalInstance = {
      id,
      paneId,
      name,
      createdAt: Date.now(),
    }

    setAllTerminals((prev) => ({
      ...prev,
      [terminalContextId]: [...(prev[terminalContextId] || []), newTerminal],
    }))

    // Set as active
    setAllActiveIds((prev) => ({
      ...prev,
      [terminalContextId]: id,
    }))

    // Open the terminal sidebar when creating a new terminal
    setTerminalSidebarOpen(true)
  }, [terminalContextId, terminals, setAllTerminals, setAllActiveIds, setTerminalSidebarOpen])

  // Select a terminal and open the sidebar
  const selectTerminal = useCallback(
    (id: string) => {
      setAllActiveIds((prev) => ({
        ...prev,
        [terminalContextId]: id,
      }))
      // Open the terminal sidebar when selecting a terminal
      setTerminalSidebarOpen(true)
    },
    [terminalContextId, setAllActiveIds, setTerminalSidebarOpen]
  )

  // Close a terminal
  const closeTerminal = useCallback(
    (id: string, e: React.MouseEvent) => {
      e.stopPropagation()

      const terminal = terminals.find((t) => t.id === id)
      if (!terminal) return

      // Kill the session on the backend
      killMutation.mutate({ paneId: terminal.paneId })

      // Remove from state
      const newTerminals = terminals.filter((t) => t.id !== id)
      setAllTerminals((prev) => ({
        ...prev,
        [terminalContextId]: newTerminals,
      }))

      // If we closed the active terminal, switch to another
      if (activeTerminalId === id) {
        const newActive = newTerminals[newTerminals.length - 1]?.id || null
        setAllActiveIds((prev) => ({
          ...prev,
          [terminalContextId]: newActive,
        }))
      }
    },
    [
      terminalContextId,
      terminals,
      activeTerminalId,
      setAllTerminals,
      setAllActiveIds,
      killMutation,
    ]
  )

  return (
    <div className={cn("flex flex-col h-full", className)}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border/50">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Terminals
        </span>
        <Tooltip delayDuration={300}>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              onClick={createTerminal}
              className="h-6 w-6 rounded-md"
            >
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">New Terminal</TooltipContent>
        </Tooltip>
      </div>

      {/* Terminal List */}
      <div className="flex-1 overflow-y-auto">
        {terminals.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full p-4">
            <TerminalSquare className="h-6 w-6 text-muted-foreground/50 mb-2" />
            <span className="text-xs text-muted-foreground text-center">
              No terminals open
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={createTerminal}
              className="mt-3 text-xs"
            >
              <Plus className="h-3 w-3 mr-1" />
              New Terminal
            </Button>
          </div>
        ) : (
          <div className="py-1">
            {terminals.map((terminal) => {
              const isActive = terminal.id === activeTerminalId
              const cwd = terminalCwds[terminal.paneId]
              const shortPath = getShortPath(cwd, defaultCwd)

              return (
                <div
                  key={terminal.id}
                  onClick={() => selectTerminal(terminal.id)}
                  className={cn(
                    "group flex items-center gap-2 px-3 py-1.5 cursor-pointer transition-colors",
                    isActive
                      ? "bg-foreground/10 text-foreground"
                      : "text-muted-foreground hover:bg-foreground/5 hover:text-foreground"
                  )}
                >
                  <TerminalSquare className="h-3.5 w-3.5 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm truncate">{terminal.name}</div>
                    {shortPath && (
                      <div className="text-[10px] text-muted-foreground/70 truncate">
                        {shortPath}
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={(e) => closeTerminal(terminal.id, e)}
                    className={cn(
                      "h-5 w-5 flex items-center justify-center rounded-sm transition-all",
                      "opacity-0 group-hover:opacity-100",
                      "hover:bg-foreground/10 text-muted-foreground hover:text-foreground"
                    )}
                    aria-label="Close terminal"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
