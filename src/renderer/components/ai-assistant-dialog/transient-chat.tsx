"use client"

import React, { useState, useRef, useEffect, useCallback } from "react"
import { Button } from "../ui/button"
import { Input } from "../ui/input"
import { trpc } from "../../lib/trpc"
import { toast } from "sonner"
import { Loader2, Send, AlertCircle } from "lucide-react"
import { cn } from "../../lib/utils"
import { MemoizedMarkdown } from "../chat-markdown-renderer"

interface Message {
  id: string
  role: "user" | "assistant"
  content: string
  isStreaming?: boolean
}

export interface TransientChatProps {
  /** Initial greeting message to display */
  initialGreeting?: string
  /** Context to include in the first prompt sent to the AI */
  context?: string
  /** Placeholder text for the input field */
  placeholder?: string
  /** Hint text shown below the input */
  hint?: string
  /** Called when a result is detected (optional) */
  onResultDetected?: (result: unknown) => void
  /** Custom parser to extract results from AI messages */
  resultParser?: (text: string) => unknown | null
  /** Phrases that indicate the conversation is complete */
  completionPhrases?: string[]
  /** Render a preview of the detected result */
  renderResultPreview?: (result: unknown, onUse: () => void) => React.ReactNode
  /** Called when conversation completes */
  onComplete?: () => void
  /** Additional prompt context to send with first message */
  promptContext?: string
  /** System prompt type - determines which system prompt to use */
  systemPromptType?: "mcp" | "review"
  /** If true, automatically send promptContext as the first message when the dialog opens */
  autoSendInitialMessage?: boolean
  /** Custom message to display when auto-sending (defaults to "Please analyze this file.") */
  initialMessage?: string
  /** Project path to use as working directory - allows AI to read project files directly */
  projectPath?: string
  /** Unique key to reset state when context changes (e.g., file path being reviewed) */
  contextKey?: string
}

