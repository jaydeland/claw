"use client"

import { memo, useState, useMemo, useEffect, useCallback, useRef } from "react"
import { useSetAtom, useAtom, useAtomValue } from "jotai"
import { atomWithStorage } from "jotai/utils"
import { ChevronDown, Loader2, Square, X, ArrowUp, Circle } from "lucide-react"
import { motion, AnimatePresence } from "motion/react"
import { Button } from "../../../components/ui/button"
import { cn } from "../../../lib/utils"
import { trpc } from "../../../lib/trpc"
import { useFileChangeListener } from "../../../lib/hooks/use-file-change-listener"
import { getFileIconByExtension } from "../mentions/agents-file-mention"
import { CheckIcon, IconSpinner, IconArrowRight } from "../../../components/ui/icons"
import { toast } from "sonner"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "../../../components/ui/tooltip"
import {
  diffSidebarOpenAtomFamily,
  agentsFocusedDiffFileAtom,
  filteredDiffFilesAtom,
  filteredSubChatIdAtom,
  selectedAgentChatIdAtom,
  type SubChatFileChange,
} from "../atoms"
import {
  sessionFlowTodosAtom,
  sessionFlowSubAgentsAtom,
  selectedSubAgentAtom,
  subAgentOutputDialogOpenAtom,
  selectedBackgroundTaskAtom,
  backgroundTaskOutputDialogOpenAtom,
  type SessionTodoItem,
  type SessionSubAgent,
} from "../../session-flow/atoms"
import type { AgentQueueItem } from "../lib/queue-utils"
import { RenderFileMentions } from "../mentions/render-file-mentions"

// Section types - now includes queue
type SectionType = 'queue' | 'changes' | 'agents' | 'todos' | null

// Persistent expanded section atom - only one section can be expanded at a time
const statusBarSectionAtom = atomWithStorage<SectionType>(
  'session-status-bar-section',
  null
)

// Animated dots component that cycles through ., .., ...
function AnimatedDots() {
  const [dotCount, setDotCount] = useState(1)

  useEffect(() => {
    const interval = setInterval(() => {
      setDotCount((prev) => (prev % 3) + 1)
    }, 400)
    return () => clearInterval(interval)
  }, [])

  return <span className="inline-block w-[1em] text-left">{".".repeat(dotCount)}</span>
}

// Status icon for todos
const TodoStatusIcon = memo(function TodoStatusIcon({
  status,
}: {
  status: SessionTodoItem["status"]
}) {
  switch (status) {
    case "completed":
      return (
        <div
          className="w-3 h-3 rounded-full bg-muted flex items-center justify-center flex-shrink-0"
          style={{ border: "0.5px solid hsl(var(--border))" }}
        >
          <CheckIcon className="w-1.5 h-1.5 text-muted-foreground" />
        </div>
      )
    case "in_progress":
      return (
        <div className="w-3 h-3 rounded-full bg-foreground flex items-center justify-center flex-shrink-0">
          <IconArrowRight className="w-1.5 h-1.5 text-background" />
        </div>
      )
    default:
      return (
        <div
          className="w-3 h-3 rounded-full flex items-center justify-center flex-shrink-0"
          style={{ border: "0.5px solid hsl(var(--muted-foreground) / 0.3)" }}
        />
      )
  }
})

// Status icon for sub-agents
const SubAgentStatusIcon = memo(function SubAgentStatusIcon({
  status,
}: {
  status: SessionSubAgent["status"]
}) {
  switch (status) {
    case "completed":
      return (
        <div
          className="w-3 h-3 rounded-full bg-emerald-500/10 flex items-center justify-center flex-shrink-0 border border-emerald-500/50"
        >
          <CheckIcon className="w-1.5 h-1.5 text-emerald-600 dark:text-emerald-500" />
        </div>
      )
    case "failed":
      return (
        <div
          className="w-3 h-3 rounded-full bg-destructive/10 flex items-center justify-center flex-shrink-0 border border-destructive/50"
        >
          <X className="w-1.5 h-1.5 text-destructive" />
        </div>
      )
    case "running":
      return (
        <div className="w-3 h-3 rounded-full bg-foreground flex items-center justify-center flex-shrink-0">
          <IconSpinner className="w-1.5 h-1.5 text-background" />
        </div>
      )
    default:
      return (
        <div
          className="w-3 h-3 rounded-full flex items-center justify-center flex-shrink-0"
          style={{ border: "0.5px solid hsl(var(--muted-foreground) / 0.3)" }}
        />
      )
  }
})

