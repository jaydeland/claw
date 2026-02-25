/**
 * useContextualChat — shared hook for per-context persistent chat sessions.
 *
 * Each view (GitHub, Prompts, Skills, Commands) can use this to get a
 * chat session scoped to a specific context key. The hook:
 *  - Queries the DB for an existing active chat via chats.getBySource
 *  - Exposes create() and reset() mutations
 *  - Auto-updates when sourceView/sourceContext/projectId change
 */
import { useMemo } from "react"
import { trpc } from "../../../lib/trpc"

export type SourceView = "github" | "prompts" | "skills" | "commands"

interface UseContextualChatOptions {
  sourceView: SourceView
  /** Plain object that uniquely identifies the chat context. Will be JSON.stringify'd. */
  sourceContext: Record<string, unknown>
  projectId: string
  chatName?: string
  mode?: "plan" | "agent"
  model?: string
  /** Only query/create when true (e.g. when a selection is made) */
  enabled?: boolean
}

interface UseContextualChatResult {
  chatId: string | null
  subChatId: string | null
  isLoading: boolean
  create: () => Promise<{ chatId: string; subChatId: string }>
  reset: () => Promise<{ chatId: string; subChatId: string }>
}

export function useContextualChat({
  sourceView,
  sourceContext,
  projectId,
  chatName,
  mode = "agent",
  model = "sonnet",
  enabled = true,
}: UseContextualChatOptions): UseContextualChatResult {
  // Stable JSON string used as the DB lookup key
  const contextKey = useMemo(() => JSON.stringify(sourceContext), [sourceContext])

  const utils = trpc.useUtils()

  const queryEnabled = enabled && !!projectId && !!contextKey

  const { data, isLoading } = trpc.chats.getBySource.useQuery(
    { sourceView, sourceContext: contextKey, projectId },
    { enabled: queryEnabled },
  )

  const createMutation = trpc.chats.createWithSource.useMutation({
    onSuccess: () => {
      utils.chats.getBySource.invalidate({ sourceView, sourceContext: contextKey, projectId })
      utils.chats.list.invalidate({ projectId, sourceView })
    },
  })

  const resetMutation = trpc.chats.resetSource.useMutation({
    onSuccess: () => {
      utils.chats.getBySource.invalidate({ sourceView, sourceContext: contextKey, projectId })
      utils.chats.list.invalidate({ projectId, sourceView })
    },
  })

  const chatId = data?.chat?.id ?? null
  const subChatId = data?.subChat?.id ?? null

  const create = async (): Promise<{ chatId: string; subChatId: string }> => {
    return createMutation.mutateAsync({
      projectId,
      name: chatName,
      sourceView,
      sourceContext: contextKey,
      mode,
      model,
    })
  }

  const reset = async (): Promise<{ chatId: string; subChatId: string }> => {
    if (chatId) {
      return resetMutation.mutateAsync({
        chatIdToArchive: chatId,
        projectId,
        name: chatName,
        sourceView,
        sourceContext: contextKey,
        mode,
        model,
      })
    }
    // No existing chat — just create
    return create()
  }

  return { chatId, subChatId, isLoading, create, reset }
}
