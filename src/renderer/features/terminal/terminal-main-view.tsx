"use client"

import { useEffect, useCallback, useMemo, useRef } from "react"
import { useAtom, useAtomValue } from "jotai"
import { useTheme } from "next-themes"
import { fullThemeDataAtom, selectedProjectAtom } from "@/lib/atoms"
import { motion } from "motion/react"
import { TerminalSquare, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Terminal } from "./terminal"
import { TerminalTabs } from "./terminal-tabs"
import { getDefaultTerminalBg } from "./helpers"
import {
  terminalsAtom,
  activeTerminalIdAtom,
  terminalCwdAtom,
  GLOBAL_TERMINAL_ID,
} from "./atoms"
import { selectedAgentChatIdAtom } from "../agents/atoms"
import { trpc } from "@/lib/trpc"
import type { TerminalInstance } from "./types"

function generateTerminalId(): string {
  return crypto.randomUUID().slice(0, 8)
}

function generatePaneId(chatId: string, terminalId: string): string {
  return `${chatId}:term:${terminalId}`
}

function getNextTerminalName(terminals: TerminalInstance[]): string {
  const existingNumbers = terminals
    .map((t) => {
      const match = t.name.match(/^Terminal (\d+)$/)
      return match ? parseInt(match[1], 10) : 0
    })
    .filter((n) => n > 0)
  const maxNumber = existingNumbers.length > 0 ? Math.max(...existingNumbers) : 0
  return `Terminal ${maxNumber + 1}`
}