// Task status icon
const TaskStatusIcon = memo(function TaskStatusIcon({
  status,
}: {
  status: string
}) {
  switch (status) {
    case "completed":
      return (
        <div
          className="w-3 h-3 rounded-full bg-emerald-500/10 flex items-center justify-center flex-shrink-0 border border-emerald-500/50"
        >
          <CheckIcon className="w-1.5 h-1.5 text-emerald-600 dark:text-emerald-500" />
        </div>
      )
    case "failed":
      return (
        <div
          className="w-3 h-3 rounded-full bg-destructive/10 flex items-center justify-center flex-shrink-0 border border-destructive/50"
        >
          <X className="w-1.5 h-1.5 text-destructive" />
        </div>
      )
    case "running":
      return (
        <div className="w-3 h-3 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 border border-primary/50">
          <Loader2 className="w-1.5 h-1.5 text-primary animate-spin" />
        </div>
      )
    default:
      return (
        <div
          className="w-3 h-3 rounded-full flex items-center justify-center flex-shrink-0"
          style={{ border: "0.5px solid hsl(var(--muted-foreground) / 0.3)" }}
        />
      )
  }
})

// Section button component - text-based labels
const SectionButton = memo(function SectionButton({
  label,
  count,
  countDisplay,
  countNode,
  isActive,
  onClick,
  disabled,
}: {
  label: string
  count: number
  countDisplay?: string // Optional custom display string (e.g., "3/5")
  countNode?: React.ReactNode // Optional custom display node with styling (e.g., colored additions/deletions)
  isActive: boolean
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={`${label} (${countDisplay || count})`}
      className={cn(
        "flex items-center gap-0.5 px-1.5 py-1 rounded-md text-xs transition-colors",
        disabled && "opacity-50 cursor-not-allowed",
        isActive
          ? "bg-muted text-foreground"
          : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
      )}
    >
      <span>{label}</span>
      <span className="text-[10px] opacity-70">
        ({countNode || countDisplay || count})
      </span>
    </button>
  )
})

// Helper to get short model name
function getShortModelName(modelId?: string): string {
  if (!modelId) return ""
  // Extract model name from full ID (e.g., "claude-3-5-sonnet-20241022" -> "Sonnet")
  if (modelId.includes("opus")) return "Opus"
  if (modelId.includes("sonnet")) return "Sonnet"
  if (modelId.includes("haiku")) return "Haiku"
  // For other models, try to get a short name
  const parts = modelId.split("-")
  return parts[parts.length - 1] || modelId
}

// Queue item row component
const QueueItemRow = memo(function QueueItemRow({
  item,
  onRemove,
  onSendNow,
}: {
  item: AgentQueueItem
  onRemove?: (itemId: string) => void
  onSendNow?: (itemId: string) => void
}) {
  const handleRemove = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      onRemove?.(item.id)
    },
    [item.id, onRemove]
  )

  const handleSendNow = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      onSendNow?.(item.id)
    },
    [item.id, onSendNow]
  )

  // Get display text - truncate message and show attachment count
  const hasAttachments =
    (item.images && item.images.length > 0) ||
    (item.files && item.files.length > 0) ||
    (item.textContexts && item.textContexts.length > 0) ||
    (item.diffTextContexts && item.diffTextContexts.length > 0)
  const attachmentCount =
    (item.images?.length || 0) +
    (item.files?.length || 0) +
    (item.textContexts?.length || 0) +
    (item.diffTextContexts?.length || 0)

  // Get mode and model display
  const modeLabel = item.mode ? item.mode.charAt(0).toUpperCase() + item.mode.slice(1) : null
  const modelLabel = getShortModelName(item.modelId)

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-muted/50 transition-colors cursor-default">
      {/* Mode and model indicator */}
      {(modeLabel || modelLabel) && (
        <span className="flex-shrink-0 text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
          {modeLabel}{modeLabel && modelLabel ? " · " : ""}{modelLabel}
        </span>
      )}
      <span className="truncate flex-1 text-foreground">
        <RenderFileMentions text={item.message} />
      </span>
      {hasAttachments && (
        <span className="flex-shrink-0 text-muted-foreground text-[10px]">
          +{attachmentCount} {attachmentCount === 1 ? "file" : "files"}
        </span>
      )}
      <div className="flex items-center gap-1">
        {onSendNow && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={handleSendNow}
                className="flex-shrink-0 p-1 hover:bg-foreground/10 rounded text-muted-foreground hover:text-foreground transition-all"
              >
                <ArrowUp className="w-3.5 h-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="top">Send now</TooltipContent>
          </Tooltip>
        )}
        {onRemove && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={handleRemove}
                className="flex-shrink-0 p-1 hover:bg-foreground/10 rounded text-muted-foreground hover:text-foreground transition-all"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="top">Remove</TooltipContent>
          </Tooltip>
        )}
      </div>
    </div>
  )
})

