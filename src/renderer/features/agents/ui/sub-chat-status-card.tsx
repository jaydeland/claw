"use client"

import { memo, useState, useMemo, useEffect, useCallback } from "react"
import { useSetAtom, useAtom, useAtomValue } from "jotai"
import { atomWithStorage } from "jotai/utils"
import { ChevronDown, Bot, ListTodo, Terminal, FileCode, Loader2, Square, X } from "lucide-react"
import { motion, AnimatePresence } from "motion/react"
import { Button } from "../../../components/ui/button"
import { cn } from "../../../lib/utils"
import { trpc } from "../../../lib/trpc"
import { useFileChangeListener } from "../../../lib/hooks/use-file-change-listener"
import { getFileIconByExtension } from "../mentions/agents-file-mention"
import { CheckIcon, IconSpinner, IconArrowRight } from "../../../components/ui/icons"
import { toast } from "sonner"
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

// Persistent expanded section atom - only one section can be expanded at a time
const statusBarSectionAtom = atomWithStorage<'changes' | 'tasks' | 'agents' | 'todos' | null>(
  'status-bar-expanded-section',
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
          className="w-3 h-3 rounded-full bg-green-500/10 flex items-center justify-center flex-shrink-0"
          style={{ border: "0.5px solid hsl(142 76% 36%)" }}
        >
          <CheckIcon className="w-1.5 h-1.5 text-green-600 dark:text-green-500" />
        </div>
      )
    case "failed":
      return (
        <div
          className="w-3 h-3 rounded-full bg-red-500/10 flex items-center justify-center flex-shrink-0"
          style={{ border: "0.5px solid hsl(0 84% 60%)" }}
        >
          <X className="w-1.5 h-1.5 text-red-600 dark:text-red-500" />
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
          className="w-3 h-3 rounded-full bg-green-500/10 flex items-center justify-center flex-shrink-0"
          style={{ border: "0.5px solid hsl(142 76% 36%)" }}
        >
          <CheckIcon className="w-1.5 h-1.5 text-green-600 dark:text-green-500" />
        </div>
      )
    case "failed":
      return (
        <div
          className="w-3 h-3 rounded-full bg-red-500/10 flex items-center justify-center flex-shrink-0"
          style={{ border: "0.5px solid hsl(0 84% 60%)" }}
        >
          <X className="w-1.5 h-1.5 text-red-600 dark:text-red-500" />
        </div>
      )
    case "running":
      return (
        <div className="w-3 h-3 rounded-full bg-blue-500/10 flex items-center justify-center flex-shrink-0">
          <Loader2 className="w-1.5 h-1.5 text-blue-500 animate-spin" />
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

// Section button component
const SectionButton = memo(function SectionButton({
  icon: Icon,
  label,
  count,
  countDetail,
  isActive,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  count: number
  countDetail?: string
  isActive: boolean
  onClick: () => void
}) {
  if (count === 0) return null

  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 px-2 py-1 rounded-md text-xs transition-colors",
        isActive
          ? "bg-muted text-foreground"
          : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
      )}
    >
      <Icon className="w-3.5 h-3.5" />
      <span>{label}</span>
      {countDetail && (
        <span className="text-[10px] opacity-70">
          ({countDetail})
        </span>
      )}
      <ChevronDown
        className={cn(
          "w-3 h-3 transition-transform duration-200",
          isActive && "rotate-180"
        )}
      />
    </button>
  )
})

interface SubChatStatusCardProps {
  chatId: string // Parent chat ID for per-chat diff sidebar state
  subChatId: string // Sub-chat ID for filtering (used when Review is clicked)
  isStreaming: boolean
  isCompacting?: boolean
  changedFiles: SubChatFileChange[]
  worktreePath?: string | null // For git status check to hide committed files
  onStop?: () => void
  onScrollToMessage?: (messageId: string, partIndex?: number) => void
  /** Whether there's a queue card above this one - affects border radius */
  hasQueueCardAbove?: boolean
}

