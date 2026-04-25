"use client"

import { memo, useCallback } from "react"
import { useAtomValue } from "jotai"
import { cn } from "@/lib/utils"
import { CheckIcon, IconArrowRight, IconSpinner } from "@/components/ui/icons"
import { Badge } from "@/components/ui/badge"
import { sessionFlowTodosAtom, type SessionTodoItem } from "../atoms"

interface SessionFlowTodosProps {
  onScrollToMessage: (messageId: string, partIndex?: number) => void
}

// Status icon component matching AgentTodoTool style
const TodoStatusIcon = memo(function TodoStatusIcon({
  status,
}: {
  status: SessionTodoItem["status"]
}) {
  switch (status) {
    case "completed":
      return (
        <div
          className="w-3.5 h-3.5 rounded-full bg-muted flex items-center justify-center flex-shrink-0"
          style={{ border: "0.5px solid hsl(var(--border))" }}
        >
          <CheckIcon className="w-2 h-2 text-muted-foreground" />
        </div>
      )
    case "in_progress":
      return (
        <div className="w-3.5 h-3.5 rounded-full bg-foreground flex items-center justify-center flex-shrink-0">
          <IconArrowRight className="w-2 h-2 text-background" />
        </div>
      )
    default:
      return (
        <div
          className="w-3.5 h-3.5 rounded-full flex items-center justify-center flex-shrink-0"
          style={{ border: "0.5px solid hsl(var(--muted-foreground) / 0.3)" }}
        />
      )
  }
})

// Individual todo item component
const TodoItem = memo(function TodoItem({
  todo,
  isLast,
  onClick,
}: {
  todo: SessionTodoItem
  isLast: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-2 px-2.5 py-1.5 text-left",
        "hover:bg-muted/50 transition-colors cursor-pointer",
        !isLast && "border-b border-border/30"
      )}
    >
      <TodoStatusIcon status={todo.status} />
      <span
        className={cn(
          "text-xs truncate flex-1",
          todo.status === "completed"
            ? "line-through text-muted-foreground"
            : todo.status === "pending"
              ? "text-muted-foreground"
              : "text-foreground"
        )}
      >
        {todo.status === "in_progress" && todo.activeForm
          ? todo.activeForm
          : todo.content}
      </span>
    </button>
  )
})

export const SessionFlowTodos = memo(function SessionFlowTodos({
  onScrollToMessage,
}: SessionFlowTodosProps) {
  const { todos, messageId, partIndex } = useAtomValue(sessionFlowTodosAtom)

  const handleTodoClick = useCallback(() => {
    if (messageId) {
      onScrollToMessage(messageId, partIndex ?? undefined)
    }
  }, [messageId, partIndex, onScrollToMessage])

  const completedCount = todos.filter((t) => t.status === "completed").length
  const totalCount = todos.length

  if (totalCount === 0) {
    return (
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="flex items-center gap-2 px-2.5 py-1.5 border-b border-border/50 flex-shrink-0">
          <span className="text-xs font-medium">Session Todos</span>
          <Badge variant="secondary" className="h-4 px-1.5 text-[10px]">
            0
          </Badge>
        </div>

        {/* Empty state */}
        <div className="flex-1 flex items-center justify-center text-xs text-muted-foreground px-4 text-center">
          No todos yet. Claude will create todos when planning work.
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-2 px-2.5 py-1.5 border-b border-border/50 flex-shrink-0">
        <span className="text-xs font-medium">Session Todos</span>
        <Badge variant="secondary" className="h-4 px-1.5 text-[10px]">
          {completedCount}/{totalCount}
        </Badge>
      </div>

      {/* Todo list */}
      <div className="flex-1 overflow-y-auto">
        {todos.map((todo, idx) => (
          <TodoItem
            key={idx}
            todo={todo}
            isLast={idx === todos.length - 1}
            onClick={handleTodoClick}
          />
        ))}
      </div>
    </div>
  )
})