export function TerminalMainView() {
  const selectedChatId = useAtomValue(selectedAgentChatIdAtom)
  const selectedProject = useAtomValue(selectedProjectAtom)
  const [allTerminals, setAllTerminals] = useAtom(terminalsAtom)
  const [allActiveIds, setAllActiveIds] = useAtom(activeTerminalIdAtom)
  const terminalCwds = useAtomValue(terminalCwdAtom)
  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme === "dark"
  const fullThemeData = useAtomValue(fullThemeDataAtom)
  const { data: chatData } = trpc.chats.get.useQuery(
    { id: selectedChatId! },
    { enabled: !!selectedChatId }
  )
  const worktreePath = chatData?.worktreePath as string | undefined
  const cwd = worktreePath || selectedProject?.path || "~"
  const terminalContextId = selectedChatId || GLOBAL_TERMINAL_ID
  const terminalBg = useMemo(() => {
    if (fullThemeData?.colors?.["terminal.background"]) return fullThemeData.colors["terminal.background"]
    if (fullThemeData?.colors?.["editor.background"]) return fullThemeData.colors["editor.background"]
    return getDefaultTerminalBg(isDark)
  }, [isDark, fullThemeData])
  const terminals = useMemo(() => allTerminals[terminalContextId] || [], [allTerminals, terminalContextId])
  const activeTerminalId = useMemo(() => allActiveIds[terminalContextId] || null, [allActiveIds, terminalContextId])
  const activeTerminal = useMemo(() => terminals.find((t) => t.id === activeTerminalId) || null, [terminals, activeTerminalId])
  const killMutation = trpc.terminal.kill.useMutation()
  const terminalsRef = useRef(terminals)
  terminalsRef.current = terminals
  const activeTerminalIdRef = useRef(activeTerminalId)
  activeTerminalIdRef.current = activeTerminalId

  const createTerminal = useCallback(() => {
    const id = generateTerminalId()
    const paneId = generatePaneId(terminalContextId, id)
    const name = getNextTerminalName(terminalsRef.current)
    const newTerminal: TerminalInstance = { id, paneId, name, createdAt: Date.now() }
    setAllTerminals((prev) => ({ ...prev, [terminalContextId]: [...(prev[terminalContextId] || []), newTerminal] }))
    setAllActiveIds((prev) => ({ ...prev, [terminalContextId]: id }))
  }, [terminalContextId, setAllTerminals, setAllActiveIds])

  const selectTerminal = useCallback((id: string) => {
    setAllActiveIds((prev) => ({ ...prev, [terminalContextId]: id }))
  }, [terminalContextId, setAllActiveIds])

  const closeTerminal = useCallback((id: string) => {
    const terminal = terminalsRef.current.find((t) => t.id === id)
    if (!terminal) return
    killMutation.mutate({ paneId: terminal.paneId })
    const newTerminals = terminalsRef.current.filter((t) => t.id !== id)
    setAllTerminals((prev) => ({ ...prev, [terminalContextId]: newTerminals }))
    if (activeTerminalIdRef.current === id) {
      setAllActiveIds((prev) => ({ ...prev, [terminalContextId]: newTerminals[newTerminals.length - 1]?.id || null }))
    }
  }, [terminalContextId, setAllTerminals, setAllActiveIds, killMutation])

  const renameTerminal = useCallback((id: string, name: string) => {
    setAllTerminals((prev) => ({ ...prev, [terminalContextId]: (prev[terminalContextId] || []).map((t) => t.id === id ? { ...t, name } : t) }))
  }, [terminalContextId, setAllTerminals])

  const closeOtherTerminals = useCallback((id: string) => {
    terminalsRef.current.forEach((terminal) => { if (terminal.id !== id) killMutation.mutate({ paneId: terminal.paneId }) })
    const remainingTerminal = terminalsRef.current.find((t) => t.id === id)
    setAllTerminals((prev) => ({ ...prev, [terminalContextId]: remainingTerminal ? [remainingTerminal] : [] }))
    setAllActiveIds((prev) => ({ ...prev, [terminalContextId]: id }))
  }, [terminalContextId, setAllTerminals, setAllActiveIds, killMutation])

  const closeTerminalsToRight = useCallback((id: string) => {
    const index = terminalsRef.current.findIndex((t) => t.id === id)
    if (index === -1) return
    terminalsRef.current.slice(index + 1).forEach((terminal) => killMutation.mutate({ paneId: terminal.paneId }))
    const remainingTerminals = terminalsRef.current.slice(0, index + 1)
    setAllTerminals((prev) => ({ ...prev, [terminalContextId]: remainingTerminals }))
    if (activeTerminalIdRef.current && !remainingTerminals.find((t) => t.id === activeTerminalIdRef.current)) {
      setAllActiveIds((prev) => ({ ...prev, [terminalContextId]: remainingTerminals[remainingTerminals.length - 1]?.id || null }))
    }
  }, [terminalContextId, setAllTerminals, setAllActiveIds, killMutation])

  useEffect(() => { if (terminals.length === 0) createTerminal() }, [terminals.length, createTerminal])

  if (terminals.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center" style={{ backgroundColor: terminalBg }}>
        <TerminalSquare className="h-12 w-12 text-muted-foreground/30 mb-4" />
        <p className="text-sm text-muted-foreground mb-4">No terminals open</p>
        <Button onClick={createTerminal} variant="outline" size="sm"><Plus className="h-4 w-4 mr-2" />New Terminal</Button>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full w-full overflow-hidden">
      <div className="flex items-center gap-1 px-2 py-1.5 flex-shrink-0 border-b border-border/50" style={{ backgroundColor: terminalBg }}>
        <TerminalTabs terminals={terminals} activeTerminalId={activeTerminalId} cwds={terminalCwds} initialCwd={cwd} terminalBg={terminalBg} onSelectTerminal={selectTerminal} onCloseTerminal={closeTerminal} onCloseOtherTerminals={closeOtherTerminals} onCloseTerminalsToRight={closeTerminalsToRight} onCreateTerminal={createTerminal} onRenameTerminal={renameTerminal} />
      </div>
      <div className="flex-1 min-h-0 min-w-0 overflow-hidden" style={{ backgroundColor: terminalBg }}>
        {activeTerminal ? (
          <motion.div key={activeTerminal.paneId} className="h-full" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0 }}>
            <Terminal paneId={activeTerminal.paneId} cwd={cwd} workspaceId={terminalContextId} initialCwd={cwd} />
          </motion.div>
        ) : (
          <div className="flex items-center justify-center h-full text-muted-foreground text-sm">No terminal selected</div>
        )}
      </div>
    </div>
  )
}