export const SubChatStatusCard = memo(function SubChatStatusCard({
  chatId,
  subChatId,
  isStreaming,
  isCompacting,
  changedFiles,
  worktreePath,
  onStop,
  onScrollToMessage,
  hasQueueCardAbove = false,
}: SubChatStatusCardProps) {
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

  // Calculate counts for other sections
  const todosRunning = todosData.todos.filter(t => t.status === "in_progress").length
  const todosComplete = todosData.todos.filter(t => t.status === "completed").length
  const todosPending = todosData.todos.filter(t => t.status === "pending").length
  const todosTotal = todosData.todos.length

  const agentsRunning = subAgents.filter(a => a.status === "running").length
  const agentsComplete = subAgents.filter(a => a.status !== "running").length
  const agentsTotal = subAgents.length

  const tasksRunning = tasks?.filter(t => t.status === "running").length ?? 0
  const tasksComplete = tasks?.filter(t => t.status !== "running").length ?? 0
  const tasksTotal = tasks?.length ?? 0

  // Section toggle handlers
  const handleSectionClick = useCallback((section: 'changes' | 'tasks' | 'agents' | 'todos') => {
    setExpandedSection(prev => prev === section ? null : section)
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
      description: task.description,
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
  const hasContent = uncommittedFiles.length > 0 || tasksTotal > 0 || agentsTotal > 0 || todosTotal > 0
  if (!hasContent && !isStreaming) {
    return null
  }

  // Build count detail strings
  const changesDetail = changesTotals.fileCount > 0
    ? `${changesTotals.fileCount} files +${changesTotals.additions} -${changesTotals.deletions}`
    : undefined
  const tasksDetail = tasksTotal > 0
    ? tasksRunning > 0 ? `${tasksRunning} running` : `${tasksComplete} done`
    : undefined
  const agentsDetail = agentsTotal > 0
    ? agentsRunning > 0 ? `${agentsRunning} running` : `${agentsComplete} done`
    : undefined
  const todosDetail = todosTotal > 0
    ? `${todosPending + todosRunning}/${todosTotal}`
    : undefined

  return (
    <div
      className={cn(
        "border border-border bg-muted/30 overflow-hidden flex flex-col border-b-0 pb-6",
        hasQueueCardAbove ? "rounded-none" : "rounded-t-xl"
      )}
    >
      {/* Header with section buttons */}
      <div className="flex items-center justify-between px-2 py-1.5">
        <div className="flex items-center gap-1 flex-1 min-w-0">
          {/* Streaming indicator */}
          {isStreaming && (
            <span className="text-xs text-muted-foreground px-2">
              {isCompacting ? "Compacting" : "Generating"}<AnimatedDots />
            </span>
          )}

          {/* Section buttons */}
          {!isStreaming && (
            <>
              <SectionButton
                icon={FileCode}
                label="Changes"
                count={uncommittedFiles.length}
                countDetail={changesDetail}
                isActive={expandedSection === 'changes'}
                onClick={() => handleSectionClick('changes')}
              />
              <SectionButton
                icon={Terminal}
                label="Tasks"
                count={tasksTotal}
                countDetail={tasksDetail}
                isActive={expandedSection === 'tasks'}
                onClick={() => handleSectionClick('tasks')}
              />
              <SectionButton
                icon={Bot}
                label="Agents"
                count={agentsTotal}
                countDetail={agentsDetail}
                isActive={expandedSection === 'agents'}
                onClick={() => handleSectionClick('agents')}
              />
              <SectionButton
                icon={ListTodo}
                label="Todos"
                count={todosTotal}
                countDetail={todosDetail}
                isActive={expandedSection === 'todos'}
                onClick={() => handleSectionClick('todos')}
              />
            </>
          )}
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
                    <span className="flex-shrink-0 text-green-600 dark:text-green-400">
                      +{file.additions}
                    </span>
                    <span className="flex-shrink-0 text-red-600 dark:text-red-400">
                      -{file.deletions}
                    </span>
                  </div>
                )
              })}

              {/* Tasks list */}
              {expandedSection === 'tasks' && tasks?.map((task) => (
                <div
                  key={task.id}
                  className="flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-muted/50 transition-colors cursor-pointer"
                  onClick={() => handleTaskClick(task)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault()
                      handleTaskClick(task)
                    }
                  }}
                >
                  <TaskStatusIcon status={task.status} />
                  <span className="truncate flex-1 font-mono text-[11px]">
                    {task.command || `Task ${task.id.slice(0, 8)}`}
                  </span>
                  <span className={cn(
                    "text-[10px] capitalize px-1.5 py-0.5 rounded",
                    task.status === "running" && "bg-blue-500/10 text-blue-500",
                    task.status === "completed" && "bg-green-500/10 text-green-500",
                    task.status === "failed" && "bg-red-500/10 text-red-500"
                  )}>
                    {task.status}
                  </span>
                  {task.status === "running" && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-5 w-5 p-0 text-red-500 hover:text-red-600 hover:bg-red-500/10"
                      onClick={(e) => {
                        e.stopPropagation()
                        killMutation.mutate({ taskId: task.id })
                      }}
                      title="Stop task"
                    >
                      <Square className="h-2.5 w-2.5" />
                    </Button>
                  )}
                </div>
              ))}

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
                    agent.status === "running" && "bg-blue-500/10 text-blue-500",
                    agent.status === "completed" && "bg-green-500/10 text-green-500",
                    agent.status === "failed" && "bg-red-500/10 text-red-500"
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
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
})