export function TransientChat({
  initialGreeting,
  context,
  placeholder = "Describe what you need...",
  hint = "The AI will help you based on your description.",
  onResultDetected,
  resultParser,
  completionPhrases = [],
  renderResultPreview,
  onComplete,
  promptContext,
  systemPromptType = "mcp",
  autoSendInitialMessage = false,
  initialMessage = "Please analyze this file.",
  projectPath,
  contextKey,
}: TransientChatProps) {
  // Initialize with greeting if provided
  const [messages, setMessages] = useState<Message[]>(() =>
    initialGreeting
      ? [{ id: "assistant-initial", role: "assistant" as const, content: initialGreeting }]
      : []
  )
  const [inputValue, setInputValue] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [isComplete, setIsComplete] = useState(false)
  const [session, setSession] = useState<{
    chatId: string
    subChatId: string
    projectId: string
  } | null>(null)
  const [detectedResult, setDetectedResult] = useState<unknown>(null)
  const [isCreatingSession, setIsCreatingSession] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [currentContextKey, setCurrentContextKey] = useState(contextKey)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const utils = trpc.useUtils()
  const cleanupRef = useRef<(() => void) | null>(null)
  const hasAutoSentRef = useRef(false)

  // Reset state when contextKey changes (e.g., different file being reviewed)
  useEffect(() => {
    if (contextKey && contextKey !== currentContextKey) {
      // Cleanup old session
      if (session?.chatId) {
        utils.client.transientChat.cleanup
          .mutate({ chatId: session.chatId })
          .catch((err) => {
            console.warn("[TransientChat] Cleanup error (non-critical):", err)
          })
      }

      // Reset all state
      setMessages(
        initialGreeting
          ? [{ id: "assistant-initial", role: "assistant" as const, content: initialGreeting }]
          : []
      )
      setInputValue("")
      setIsLoading(false)
      setIsComplete(false)
      setSession(null)
      setDetectedResult(null)
      setIsCreatingSession(false)
      setError(null)
      hasAutoSentRef.current = false
      setCurrentContextKey(contextKey)
    }
  }, [contextKey, currentContextKey, session?.chatId, initialGreeting, utils.client.transientChat.cleanup])

  // Cleanup transient session on unmount
  useEffect(() => {
    return () => {
      if (session?.chatId) {
        utils.client.transientChat.cleanup
          .mutate({ chatId: session.chatId })
          .catch((err) => {
            console.warn("[TransientChat] Cleanup error (non-critical):", err)
          })
      }
    }
  }, [session])

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // Auto-send initial message when enabled
  useEffect(() => {
    if (
      autoSendInitialMessage &&
      promptContext &&
      promptContext.trim().length > 0 &&
      !hasAutoSentRef.current &&
      !isLoading &&
      !isCreatingSession &&
      !session
    ) {
      hasAutoSentRef.current = true
      handleSend(initialMessage)
    }
  }, [autoSendInitialMessage, promptContext, isLoading, isCreatingSession, session, initialMessage])

  const createSession = async (prompt: string) => {
    setIsCreatingSession(true)
    setError(null)
    try {
      const enhancedPrompt = promptContext
        ? `${prompt}\n\n${promptContext}`
        : prompt

      const result = await utils.client.transientChat.create.mutate({
        prompt: enhancedPrompt,
        mode: "agent",
        systemPromptType,
        projectPath,
      })
      setSession(result)
      return result
    } catch (err) {
      console.error("Failed to create transient session:", err)
      const errorMessage = err instanceof Error ? err.message : "Unknown error"
      setError(`Failed to start chat: ${errorMessage}`)
      toast.error("Failed to start chat session", {
        description: errorMessage,
      })
      return null
    } finally {
      setIsCreatingSession(false)
    }
  }

  const handleSend = async (promptOverride?: string) => {
    const messageContent = promptOverride ?? inputValue.trim()
    if (!messageContent || isLoading || isCreatingSession) return

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: "user",
      content: messageContent,
    }

    setMessages((prev) => [...prev, userMessage])
    setInputValue("")
    setIsLoading(true)
    setError(null)

    try {
      let currentSession = session

      // Create session on first message
      if (!currentSession) {
        currentSession = await createSession(messageContent)
        if (!currentSession) {
          setMessages((prev) => prev.filter((m) => m.id !== userMessage.id))
          setIsLoading(false)
          return
        }
      }

      // Add placeholder for assistant response
      const assistantMessage: Message = {
        id: `assistant-${Date.now()}`,
        role: "assistant",
        content: "",
        isStreaming: true,
      }
      setMessages((prev) => [...prev, assistantMessage])

      // Subscribe to streaming response
      // Combine prompt with context (same as createSession does)
      const enhancedPrompt = promptContext
        ? `${messageContent}\n\n${promptContext}`
        : messageContent

      const subscription = utils.client.transientChat.chat.subscribe(
        {
          chatId: currentSession.chatId,
          subChatId: currentSession.subChatId,
          prompt: enhancedPrompt,
          systemPromptType,
          projectPath,
        },
        {
          onData: (chunk: { type: string; delta?: string; text?: string; errorText?: string }) => {
            if (chunk.type === "text-delta" && chunk.delta) {
              setMessages((prev) => {
                const last = prev[prev.length - 1]
                if (last?.role === "assistant") {
                  return [
                    ...prev.slice(0, -1),
                    { ...last, content: last.content + chunk.delta },
                  ]
                }
                return prev
              })
            } else if (chunk.type === "text" && chunk.text) {
              setMessages((prev) => {
                const last = prev[prev.length - 1]
                if (last?.role === "assistant") {
                  return [
                    ...prev.slice(0, -1),
                    { ...last, content: last.content + chunk.text },
                  ]
                }
                return prev
              })
            } else if (chunk.type === "error") {
              toast.error(chunk.errorText || "Error generating response")
            }
          },
          onError: (error) => {
            console.error("Stream error:", error)
            toast.error("Error in chat stream")
            setIsLoading(false)
            setMessages((prev) => {
              const last = prev[prev.length - 1]
              if (last?.role === "assistant") {
                return [...prev.slice(0, -1), { ...last, isStreaming: false }]
              }
              return prev
            })
          },
          onComplete: () => {
            setIsLoading(false)
            setMessages((prev) => {
              const last = prev[prev.length - 1]
              if (last?.role === "assistant") {
                // Try to parse result from the completed message
                if (resultParser) {
                  const result = resultParser(last.content)
                  if (result) {
                    setDetectedResult(result)
                    onResultDetected?.(result)
                  }
                }

                // Check if the AI indicated the conversation is complete
                const isConversationComplete = completionPhrases.some((phrase) =>
                  last.content.toLowerCase().includes(phrase.toLowerCase())
                )
                if (isConversationComplete) {
                  setIsComplete(true)
                  onComplete?.()
                }
                return [...prev.slice(0, -1), { ...last, isStreaming: false }]
              }
              return prev
            })
          },
        }
      )

      cleanupRef.current = () => subscription.unsubscribe()
    } catch (error) {
      console.error("Failed to send message:", error)
      toast.error("Failed to send message")
      setIsLoading(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      if (!isComplete) {
        handleSend()
      }
    }
  }

  const handleUseResult = useCallback(() => {
    if (detectedResult && onResultDetected) {
      onResultDetected(detectedResult)
    }
  }, [detectedResult, onResultDetected])

  return {
    messages,
    inputValue,
    setInputValue,
    isLoading,
    isCreatingSession,
    isComplete,
    error,
    setError,
    detectedResult,
    handleSend,
    handleKeyDown,
    handleUseResult,
    messagesEndRef,
    inputRef,
    placeholder,
    hint,
    renderResultPreview,
  }
}

