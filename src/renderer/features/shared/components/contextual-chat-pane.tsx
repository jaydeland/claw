"use client"

import { memo, useCallback, useEffect, useRef, useState } from "react"
import { Send, Loader2, Sparkles, RefreshCw, MessageSquare } from "lucide-react"
import { Button } from "../../../components/ui/button"
import { cn } from "../../../lib/utils"
import { trpc } from "../../../lib/trpc"
import { MemoizedMarkdown } from "../../../components/chat-markdown-renderer"

interface ChatMessage {
  id: string
  role: "user" | "assistant"
  content: string
  timestamp: Date
}

export interface ContextualChatPaneProps {
  chatId: string | null
  subChatId: string | null
  projectId: string
  projectPath: string
  isSessionLoading: boolean
  onReset: () => Promise<{ chatId: string; subChatId: string } | void>
  onCreate: () => Promise<{ chatId: string; subChatId: string } | void>
  placeholder?: string
  /** Optional extra context prepended to the first message */
  systemContext?: string
}

export const ContextualChatPane = memo(function ContextualChatPane({
  chatId,
  subChatId,
  projectId,
  projectPath,
  isSessionLoading,
  onReset,
  onCreate,
  placeholder = "Ask Claude...",
  systemContext,
}: ContextualChatPaneProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState("")
  const [isStreaming, setIsStreaming] = useState(false)
  const [streamingContent, setStreamingContent] = useState("")
  const [pendingPrompt, setPendingPrompt] = useState<string | null>(null)
  const [activeChatId, setActiveChatId] = useState<string | null>(null)
  const [activeSubChatId, setActiveSubChatId] = useState<string | null>(null)
  const [isResetting, setIsResetting] = useState(false)
  const streamingTextRef = useRef("")
  const scrollRef = useRef<HTMLDivElement>(null)
  const messagesRef = useRef<ChatMessage[]>([])
  const activeSubChatIdRef = useRef<string | null>(null)

  // Keep refs in sync to avoid stale closures in subscription callbacks
  useEffect(() => { messagesRef.current = messages }, [messages])
  useEffect(() => { activeSubChatIdRef.current = activeSubChatId }, [activeSubChatId])

  // Track previous chatId to detect when context changes
  const prevChatIdRef = useRef<string | null>(null)

  // Sync active IDs from props, and reload messages when chatId changes
  useEffect(() => {
    if (chatId !== prevChatIdRef.current) {
      prevChatIdRef.current = chatId
      setActiveChatId(chatId)
      setActiveSubChatId(subChatId)
      // Clear local state when context changes
      setMessages([])
      setIsStreaming(false)
      setStreamingContent("")
      streamingTextRef.current = ""
      setPendingPrompt(null)
    }
  }, [chatId, subChatId])

  const utils = trpc.useUtils()
  const updateMessagesMutation = trpc.chats.updateSubChatMessages.useMutation({
    onSuccess: () => {
      // Invalidate so navigating back always returns fresh persisted messages
      if (activeChatId) {
        utils.chats.get.invalidate({ id: activeChatId })
      }
    },
  })

  // Load persisted messages from DB when chatId becomes available
  const { data: chatData } = trpc.chats.get.useQuery(
    { id: chatId! },
    { enabled: !!chatId },
  )

  useEffect(() => {
    if (!chatData?.subChats?.[0]?.messages) return
    if (isStreaming) return // Don't overwrite local state while streaming
    try {
      const persisted = JSON.parse(chatData.subChats[0].messages) as Array<{
        role: "user" | "assistant"
        content: string | Array<{ type: string; text?: string }>
        id?: string
        timestamp?: string
      }>
      if (persisted.length === 0) return
      const mapped: ChatMessage[] = persisted
        .filter(m => m.role === "user" || m.role === "assistant")
        .map((m, i) => ({
          id: m.id ?? `persisted-${i}`,
          role: m.role,
          content: typeof m.content === "string"
            ? m.content
            : m.content.filter((c: any) => c.type === "text").map((c: any) => c.text ?? "").join(""),
          timestamp: m.timestamp ? new Date(m.timestamp) : new Date(),
        }))
      if (mapped.length > 0) {
        setMessages(mapped)
      }
    } catch {
      // Invalid JSON, skip
    }
  // Depend on the messages string so that background refetches (after cache invalidation)
  // also trigger the load, not just initial chatData arrival
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatData?.subChats?.[0]?.messages])

  // Subscribe to Claude stream
  trpc.claude.chat.useSubscription(
    {
      subChatId: activeSubChatId ?? "__none__",
      chatId: activeChatId ?? "__none__",
      prompt: pendingPrompt ?? "",
      cwd: projectPath,
      projectPath,
      mode: "agent",
    },
    {
      enabled: !!activeSubChatId && !!activeChatId && !!pendingPrompt,
      onData: (chunk) => {
        if (chunk.type === "text-delta") {
          streamingTextRef.current += chunk.delta
          setStreamingContent(streamingTextRef.current)
        } else if (chunk.type === "finish") {
          if (streamingTextRef.current) {
            const finalContent = streamingTextRef.current
            const assistantMsg: ChatMessage = { id: Date.now().toString(), role: "assistant" as const, content: finalContent, timestamp: new Date() }
            const updatedMessages = [...messagesRef.current, assistantMsg]
            setMessages(updatedMessages)
            if (activeSubChatIdRef.current) {
              updateMessagesMutation.mutate({
                id: activeSubChatIdRef.current,
                messages: JSON.stringify(updatedMessages.map(m => ({
                  id: m.id,
                  role: m.role,
                  content: m.content,
                  timestamp: m.timestamp.toISOString(),
                }))),
              })
            }
          }
          streamingTextRef.current = ""
          setStreamingContent("")
          setPendingPrompt(null)
          setIsStreaming(false)
        } else if (chunk.type === "error" || chunk.type === "auth-error") {
          const errorMsg = (chunk as any).errorText || "An error occurred"
          setMessages((prev) => [
            ...prev,
            { id: Date.now().toString(), role: "assistant" as const, content: `Error: ${errorMsg}`, timestamp: new Date() },
          ])
          streamingTextRef.current = ""
          setStreamingContent("")
          setPendingPrompt(null)
          setIsStreaming(false)
        }
      },
      onError: (err) => {
        setMessages((prev) => [
          ...prev,
          { id: Date.now().toString(), role: "assistant" as const, content: `Error: ${err.message}`, timestamp: new Date() },
        ])
        streamingTextRef.current = ""
        setStreamingContent("")
        setPendingPrompt(null)
        setIsStreaming(false)
      },
    }
  )

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages, streamingContent])

  const buildPrompt = useCallback((userInput: string): string => {
    if (!systemContext || messages.length > 0) return userInput
    return `${systemContext}\n\n---\n\nUser: ${userInput}`
  }, [systemContext, messages.length])

  const sendMessage = useCallback(async (userInput: string, chatIdOverride?: string | null, subChatIdOverride?: string | null) => {
    const useChat = chatIdOverride ?? activeChatId
    const useSubChat = subChatIdOverride ?? activeSubChatId
    if (!useChat || !useSubChat) return

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: "user",
      content: userInput,
      timestamp: new Date(),
    }
    setMessages((prev) => [...prev, userMessage])

    let prompt = buildPrompt(userInput)
    if (messages.length > 0 && !chatIdOverride) {
      // Include conversation history for follow-ups
      const historyText = messages
        .map((m) => `${m.role === "user" ? "Human" : "Assistant"}: ${m.content}`)
        .join("\n\n")
      prompt = `<conversation_history>\n${historyText}\n</conversation_history>\n\nHuman: ${userInput}`
    }

    setActiveChatId(useChat)
    setActiveSubChatId(useSubChat)
    streamingTextRef.current = ""
    setStreamingContent("")
    setIsStreaming(true)
    setPendingPrompt(prompt)
  }, [activeChatId, activeSubChatId, messages, buildPrompt])

  const handleSend = useCallback(async () => {
    if (!input.trim() || isStreaming) return
    const userInput = input.trim()
    setInput("")

    if (!activeChatId) {
      // No session yet — create one first
      const result = await onCreate()
      const newChatId = result?.chatId ?? activeChatId
      const newSubChatId = result?.subChatId ?? activeSubChatId
      setActiveChatId(newChatId)
      setActiveSubChatId(newSubChatId)
      await sendMessage(userInput, newChatId ?? undefined, newSubChatId ?? undefined)
    } else {
      await sendMessage(userInput)
    }
  }, [input, isStreaming, activeChatId, activeSubChatId, onCreate, sendMessage])

  const handleReset = useCallback(async () => {
    setIsResetting(true)
    setMessages([])
    setIsStreaming(false)
    setStreamingContent("")
    streamingTextRef.current = ""
    setPendingPrompt(null)
    setActiveChatId(null)
    setActiveSubChatId(null)
    try {
      await onReset()
    } finally {
      setIsResetting(false)
    }
  }, [onReset])

  if (!projectId) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center text-muted-foreground">
          <Sparkles className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">Select a workspace to enable AI chat</p>
        </div>
      </div>
    )
  }

  const canSend = !isStreaming && !isResetting && !!input.trim()

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Header */}
      <div className="px-4 py-2 border-b border-border flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">AI Assistant</span>
        </div>
        {activeChatId && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleReset}
            disabled={isStreaming || isResetting}
            className="text-xs h-7 px-2"
          >
            <RefreshCw className={cn("h-3 w-3 mr-1", isResetting && "animate-spin")} />
            New Chat
          </Button>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto" ref={scrollRef}>
        <div className="p-4 space-y-4">
          {messages.length === 0 && !isStreaming && (
            <div className="text-center text-muted-foreground py-8">
              <Sparkles className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">{isSessionLoading ? "Loading..." : "Start a conversation"}</p>
            </div>
          )}

          {messages.map((message) => (
            <div
              key={message.id}
              className={cn("flex", message.role === "user" ? "justify-end" : "justify-start")}
            >
              <div
                className={cn(
                  "max-w-[85%] rounded-lg px-3 py-2 text-sm",
                  message.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted",
                )}
              >
                {message.role === "assistant" ? (
                  <MemoizedMarkdown content={message.content} id={message.id} size="sm" />
                ) : (
                  message.content
                )}
              </div>
            </div>
          ))}

          {isStreaming && (
            <div className="flex justify-start">
              <div className="max-w-[85%] rounded-lg px-3 py-2 text-sm bg-muted">
                {streamingContent ? (
                  <MemoizedMarkdown content={streamingContent} id="streaming" size="sm" />
                ) : (
                  <Loader2 className="h-4 w-4 animate-spin" />
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Input */}
      <div className="p-4 border-t border-border flex-shrink-0">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
            placeholder={isStreaming ? "Waiting for response..." : placeholder}
            className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
            disabled={isStreaming || isResetting}
          />
          <Button size="icon" onClick={handleSend} disabled={!canSend}>
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  )
})