interface SessionStatusBarProps {
  chatId: string
  subChatId: string
  isStreaming: boolean
  isCompacting?: boolean
  changedFiles: SubChatFileChange[]
  worktreePath?: string | null
  onStop?: () => void
  onScrollToMessage?: (messageId: string, partIndex?: number) => void
  // Queue props
  queue: AgentQueueItem[]
  onRemoveFromQueue?: (itemId: string) => void
  onSendFromQueue?: (itemId: string) => void
  // Processing status
  currentToolStatus?: { toolName: string | null; statusText: string } | null
}

export const SessionStatusBar = memo(function SessionStatusBar({
  chatId,
  subChatId,
  isStreaming,
  isCompacting,
  changedFiles,
  worktreePath,
  onStop,
  onScrollToMessage,
  queue,
  onRemoveFromQueue,
  onSendFromQueue,
  currentToolStatus,
}: SessionStatusBarProps) {
  const [expandedSection, setExpandedSection] = useAtom(statusBarSectionAtom)

  // Use per-chat atom family instead of legacy global atom
  const diffSidebarAtom = useMemo(
    () => diffSidebarOpenAtomFamily(chatId),
    [chatId],
  )
  const [, setDiffSidebarOpen] = useAtom(diffSidebarAtom)
  const setFilteredDiffFiles = useSetAtom(filteredDiffFilesAtom)
  const setFilteredSubChatId = useSetAtom(filteredSubChatIdAtom)
  const setFocusedDiffFile = useSetAtom(agentsFocusedDiffFileAtom)

  // Dialog setters for agents and tasks
  const setSelectedAgent = useSetAtom(selectedSubAgentAtom)
  const setAgentDialogOpen = useSetAtom(subAgentOutputDialogOpenAtom)
  const setSelectedTask = useSetAtom(selectedBackgroundTaskAtom)
  const setTaskDialogOpen = useSetAtom(backgroundTaskOutputDialogOpenAtom)

  // Get data from atoms
  const todosData = useAtomValue(sessionFlowTodosAtom)
  const subAgents = useAtomValue(sessionFlowSubAgentsAtom)

  // Get tasks from tRPC
  const { data: tasks, refetch: refetchTasks } = trpc.tasks.listByChat.useQuery(
    { chatId: chatId || "" },
    { enabled: !!chatId, refetchInterval: 5000 }
  )

  // Kill task mutation
  const killMutation = trpc.tasks.killTask.useMutation({
    onSuccess: (result) => {
      if (result.killed) {
        toast.success("Task stopped")
      }
      refetchTasks()
    },
    onError: (error) => {
      toast.error(`Failed to stop task: ${error.message}`)
    },
  })

  // Listen for file changes from Claude Write/Edit tools
  useFileChangeListener(worktreePath)

  // Fetch git status to filter out committed files
  const { data: gitStatus } = trpc.changes.getStatus.useQuery(
    { worktreePath: worktreePath || "", defaultBranch: "main" },
    {
      enabled: !!worktreePath && changedFiles.length > 0 && !isStreaming,
      staleTime: 30000,
      placeholderData: (prev) => prev,
    },
  )

  // Fetch running DevSpace processes
  const { data: devspaceProcesses } = trpc.devspace.listOurProcesses.useQuery(
    undefined,
    { refetchInterval: 5000 }
  )

  // Filter changedFiles to only include files that are still uncommitted
  const uncommittedFiles = useMemo(() => {
    if (!gitStatus || !worktreePath || isStreaming) {
      return changedFiles
    }

    const uncommittedPaths = new Set<string>()
    if (gitStatus.staged) {
      for (const file of gitStatus.staged) {
        uncommittedPaths.add(file.path)
      }
    }
    if (gitStatus.unstaged) {
      for (const file of gitStatus.unstaged) {
        uncommittedPaths.add(file.path)
      }
    }
    if (gitStatus.untracked) {
      for (const file of gitStatus.untracked) {
        uncommittedPaths.add(file.path)
      }
    }

    return changedFiles.filter((file) => uncommittedPaths.has(file.displayPath))
  }, [changedFiles, gitStatus, worktreePath, isStreaming])

  // Calculate totals for changes
  const changesTotals = useMemo(() => {
    let additions = 0
    let deletions = 0
    for (const file of uncommittedFiles) {
      additions += file.additions
      deletions += file.deletions
    }
    return { additions, deletions, fileCount: uncommittedFiles.length }
  }, [uncommittedFiles])

  // Calculate counts for sections
  const todosComplete = todosData.todos.filter(t => t.status === "completed").length
  const todosTotal = todosData.todos.length
  const agentsRunning = subAgents.filter(a => a.status === "running").length
  const agentsComplete = subAgents.filter(a => a.status !== "running").length
  const agentsTotal = subAgents.length
  const tasksTotal = tasks?.length ?? 0
  const queueTotal = queue.length

  // Auto-expand queue section when item is added
  const prevQueueLengthRef = useRef(queueTotal)
  useEffect(() => {
    // If queue length increased, auto-expand the queue section
    if (queueTotal > prevQueueLengthRef.current) {
      setExpandedSection('queue')
    }
    prevQueueLengthRef.current = queueTotal
  }, [queueTotal, setExpandedSection])

  // Section click handler - expands if collapsed, switches if expanded
  const handleSectionClick = useCallback((section: SectionType) => {
    if (section === null) return
    setExpandedSection(prev => {
      // If clicking the active section, collapse it
      if (prev === section) return null
      // Otherwise expand/switch to the clicked section
      return section
    })
  }, [setExpandedSection])

  // Handle review - opens diff sidebar for changes
  const handleReview = useCallback(() => {
    const filePaths = uncommittedFiles.map((f) => f.displayPath)
    setFilteredDiffFiles(filePaths.length > 0 ? filePaths : null)
    setFilteredSubChatId(subChatId)
    setDiffSidebarOpen(true)
  }, [uncommittedFiles, subChatId, setFilteredDiffFiles, setFilteredSubChatId, setDiffSidebarOpen])

  // Handle file click - focus on specific file in diff sidebar
  const handleFileClick = useCallback((file: SubChatFileChange) => {
    const filePaths = uncommittedFiles.map((f) => f.displayPath)
    setFilteredDiffFiles(filePaths.length > 0 ? filePaths : null)
    setFocusedDiffFile(file.displayPath)
    setDiffSidebarOpen(true)
  }, [uncommittedFiles, setFilteredDiffFiles, setFocusedDiffFile, setDiffSidebarOpen])

  // Handle agent click - open dialog
  const handleAgentClick = useCallback((agent: SessionSubAgent) => {
    setSelectedAgent(agent)
    setAgentDialogOpen(true)
  }, [setSelectedAgent, setAgentDialogOpen])

  // Handle task click - open dialog
  const handleTaskClick = useCallback((task: NonNullable<typeof tasks>[number]) => {
    setSelectedTask({
      taskId: task.id,
      toolCallId: task.toolCallId,
      command: task.command || "",
      description: task.description ?? undefined,
      status: task.status as "running" | "completed" | "failed" | "unknown",
      messageId: "",
      partIndex: 0,
    })
    setTaskDialogOpen(true)
  }, [setSelectedTask, setTaskDialogOpen])

  // Handle todo click - scroll to message
  const handleTodoClick = useCallback(() => {
    if (todosData.messageId && onScrollToMessage) {
      onScrollToMessage(todosData.messageId, todosData.partIndex ?? undefined)
    }
  }, [todosData.messageId, todosData.partIndex, onScrollToMessage])

  // Don't show if nothing to display
  const hasContent = uncommittedFiles.length > 0 || tasksTotal > 0 || agentsTotal > 0 || todosTotal > 0 || queueTotal > 0
  if (!hasContent && !isStreaming) {
    return null
  }

  const isExpanded = expandedSection !== null

  return (
    <div
      className="w-[98%] mx-auto border border-border bg-muted/30 overflow-hidden flex flex-col rounded-t-xl border-b-0 pb-6"
    >
      {/* Processing status text - always shown when streaming */}
      <AnimatePresence>
        {isStreaming && currentToolStatus && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden"
          >
            <div className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-muted-foreground border-b border-border bg-muted/20">
              <Loader2 className="h-3 w-3 animate-spin text-primary" />
              <span>{currentToolStatus.statusText}<AnimatedDots /></span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header with section buttons */}
      <div className="flex items-center justify-between px-2 py-1.5">
        <div className="flex items-center gap-1 flex-1 min-w-0">
          {/* Single expand/collapse chevron */}
          <button
            onClick={() => setExpandedSection(prev => prev ? null : 'queue')}
            className="flex items-center justify-center w-6 h-6 rounded hover:bg-muted/50 transition-colors"
            aria-label={isExpanded ? "Collapse" : "Expand"}
          >
            <ChevronDown
              className={cn(
                "w-4 h-4 text-muted-foreground transition-transform duration-200",
                isExpanded && "rotate-180"
              )}
            />
          </button>

          {/* Section tabs */}
          <SectionButton
            label="Queue"
            count={queueTotal}
            isActive={expandedSection === 'queue'}
            onClick={() => handleSectionClick('queue')}
          />
          <SectionButton
            label="Changes"
            count={uncommittedFiles.length}
            countDisplay={`${changesTotals.fileCount} +${changesTotals.additions} -${changesTotals.deletions}`}
            countNode={
              <>
                {changesTotals.fileCount}{" "}
                <span className="text-emerald-600 dark:text-emerald-500">+{changesTotals.additions}</span>{" "}
                <span className="text-destructive">-{changesTotals.deletions}</span>
              </>
            }
            isActive={expandedSection === 'changes'}
            onClick={() => handleSectionClick('changes')}
          />
          <SectionButton
            label="Agents"
            count={agentsTotal}
            countDisplay={`${agentsRunning}/${agentsComplete}`}
            countNode={
              <>
                <span className={agentsRunning > 0 ? "text-primary" : ""}>{agentsRunning}</span>
                <span className="text-muted-foreground/50">/</span>
                <span className={agentsComplete > 0 ? "text-emerald-600 dark:text-emerald-500" : ""}>{agentsComplete}</span>
              </>
            }
            isActive={expandedSection === 'agents'}
            onClick={() => handleSectionClick('agents')}
          />
          <SectionButton
            label="ToDo"
            count={todosTotal}
            countDisplay={`${todosComplete}/${todosTotal}`}
            countNode={
              <>
                <span className={todosComplete > 0 ? "text-emerald-600 dark:text-emerald-500" : ""}>{todosComplete}</span>
                <span className="text-muted-foreground/50">/</span>
                <span>{todosTotal}</span>
              </>
            }
            isActive={expandedSection === 'todos'}
            onClick={() => handleSectionClick('todos')}
          />
        </div>

        {/* Right side: buttons */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {/* Stop button */}
          {isStreaming && onStop && (
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation()
                onStop()
              }}
              className="h-6 px-2 text-xs font-normal rounded-md transition-transform duration-150 active:scale-[0.97]"
            >
              Stop
              <span className="text-muted-foreground/60 ml-1">⌃C</span>
            </Button>
          )}

          {/* Review button for changes */}
          {uncommittedFiles.length > 0 && !isStreaming && (
            <Button
              variant="secondary"
              size="sm"
              onClick={(e) => {
                e.stopPropagation()
                handleReview()
              }}
              className="h-6 px-3 text-xs font-medium rounded-md transition-transform duration-150 active:scale-[0.97]"
            >
              Review
            </Button>
          )}
        </div>
      </div>

      {/* Expanded content */}
      <AnimatePresence initial={false}>
        {expandedSection && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
            className="overflow-hidden"
          >
            <div className="border-t border-border max-h-[200px] overflow-y-auto">
              {/* Queue list */}
              {expandedSection === 'queue' && queue.map((item) => (
                <QueueItemRow
                  key={item.id}
                  item={item}
                  onRemove={onRemoveFromQueue}
                  onSendNow={onSendFromQueue}
                />
              ))}

              {/* Changes list */}
              {expandedSection === 'changes' && uncommittedFiles.map((file) => {
                const FileIcon = getFileIconByExtension(file.displayPath)
                return (
                  <div
                    key={file.filePath}
                    role="button"
                    tabIndex={0}
                    onClick={() => handleFileClick(file)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault()
                        handleFileClick(file)
                      }
                    }}
                    aria-label={`View diff for ${file.displayPath}`}
                    className="flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-muted/50 transition-colors cursor-pointer focus:outline-none rounded-sm"
                  >
                    {FileIcon && (
                      <FileIcon className="w-4 h-4 flex-shrink-0 text-muted-foreground" />
                    )}
                    <span className="truncate flex-1 text-foreground">
                      {file.displayPath}
                    </span>
                    <span className="flex-shrink-0 text-emerald-600 dark:text-emerald-500">
                      +{file.additions}
                    </span>
                    <span className="flex-shrink-0 text-destructive">
                      -{file.deletions}
                    </span>
                  </div>
                )
              })}

              {/* Agents list */}
              {expandedSection === 'agents' && subAgents.map((agent) => (
                <div
                  key={agent.agentId}
                  className="flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-muted/50 transition-colors cursor-pointer"
                  onClick={() => handleAgentClick(agent)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault()
                      handleAgentClick(agent)
                    }
                  }}
                >
                  <SubAgentStatusIcon status={agent.status} />
                  <span className="truncate flex-1">
                    {agent.description}
                  </span>
                  <span className={cn(
                    "text-[10px] capitalize px-1.5 py-0.5 rounded",
                    agent.status === "running" && "bg-primary/10 text-primary",
                    agent.status === "completed" && "bg-emerald-500/10 text-emerald-600 dark:text-emerald-500",
                    agent.status === "failed" && "bg-destructive/10 text-destructive"
                  )}>
                    {agent.status}
                  </span>
                </div>
              ))}

              {/* Todos list */}
              {expandedSection === 'todos' && todosData.todos.map((todo, idx) => (
                <div
                  key={idx}
                  className="flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-muted/50 transition-colors cursor-pointer"
                  onClick={handleTodoClick}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault()
                      handleTodoClick()
                    }
                  }}
                >
                  <TodoStatusIcon status={todo.status} />
                  <span
                    className={cn(
                      "truncate flex-1",
                      todo.status === "completed" && "line-through text-muted-foreground"
                    )}
                  >
                    {todo.status === "in_progress" && todo.activeForm
                      ? todo.activeForm
                      : todo.content}
                  </span>
                </div>
              ))}

              {/* Empty state messages */}
              {expandedSection === 'queue' && queue.length === 0 && (
                <div className="px-3 py-2 text-xs text-muted-foreground">No messages in queue</div>
              )}
              {expandedSection === 'changes' && uncommittedFiles.length === 0 && (
                <div className="px-3 py-2 text-xs text-muted-foreground">No uncommitted changes</div>
              )}
              {expandedSection === 'agents' && subAgents.length === 0 && (
                <div className="px-3 py-2 text-xs text-muted-foreground">No sub-agents</div>
              )}
              {expandedSection === 'todos' && todosData.todos.length === 0 && (
                <div className="px-3 py-2 text-xs text-muted-foreground">No todos</div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* DevSpace status footer */}
      {devspaceProcesses && devspaceProcesses.length > 0 && (
        <div className="flex items-center gap-2 px-3 py-1.5 border-t border-border bg-muted/10 text-[10px] text-muted-foreground">
          <span className="font-medium">DevSpace:</span>
          {devspaceProcesses.map((proc, idx) => (
            <span key={proc.pid} className="flex items-center gap-1">
              <Circle className="w-2 h-2 fill-emerald-500 text-emerald-500" />
              <span>{proc.serviceName || proc.workingDir.split('/').pop()}</span>
              {idx < devspaceProcesses.length - 1 && <span className="text-muted-foreground/50">,</span>}
            </span>
          ))}
        </div>
      )}
    </div>
  )
})