// Default message list renderer
export function TransientChatMessages({
  messages,
  messagesEndRef,
  error,
  setError,
  detectedResult,
  renderResultPreview,
  onUseResult,
  isComplete,
}: {
  messages: Message[]
  messagesEndRef: React.RefObject<HTMLDivElement | null>
  error: string | null
  setError: (error: string | null) => void
  detectedResult: unknown
  renderResultPreview?: (result: unknown, onUse: () => void) => React.ReactNode
  onUseResult: () => void
  isComplete: boolean
}) {
  return (
    <div
      className={cn(
        "flex-1 overflow-y-auto p-4 space-y-4 min-h-[300px]",
        isComplete && "opacity-60 grayscale"
      )}
    >
      {/* Error Display */}
      {error && (
        <div className="border border-destructive/30 rounded-lg p-4 bg-destructive/10 mt-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-medium text-destructive">Error</p>
              <p className="text-sm text-destructive/80 mt-1">{error}</p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setError(null)}
                className="mt-3"
              >
                Dismiss
              </Button>
            </div>
          </div>
        </div>
      )}

      {messages.map((message) => (
        <div
          key={message.id}
          className={cn(
            "flex gap-3",
            message.role === "user" ? "justify-end" : "justify-start"
          )}
        >
          <div
            className={cn(
              "max-w-[85%] rounded-lg px-3 py-2 text-sm",
              message.role === "user"
                ? "bg-primary text-primary-foreground"
                : "bg-muted border"
            )}
          >
            {message.role === "assistant" ? (
              <MemoizedMarkdown content={message.content} id={message.id} size="sm" />
            ) : (
              <div className="whitespace-pre-wrap">{message.content}</div>
            )}
            {message.isStreaming && (
              <span className="inline-block w-2 h-4 ml-1 bg-current animate-pulse" />
            )}
          </div>
        </div>
      ))}

      {/* Result Preview */}
      {detectedResult !== null && renderResultPreview && (
        <>{renderResultPreview(detectedResult, onUseResult)}</>
      )}

      <div ref={messagesEndRef} />
    </div>
  )
}

// Default input renderer
export function TransientChatInput({
  inputValue,
  setInputValue,
  handleKeyDown,
  handleSend,
  isLoading,
  isCreatingSession,
  isComplete,
  inputRef,
  placeholder,
  hint,
}: {
  inputValue: string
  setInputValue: (value: string) => void
  handleKeyDown: (e: React.KeyboardEvent) => void
  handleSend: () => void
  isLoading: boolean
  isCreatingSession: boolean
  isComplete: boolean
  inputRef: React.RefObject<HTMLInputElement | null>
  placeholder: string
  hint: string
}) {
  return (
    <div className={cn("p-3 border-t bg-background", isComplete && "bg-muted/50")}>
      {!isComplete ? (
        <>
          <div className="flex gap-2">
            <Input
              ref={inputRef}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              disabled={isLoading || isCreatingSession}
              className="flex-1"
            />
            <Button
              onClick={handleSend}
              disabled={!inputValue.trim() || isLoading || isCreatingSession}
              size="icon"
            >
              {isLoading || isCreatingSession ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-2">{hint}</p>
        </>
      ) : (
        <div className="text-center py-2">
          <p className="text-sm font-medium text-muted-foreground">
            Task complete
          </p>
        </div>
      )}
    </div>
  )
}
