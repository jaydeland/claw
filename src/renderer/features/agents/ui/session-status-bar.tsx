"use client"

import { memo, useState, useCallback, useEffect, useMemo } from "react"
import { useAtom, useAtomValue, useSetAtom } from "jotai"
import { atomWithStorage } from "jotai/utils"
import { ChevronDown, Bot, ListTodo, Terminal, Loader2, Square } from "lucide-react"
import { motion, AnimatePresence } from "motion/react"
import { cn } from "../../../lib/utils"
import { trpc } from "../../../lib/trpc"
import { Button } from "../../../components/ui/button"
import { CheckIcon, IconSpinner, IconArrowRight } from "../../../components/ui/icons"
import { X } from "lucide-react"
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
import { selectedAgentChatIdAtom } from "../atoms"
import { toast } from "sonner"

// Persistent expanded state atoms
const tasksExpandedAtom = atomWithStorage("session-status-tasks-expanded", false)
const agentsExpandedAtom = atomWithStorage("session-status-agents-expanded", false)
const todosExpandedAtom = atomWithStorage("session-status-todos-expanded", false)

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
  runningCount,
  completeCount,
  isExpanded,
  onClick,
  isActive,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  runningCount: number
  completeCount: number
  isExpanded: boolean
  onClick: () => void
  isActive: boolean
}) {
  const total = runningCount + completeCount
  if (total === 0) return null

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
      <span className="text-[10px] opacity-70">
        ({runningCount > 0 ? `${runningCount} running` : `${completeCount} done`})
      </span>
      <ChevronDown
        className={cn(
          "w-3 h-3 transition-transform duration-200",
          isExpanded && "rotate-180"
        )}
      />
    </button>
  )
})

interface SessionStatusBarProps {
  onScrollToMessage?: (messageId: string, partIndex?: number) => void
  hasQueueCardAbove?: boolean
  hasStatusCardBelow?: boolean
}

export const SessionStatusBar = memo(function SessionStatusBar({
  onScrollToMessage,
  hasQueueCardAbove = false,
  hasStatusCardBelow = false,
}: SessionStatusBarProps) {
  const chatId = useAtomValue(selectedAgentChatIdAtom)
  const [tasksExpanded, setTasksExpanded] = useAtom(tasksExpandedAtom)
  const [agentsExpanded, setAgentsExpanded] = useAtom(agentsExpandedAtom)
  const [todosExpanded, setTodosExpanded] = useAtom(todosExpandedAtom)

  // Get data from atoms
  const todosData = useAtomValue(sessionFlowTodosAtom)
  const subAgents = useAtomValue(sessionFlowSubAgentsAtom)

  // Get tasks from tRPC
  const { data: tasks, refetch } = trpc.tasks.listByChat.useQuery(
    { chatId: chatId || "" },
    { enabled: !!chatId, refetchInterval: 5000 }
  )

  // Kill task mutation
  const killMutation = trpc.tasks.killTask.useMutation({
    onSuccess: (result) => {
      if (result.killed) {
        toast.success("Task stopped")
      }
      refetch()
    },
    onError: (error) => {
      toast.error(`Failed to stop task: ${error.message}`)
    },
  })

  // Dialog setters
  const setSelectedAgent = useSetAtom(selectedSubAgentAtom)
  const setAgentDialogOpen = useSetAtom(subAgentOutputDialogOpenAtom)
  const setSelectedTask = useSetAtom(selectedBackgroundTaskAtom)
  const setTaskDialogOpen = useSetAtom(backgroundTaskOutputDialogOpenAtom)

  // Calculate counts
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

  // Determine which section is active
  const activeSection = tasksExpanded ? "tasks" : agentsExpanded ? "agents" : todosExpanded ? "todos" : null

  // Handle section toggles - only one can be expanded at a time
  const handleTasksClick = useCallback(() => {
    setTasksExpanded(!tasksExpanded)
    if (!tasksExpanded) {
      setAgentsExpanded(false)
      setTodosExpanded(false)
    }
  }, [tasksExpanded, setTasksExpanded, setAgentsExpanded, setTodosExpanded])

  const handleAgentsClick = useCallback(() => {
    setAgentsExpanded(!agentsExpanded)
    if (!agentsExpanded) {
      setTasksExpanded(false)
      setTodosExpanded(false)
    }
  }, [agentsExpanded, setAgentsExpanded, setTasksExpanded, setTodosExpanded])

  const handleTodosClick = useCallback(() => {
    setTodosExpanded(!todosExpanded)
    if (!todosExpanded) {
      setTasksExpanded(false)
      setAgentsExpanded(false)
    }
  }, [todosExpanded, setTodosExpanded, setTasksExpanded, setAgentsExpanded])

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

  // Don't render if nothing to show
  const hasContent = todosTotal > 0 || agentsTotal > 0 || tasksTotal > 0
  if (!hasContent) return null

  return (
    <div
      className={cn(
        "border border-border bg-muted/30 overflow-hidden flex flex-col border-b-0 pb-6",
        hasQueueCardAbove ? "rounded-none" : "rounded-t-xl",
        hasStatusCardBelow && "pb-0"
      )}
    >
      {/* Header buttons */}
      <div className="flex items-center gap-1 px-2 py-1.5">
        {tasksTotal > 0 && (
          <SectionButton
            icon={Terminal}
            label="Tasks"
            runningCount={tasksRunning}
            completeCount={tasksComplete}
            isExpanded={tasksExpanded}
            onClick={handleTasksClick}
            isActive={activeSection === "tasks"}
          />
        )}
        {agentsTotal > 0 && (
          <SectionButton
            icon={Bot}
            label="Agents"
            runningCount={agentsRunning}
            completeCount={agentsComplete}
            isExpanded={agentsExpanded}
            onClick={handleAgentsClick}
            isActive={activeSection === "agents"}
          />
        )}
        {todosTotal > 0 && (
          <SectionButton
            icon={ListTodo}
            label="Todos"
            runningCount={todosRunning + todosPending}
            completeCount={todosComplete}
            isExpanded={todosExpanded}
            onClick={handleTodosClick}
            isActive={activeSection === "todos"}
          />
        )}
      </div>

      {/* Expanded content */}
      <AnimatePresence initial={false}>
        {activeSection && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
            className="overflow-hidden"
          >
            <div className="border-t border-border max-h-[200px] overflow-y-auto">
              {/* Tasks list */}
              {activeSection === "tasks" && tasks?.map((task) => (
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
              {activeSection === "agents" && subAgents.map((agent) => (
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
              {activeSection === "todos" && todosData.todos.map((todo, idx) => (
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
