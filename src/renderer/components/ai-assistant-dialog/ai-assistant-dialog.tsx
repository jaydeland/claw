"use client"

import React, { useEffect, useCallback } from "react"
import { AnimatePresence, motion } from "motion/react"
import { X, Sparkles, type LucideIcon } from "lucide-react"
import {
  TransientChat,
  TransientChatMessages,
  TransientChatInput,
  type TransientChatProps,
} from "./transient-chat"

export interface AiAssistantDialogProps extends TransientChatProps {
  /** Whether the dialog is open */
  open: boolean
  /** Called when dialog should close */
  onClose: () => void
  /** Dialog title */
  title: string
  /** Dialog description/subtitle */
  description?: string
  /** Icon to show in header (defaults to Sparkles) */
  icon?: LucideIcon
  /** Complete message shown when task is done */
  completeMessage?: string
  /** Complete description shown when task is done */
  completeDescription?: string
  /** Unique key to reset state when context changes (e.g., file path being reviewed) */
  contextKey?: string
}

export function AiAssistantDialog({
  open,
  onClose,
  title,
  description,
  icon: Icon = Sparkles,
  completeMessage,
  completeDescription,
  ...chatProps
}: AiAssistantDialogProps) {
  // Handle Escape key
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation()
        onClose()
      }
    },
    [onClose]
  )

  useEffect(() => {
    if (open) {
      document.addEventListener("keydown", handleKeyDown)
      return () => document.removeEventListener("keydown", handleKeyDown)
    }
  }, [open, handleKeyDown])

  const chat = TransientChat(chatProps)

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 bg-black/50 z-50"
            onClick={onClose}
          />

          {/* Dialog */}
          <motion.div
            role="dialog"
            aria-modal="true"
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.15, ease: [0.4, 0, 0.2, 1] }}
            className="fixed z-50 flex flex-col bg-background border border-border/50 overflow-hidden"
            style={{
              top: "72px",
              left: "72px",
              right: "72px",
              height: "calc(100% - 144px)",
              maxWidth: "1200px",
              marginInline: "auto",
              borderRadius: "12px",
              boxShadow:
                "0 25px 50px -12px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.05)",
            }}
          >
            {/* Header */}
            <div className="flex items-center gap-2 px-6 py-4 border-b border-border">
              <Icon className="h-5 w-5 text-primary" />
              <div className="flex-1">
                <h2 className="text-lg font-semibold">{title}</h2>
                {description && (
                  <p className="text-sm text-muted-foreground">{description}</p>
                )}
              </div>
              <button
                onClick={onClose}
                className="p-2 rounded-md hover:bg-muted transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Chat Messages */}
            <TransientChatMessages
              messages={chat.messages}
              messagesEndRef={chat.messagesEndRef}
              error={chat.error}
              setError={chat.setError}
              detectedResult={chat.detectedResult}
              renderResultPreview={chat.renderResultPreview}
              onUseResult={chat.handleUseResult}
              isComplete={chat.isComplete}
            />

            {/* Input */}
            {chat.isComplete ? (
              <div className="p-4 border-t bg-muted/50 text-center">
                <p className="text-sm font-medium text-muted-foreground">
                  {completeMessage || "Task complete"}
                </p>
                {completeDescription && (
                  <p className="text-xs text-muted-foreground mt-1">
                    {completeDescription}
                  </p>
                )}
              </div>
            ) : (
              <TransientChatInput
                inputValue={chat.inputValue}
                setInputValue={chat.setInputValue}
                handleKeyDown={chat.handleKeyDown}
                handleSend={chat.handleSend}
                isLoading={chat.isLoading}
                isCreatingSession={chat.isCreatingSession}
                isComplete={chat.isComplete}
                inputRef={chat.inputRef}
                placeholder={chat.placeholder}
                hint={chat.hint}
              />
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
