"use client"

import { memo, useCallback, useRef, useState, useEffect } from "react"
import { createPortal } from "react-dom"
import { useAtom, useAtomValue } from "jotai"
import { Archive, ChevronDown, Hash, MessageCircle, Zap } from "lucide-react"

import { Button } from "../../../components/ui/button"
import { Switch } from "../../../components/ui/switch"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../../../components/ui/dropdown-menu"
import {
  AgentIcon,
  AttachIcon,
  CheckIcon,
  ClaudeCodeIcon,
  PlanIcon,
  SwarmIcon,
  ThinkingIcon,
} from "../../../components/ui/icons"
import { Kbd } from "../../../components/ui/kbd"
import {
  PromptInput,
  PromptInputActions,
  PromptInputContextItems,
} from "../../../components/ui/prompt-input"
import { cn } from "../../../lib/utils"
import { agentModeAtom, type AgentMode, lastSelectedModelIdAtom } from "../atoms"
import { AgentsSlashCommand, type SlashCommandOption } from "../commands"
import { AgentSendButton } from "../components/agent-send-button"
import { SkillsDropdown } from "../components/skills-dropdown"
import { AgentsThinkingDialog } from "../../../components/dialogs/agents-thinking-dialog"
import {
  AgentsMentionsEditor,
  type AgentsMentionsEditorHandle,
  type FileMentionOption,
} from "../mentions"
import { AgentsFileMention } from "../mentions"
import { AgentContextIndicator, type MessageTokenData } from "../ui/agent-context-indicator"
import { AgentFileItem } from "../ui/agent-file-item"
import { AgentImageItem } from "../ui/agent-image-item"
import { AgentTextContextItem } from "../ui/agent-text-context-item"
import { AgentDiffTextContextItem } from "../ui/agent-diff-text-context-item"
import type { SelectedTextContext, DiffTextContext } from "../lib/queue-utils"
import type { CurrentToolStatus } from "../hooks"
import type { UploadedImage, UploadedFile } from "../hooks/use-agents-file-upload"
import { handlePasteEvent } from "../utils/paste-text"
import {
  saveSubChatDraftWithAttachments,
  clearSubChatDraft,
} from "../lib/drafts"
import { CLAUDE_MODELS, type ClaudeModel } from "../lib/models"
import { trpc } from "../../../lib/trpc"
import { type SubChatFileChange } from "../atoms"
import {
  ollamaConfigAtom,
  customClaudeConfigAtom,
  normalizeCustomClaudeConfig,
  activeConfigAtom,
  extendedThinkingEnabledAtom,
  thinkingEffortAtom,
  activeProviderAtom,
  anthropicModelAtom,
  bedrockModelAtom,
  customApiConfigAtom,
} from "../../../lib/atoms"

// Hook to get available models
interface OllamaModel {
  id: string
  name: string
  displayName?: string
  description?: string
  size?: number
  isRemote?: boolean
}

interface AvailableModelsResult {
  models: ClaudeModel[]
  ollamaModels: OllamaModel[]
  recommendedModel: string | undefined
  isOffline: boolean
  hasOllama: boolean
}

function useAvailableModels(): AvailableModelsResult {
  const [activeProvider] = useAtom(activeProviderAtom)
  const [ollamaConfig] = useAtom(ollamaConfigAtom)
  const [customApiConfig] = useAtom(customApiConfigAtom)

  // Fetch Ollama models when Ollama is the active provider
  // Show all available models regardless of whether they're local or remote
  const { data: ollamaModelsData } = trpc.claude.getOllamaModels.useQuery(
    {
      baseUrl: ollamaConfig.baseUrl || "http://localhost:11434",
      apiKey: ollamaConfig.ollamaApiKey,
      filterRemote: false, // Show all models (local pulls + remote-registered)
    },
    {
      enabled: activeProvider === "ollama" && !!ollamaConfig.baseUrl,
      staleTime: 5 * 60 * 1000, // Cache for 5 minutes
    }
  )

  // Get models based on active provider, sorted alphabetically
  const models: ClaudeModel[] = activeProvider === "ollama"
    ? (() => {
        // Fetch models from API - the model selected in providers tab is the default
        const fetched = ollamaModelsData?.models ?? []
        if (fetched.length > 0) {
          return fetched
            .map((m: OllamaModel) => ({ id: m.id, name: m.displayName || m.name }))
            .sort((a, b) => a.name.localeCompare(b.name))
        }
        // Final fallback
        return []
      })()
    : CLAUDE_MODELS // For Anthropic OAuth, Bedrock, and Custom API - use standard Claude models (already sorted)

  return {
    models,
    ollamaModels: ollamaModelsData?.models ?? [],
    recommendedModel: undefined,
    isOffline: false,
    hasOllama: activeProvider === "ollama" && !!ollamaConfig.baseUrl,
  }
}

export interface ChatInputAreaProps {
  // Editor ref - passed from parent for external access
  editorRef: React.RefObject<AgentsMentionsEditorHandle | null>
  // File input ref - for attachment button
  fileInputRef: React.RefObject<HTMLInputElement | null>
  // Core callbacks
  onSend: () => void
  onForceSend: () => void // Opt+Enter: stop stream and send immediately, bypassing queue
  onStop: () => Promise<void>
  onApprovePlan: () => void
  onContinue?: () => void
  onCompact: () => void
  onCreateNewSubChat?: () => void
  onShowTasks?: () => void
  // State from parent
  isStreaming: boolean
  hasUnapprovedPlan: boolean
  hasInterruptedSession?: boolean
  isCompacting: boolean
  // File uploads
  images: UploadedImage[]
  files: UploadedFile[]
  onAddAttachments: (files: File[]) => void
  onRemoveImage: (id: string) => void
  onRemoveFile: (id: string) => void
  isUploading: boolean
  // Text context from selected assistant message text
  textContexts: SelectedTextContext[]
  onRemoveTextContext: (id: string) => void
  // Diff text context from selected diff sidebar text
  diffTextContexts?: DiffTextContext[]
  onRemoveDiffTextContext?: (id: string) => void
  // Pre-computed token data for context indicator (avoids passing messages array)
  messageTokenData: MessageTokenData
  // Context
  subChatId: string
  parentChatId: string
  teamId?: string
  repository?: string
  sandboxId?: string
  /** Working directory for the Claude agent (may be a worktree path) */
  projectPath?: string
  changedFiles: SubChatFileChange[]
  // Mobile
  isMobile?: boolean
  // Queue - for sending from queue when input is empty
  queueLength?: number
  onSendFromQueue?: (itemId: string) => void
  firstQueueItemId?: string
  // Callback to notify parent when input has content (for custom text with questions)
  onInputContentChange?: (hasContent: boolean) => void
  // Callback to send message with question answer (Enter sends immediately, not to queue)
  onSubmitWithQuestionAnswer?: () => void
  // Callback to archive conversation and open a fresh chat
  onArchiveChat?: () => void
  // Whether archive chat mutation is pending
  isArchivingChat?: boolean
  // Current tool status for status indicator
  currentToolStatus?: CurrentToolStatus | null
  // External messaging connection (WhatsApp group or Slack channel)
  connectionType?: "none" | "whatsapp" | "slack"
  connectionName?: string
}

/**
 * Custom comparison for memo to prevent re-renders from unstable array references.
 * Compares messages by length and last message id, changedFiles by length and paths.
 */
function arePropsEqual(prevProps: ChatInputAreaProps, nextProps: ChatInputAreaProps): boolean {
  // Compare primitives and stable references first (fast path)
  if (
    prevProps.isStreaming !== nextProps.isStreaming ||
    prevProps.hasUnapprovedPlan !== nextProps.hasUnapprovedPlan ||
    prevProps.isCompacting !== nextProps.isCompacting ||
    prevProps.isUploading !== nextProps.isUploading ||
    prevProps.subChatId !== nextProps.subChatId ||
    prevProps.parentChatId !== nextProps.parentChatId ||
    prevProps.teamId !== nextProps.teamId ||
    prevProps.repository !== nextProps.repository ||
    prevProps.sandboxId !== nextProps.sandboxId ||
    prevProps.projectPath !== nextProps.projectPath ||
    prevProps.isMobile !== nextProps.isMobile ||
    prevProps.connectionType !== nextProps.connectionType ||
    prevProps.connectionName !== nextProps.connectionName
  ) {
    return false
  }

  // Compare refs by identity (they should be stable)
  if (
    prevProps.editorRef !== nextProps.editorRef ||
    prevProps.fileInputRef !== nextProps.fileInputRef
  ) {
    return false
  }

  // Compare callbacks by identity (they should be memoized in parent)
  if (
    prevProps.onSend !== nextProps.onSend ||
    prevProps.onForceSend !== nextProps.onForceSend ||
    prevProps.onStop !== nextProps.onStop ||
    prevProps.onApprovePlan !== nextProps.onApprovePlan ||
    prevProps.onContinue !== nextProps.onContinue ||
    prevProps.hasInterruptedSession !== nextProps.hasInterruptedSession ||
    prevProps.onCompact !== nextProps.onCompact ||
    prevProps.onCreateNewSubChat !== nextProps.onCreateNewSubChat ||
    prevProps.onAddAttachments !== nextProps.onAddAttachments ||
    prevProps.onRemoveImage !== nextProps.onRemoveImage ||
    prevProps.onRemoveFile !== nextProps.onRemoveFile ||
    prevProps.onRemoveTextContext !== nextProps.onRemoveTextContext ||
    prevProps.onInputContentChange !== nextProps.onInputContentChange ||
    prevProps.onSubmitWithQuestionAnswer !== nextProps.onSubmitWithQuestionAnswer ||
    prevProps.onArchiveChat !== nextProps.onArchiveChat ||
    prevProps.isArchivingChat !== nextProps.isArchivingChat
  ) {
    return false
  }

  // Compare textContexts array - by length and ids
  if (!prevProps.textContexts || !nextProps.textContexts) {
    return prevProps.textContexts === nextProps.textContexts
  }
  if (prevProps.textContexts.length !== nextProps.textContexts.length) {
    return false
  }
  for (let i = 0; i < prevProps.textContexts.length; i++) {
    if (prevProps.textContexts[i]?.id !== nextProps.textContexts[i]?.id) {
      return false
    }
  }

  // Compare diffTextContexts array - by length and ids
  const prevDiff = prevProps.diffTextContexts || []
  const nextDiff = nextProps.diffTextContexts || []
  if (prevDiff.length !== nextDiff.length) {
    return false
  }
  for (let i = 0; i < prevDiff.length; i++) {
    if (prevDiff[i]?.id !== nextDiff[i]?.id) {
      return false
    }
  }

  // Compare images array - by length and ids
  if (!prevProps.images || !nextProps.images) {
    return prevProps.images === nextProps.images
  }
  if (prevProps.images.length !== nextProps.images.length) {
    return false
  }
  for (let i = 0; i < prevProps.images.length; i++) {
    if (prevProps.images[i]?.id !== nextProps.images[i]?.id) {
      return false
    }
  }

  // Compare files array - by length and ids
  if (!prevProps.files || !nextProps.files) {
    return prevProps.files === nextProps.files
  }
  if (prevProps.files.length !== nextProps.files.length) {
    return false
  }
  for (let i = 0; i < prevProps.files.length; i++) {
    if (prevProps.files[i]?.id !== nextProps.files[i]?.id) {
      return false
    }
  }

  // Compare messageTokenData - only re-render when token counts actually change
  // This is much more stable than comparing messages array reference
  if (
    prevProps.messageTokenData.inputTokens !== nextProps.messageTokenData.inputTokens ||
    prevProps.messageTokenData.outputTokens !== nextProps.messageTokenData.outputTokens ||
    prevProps.messageTokenData.messageCount !== nextProps.messageTokenData.messageCount
  ) {
    return false
  }

  // Compare changedFiles - by length and filePaths
  if (!prevProps.changedFiles || !nextProps.changedFiles) {
    return prevProps.changedFiles === nextProps.changedFiles
  }
  if (prevProps.changedFiles.length !== nextProps.changedFiles.length) {
    return false
  }
  for (let i = 0; i < prevProps.changedFiles.length; i++) {
    if (prevProps.changedFiles[i]?.filePath !== nextProps.changedFiles[i]?.filePath) {
      return false
    }
  }

  // Compare currentToolStatus - by statusText (the display value)
  if (prevProps.currentToolStatus?.statusText !== nextProps.currentToolStatus?.statusText) {
    return false
  }

  return true
}

/**
 * ChatInputArea - Isolated input component to prevent re-renders of parent
 *
 * This component manages its own state for:
 * - hasContent (whether input has text)
 * - isFocused (editor focus state)
 * - isDragOver (drag/drop state)
 * - Mention dropdown state (showMentionDropdown, mentionSearchText, etc.)
 * - Slash command dropdown state
 * - Mode dropdown state
 * - Model dropdown state
 *
 * When user types, only this component re-renders, not the entire ChatViewInner.
 */
export const ChatInputArea = memo(function ChatInputArea({
  editorRef,
  fileInputRef,
  onSend,
  onForceSend,
  onStop,
  onApprovePlan,
  onContinue,
  onCompact,
  onCreateNewSubChat,
  onShowTasks,
  isStreaming,
  hasUnapprovedPlan,
  hasInterruptedSession,
  isCompacting,
  images,
  files,
  onAddAttachments,
  onRemoveImage,
  onRemoveFile,
  isUploading,
  textContexts,
  onRemoveTextContext,
  diffTextContexts,
  onRemoveDiffTextContext,
  messageTokenData,
  subChatId,
  parentChatId,
  teamId,
  repository,
  sandboxId,
  projectPath,
  changedFiles,
  isMobile = false,
  queueLength = 0,
  onSendFromQueue,
  firstQueueItemId,
  onInputContentChange,
  onSubmitWithQuestionAnswer,
  onArchiveChat,
  isArchivingChat = false,
  currentToolStatus,
  connectionType,
  connectionName,
}: ChatInputAreaProps) {
  // Local state - changes here don't re-render parent
  const [hasContent, setHasContent] = useState(false)
  const [isFocused, setIsFocused] = useState(false)
  const [isDragOver, setIsDragOver] = useState(false)

  // Mention dropdown state
  const [showMentionDropdown, setShowMentionDropdown] = useState(false)
  const [mentionSearchText, setMentionSearchText] = useState("")
  const [mentionPosition, setMentionPosition] = useState({ top: 0, left: 0 })

  // Mention dropdown subpage navigation state
  const [showingFilesList, setShowingFilesList] = useState(false)
  const [showingSkillsList, setShowingSkillsList] = useState(false)
  const [showingAgentsList, setShowingAgentsList] = useState(false)
  const [showingToolsList, setShowingToolsList] = useState(false)

  // Slash command dropdown state
  const [showSlashDropdown, setShowSlashDropdown] = useState(false)
  const [slashSearchText, setSlashSearchText] = useState("")
  const [slashPosition, setSlashPosition] = useState({ top: 0, left: 0 })

  // Mode dropdown state
  const [modeDropdownOpen, setModeDropdownOpen] = useState(false)
  const [modeTooltip, setModeTooltip] = useState<{
    visible: boolean
    position: { top: number; left: number }
    mode: AgentMode
  } | null>(null)
  const tooltipTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hasShownTooltipRef = useRef(false)

  // Model dropdown state
  const [isModelDropdownOpen, setIsModelDropdownOpen] = useState(false)
  const [lastSelectedModelId, setLastSelectedModelId] = useAtom(lastSelectedModelIdAtom)
  const availableModels = useAvailableModels()
  const customClaudeConfig = useAtomValue(customClaudeConfigAtom)
  const [ollamaConfig] = useAtom(ollamaConfigAtom)
  const [activeProvider] = useAtom(activeProviderAtom)
  const [anthropicModel] = useAtom(anthropicModelAtom)
  const [bedrockModel] = useAtom(bedrockModelAtom)
  const [customApiConfig] = useAtom(customApiConfigAtom)

  // Initialize selected model based on provider:
  // - Anthropic OAuth: Use anthropicModelAtom (opus/sonnet/haiku)
  // - Bedrock: Use bedrockModelAtom (opus/sonnet/haiku)
  // - Ollama: Use ollamaConfig.model
  // - Custom API: Use customApiConfig.model
  // - Per-chat override: lastSelectedModelIdAtom
  const [selectedModel, setSelectedModel] = useState(() => {
    // First check if user has a per-chat override
    const lastMatch = availableModels.models.find((m) => m.id === lastSelectedModelId)
    if (lastMatch) return lastMatch

    // Then check provider-specific default
    if (activeProvider === "anthropic-oauth") {
      const modelMatch = availableModels.models.find((m) => m.id === anthropicModel)
      if (modelMatch) return modelMatch
    }

    if (activeProvider === "aws-bedrock") {
      const modelMatch = availableModels.models.find((m) => m.id === bedrockModel)
      if (modelMatch) return modelMatch
    }

    if (activeProvider === "ollama" && ollamaConfig.model) {
      const defaultMatch = availableModels.models.find((m) => m.id === ollamaConfig.model)
      if (defaultMatch) return defaultMatch
    }

    if (activeProvider === "custom-api" && customApiConfig.model) {
      // For Custom API, the model is a string - try to find it in available models
      const defaultMatch = availableModels.models.find((m) => m.id === customApiConfig.model)
      if (defaultMatch) return defaultMatch
    }

    // Fallback to first available model
    return availableModels.models[0]
  })

  // Sync selected model when Ollama models load (race condition fix)
  // This ensures the Ollama default model is selected once models are fetched.
  // Note: intentionally NOT including selectedModel?.id to avoid overwriting user selections.
  useEffect(() => {
    if (
      activeProvider === "ollama" &&
      ollamaConfig.model &&
      availableModels.models.length > 0
    ) {
      const ollamaMatch = availableModels.models.find(
        (m) => m.id === ollamaConfig.model
      )
      if (ollamaMatch && ollamaMatch.id !== selectedModel?.id) {
        setSelectedModel(ollamaMatch)
      }
    }
  }, [
    activeProvider,
    ollamaConfig.model,
    availableModels.models,
    // selectedModel?.id intentionally excluded — we only want to sync on initial load,
    // not on every user-initiated model change.
  ])

  const normalizedCustomClaudeConfig =
    normalizeCustomClaudeConfig(customClaudeConfig)
  // Only disable model dropdown for legacy custom API config — not for Ollama, OAuth, or AWS
  const hasCustomClaudeConfig =
    Boolean(normalizedCustomClaudeConfig) &&
    activeProvider !== "ollama" &&
    activeProvider !== "anthropic-oauth" &&
    activeProvider !== "aws-bedrock"

  // Extended thinking (reasoning) toggle
  const [thinkingEnabled, setThinkingEnabled] = useAtom(extendedThinkingEnabledAtom)

  // Thinking effort level (only applies when thinking is enabled)
  const [thinkingEffort, setThinkingEffort] = useAtom(thinkingEffortAtom)

  // Agent mode - global atom (agent, plan, or swarm)
  const [agentMode, setAgentMode] = useAtom(agentModeAtom)
  const isPlanMode = agentMode === "plan"

  // Handle archive chat - archive conversation and open a fresh chat
  const handleArchiveChat = useCallback(() => {
    if (!subChatId || isStreaming || !onArchiveChat) return
    onArchiveChat()
  }, [subChatId, isStreaming, onArchiveChat])

  // Refs for draft saving
  const currentSubChatIdRef = useRef<string>(subChatId)
  const currentChatIdRef = useRef<string | null>(parentChatId)
  const currentDraftTextRef = useRef<string>("")
  currentSubChatIdRef.current = subChatId
  currentChatIdRef.current = parentChatId

  // Keyboard shortcut: Cmd+/ to open model selector
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey && e.key === "/") {
        e.preventDefault()
        e.stopPropagation()
        if (!hasCustomClaudeConfig) {
          setIsModelDropdownOpen(true)
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown, true)
    return () => window.removeEventListener("keydown", handleKeyDown, true)
  }, [hasCustomClaudeConfig])

  // Save draft on blur (with attachments and text contexts)
  const handleEditorBlur = useCallback(async () => {
    setIsFocused(false)

    const draft = editorRef.current?.getValue() || ""
    const chatId = currentChatIdRef.current
    const subChatIdValue = currentSubChatIdRef.current

    // Update ref for unmount save
    currentDraftTextRef.current = draft

    if (!chatId) return

    const hasContent =
      draft.trim() ||
      images.length > 0 ||
      files.length > 0 ||
      textContexts.length > 0 ||
      (diffTextContexts?.length ?? 0) > 0

    if (hasContent) {
      await saveSubChatDraftWithAttachments(chatId, subChatIdValue, draft, {
        images,
        files,
        textContexts,
      })
    } else {
      clearSubChatDraft(chatId, subChatIdValue)
    }
  }, [editorRef, images, files, textContexts, diffTextContexts])

  // Content change handler
  const handleContentChange = useCallback((newHasContent: boolean) => {
    setHasContent(newHasContent)
    onInputContentChange?.(newHasContent)
    // Sync the draft text ref for unmount save
    const draft = editorRef.current?.getValue() || ""
    currentDraftTextRef.current = draft
  }, [editorRef, onInputContentChange])

  // Editor submit handler - handles Enter key with queue logic
  // If input is empty and queue has items, stop stream and send first from queue
  const handleEditorSubmit = useCallback(async () => {
    const inputValue = editorRef.current?.getValue() || ""
    const hasText = inputValue.trim().length > 0
    const hasAttachments = images.length > 0 || files.length > 0 || textContexts.length > 0 || (diffTextContexts?.length ?? 0) > 0

    if (!hasText && !hasAttachments && queueLength > 0 && onSendFromQueue && firstQueueItemId) {
      // Input empty, queue has items - stop stream and send from queue
      await onStop()
      onSendFromQueue(firstQueueItemId)
    } else {
      onSend()
    }
  }, [editorRef, images, files, textContexts, diffTextContexts, queueLength, onSendFromQueue, firstQueueItemId, onStop, onSend])

  // Mention select handler
  const handleMentionSelect = useCallback((mention: FileMentionOption) => {
    // Category navigation - enter subpage instead of inserting mention
    if (mention.type === "category") {
      if (mention.id === "files") {
        setShowingFilesList(true)
        return
      }
      if (mention.id === "skills") {
        setShowingSkillsList(true)
        return
      }
      if (mention.id === "agents") {
        setShowingAgentsList(true)
        return
      }
      if (mention.id === "tools") {
        setShowingToolsList(true)
        return
      }
    }

    // Otherwise: insert mention as normal
    editorRef.current?.insertMention(mention)
    setShowMentionDropdown(false)
    // Reset subpage state
    setShowingFilesList(false)
    setShowingSkillsList(false)
    setShowingAgentsList(false)
    setShowingToolsList(false)
  }, [editorRef])

  // Slash command handlers
  const handleSlashTrigger = useCallback(
    ({ searchText, rect }: { searchText: string; rect: DOMRect }) => {
      setSlashSearchText(searchText)
      setSlashPosition({ top: rect.top, left: rect.left })
      setShowSlashDropdown(true)
    },
    [],
  )

  const handleCloseSlashTrigger = useCallback(() => {
    setShowSlashDropdown(false)
  }, [])

  const handleSlashSelect = useCallback(
    (command: SlashCommandOption) => {
      // Clear the slash command text from editor
      editorRef.current?.clearSlashCommand()
      setShowSlashDropdown(false)

      // SDK commands (from SDK session-init) - send directly to SDK
      if (command.id?.startsWith("sdk:")) {
        if (command.argumentHint) {
          // Command expects arguments - insert and wait for user
          editorRef.current?.setValue(`/${command.name} `)
        } else {
          // Command without arguments - send immediately to SDK
          editorRef.current?.setValue(`/${command.name}`)
          setTimeout(() => onSend(), 0)
        }
        return
      }

      // Fallback: Old-style custom commands with fetched content
      if (command.argumentHint) {
        // Command expects arguments - insert command and let user add args
        editorRef.current?.setValue(`/${command.name} `)
      } else if (command.prompt) {
        // Command without arguments - send immediately
        editorRef.current?.setValue(command.prompt)
        setTimeout(() => onSend(), 0)
      }
    },
    [onSend, editorRef],
  )

  // Handle skill selection from Skills dropdown
  const handleSkillSelect = useCallback((skillName: string) => {
    const command = `/${skillName} `
    const currentValue = editorRef.current?.getValue() || ""
    const newValue = currentValue.trim()
      ? `${command}${currentValue}`
      : command
    editorRef.current?.setValue(newValue)
    editorRef.current?.focus()

    // Position cursor right after the skill command and space
    setTimeout(() => {
      editorRef.current?.setCursorPosition(command.length)
    }, 0)
  }, [editorRef])

  // Paste handler for images and plain text
  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => handlePasteEvent(e, onAddAttachments),
    [onAddAttachments],
  )

  // Drag/drop handlers
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setIsDragOver(false)
      const droppedFiles = Array.from(e.dataTransfer.files)
      onAddAttachments(droppedFiles)
      // Focus after state update - use double rAF to wait for React render
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          editorRef.current?.focus()
        })
      })
    },
    [onAddAttachments, editorRef],
  )

  return (
    <div className="px-2 pb-2 shadow-sm shadow-background relative z-10 bg-background">
      <div className="w-full max-w-[90%] mx-auto">
        <div
          className="relative w-full"
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <div
            className="relative w-full cursor-text"
            onClick={() => editorRef.current?.focus()}
          >
            <PromptInput
              className={cn(
                "border bg-input-background relative z-10 p-2 rounded-xl transition-[border-color,box-shadow] duration-150",
                isDragOver && "ring-2 ring-primary/50 border-primary/50",
                isFocused && !isDragOver && !isStreaming && "ring-2 ring-primary/50",
                isStreaming && "ring-2 ring-primary/40 animate-pulse-ring",
              )}
              maxHeight={200}
              onSubmit={onSend}
              contextItems={
                images.length > 0 || files.length > 0 || textContexts.length > 0 || (diffTextContexts?.length ?? 0) > 0 ? (
                  <div className="flex flex-wrap gap-[6px]">
                    {(() => {
                      // Build allImages array for gallery navigation
                      const allImages = images
                        .filter((img): img is typeof img & { url: string } => !!img.url && !img.isLoading)
                        .map((img) => ({
                          id: img.id,
                          filename: img.filename,
                          url: img.url,
                        }))

                      return images.map((img, idx) => (
                        <AgentImageItem
                          key={img.id}
                          id={img.id}
                          filename={img.filename}
                          url={img.url || ""}
                          isLoading={img.isLoading}
                          onRemove={() => onRemoveImage(img.id)}
                          allImages={allImages}
                          imageIndex={idx}
                        />
                      ))
                    })()}
                    {files.map((f) => (
                      <AgentFileItem
                        key={f.id}
                        id={f.id}
                        filename={f.filename}
                        url={f.url || ""}
                        size={f.size}
                        isLoading={f.isLoading}
                        onRemove={() => onRemoveFile(f.id)}
                      />
                    ))}
                    {textContexts.map((tc) => (
                      <AgentTextContextItem
                        key={tc.id}
                        text={tc.text}
                        preview={tc.preview}
                        onRemove={() => onRemoveTextContext(tc.id)}
                      />
                    ))}
                    {diffTextContexts?.map((dtc) => (
                      <AgentDiffTextContextItem
                        key={dtc.id}
                        text={dtc.text}
                        preview={dtc.preview}
                        filePath={dtc.filePath}
                        lineNumber={dtc.lineNumber}
                        lineType={dtc.lineType}
                        onRemove={onRemoveDiffTextContext ? () => onRemoveDiffTextContext(dtc.id) : undefined}
                      />
                    ))}
                  </div>
                ) : null
              }
            >
              <PromptInputContextItems />
              <div className="relative">
                <AgentsMentionsEditor
                  ref={editorRef}
                  onTrigger={({ searchText, rect }) => {
                    // Desktop: use projectPath for local file search
                    if (projectPath || repository) {
                      setMentionSearchText(searchText)
                      setMentionPosition({ top: rect.top, left: rect.left })
                      setShowMentionDropdown(true)
                    }
                  }}
                  onCloseTrigger={() => {
                    setShowMentionDropdown(false)
                    // Reset subpage state when closing
                    setShowingFilesList(false)
                    setShowingSkillsList(false)
                    setShowingAgentsList(false)
                    setShowingToolsList(false)
                  }}
                  onSlashTrigger={handleSlashTrigger}
                  onCloseSlashTrigger={handleCloseSlashTrigger}
                  onContentChange={handleContentChange}
                  onSubmit={onSubmitWithQuestionAnswer || handleEditorSubmit}
                  onForceSubmit={onForceSend}
                  onShiftTab={() => setAgentMode((prev) => prev === "agent" ? "plan" : "agent")}
                  placeholder={isStreaming ? "Add follow up" : "Plan, @ for context, / for commands"}
                  className={cn(
                    "bg-transparent max-h-[200px] overflow-y-auto p-1",
                    isMobile && "min-h-[56px]",
                  )}
                  onPaste={handlePaste}
                  onFocus={() => setIsFocused(true)}
                  onBlur={handleEditorBlur}
                />
              </div>
              <PromptInputActions className="w-full">
                <div className="flex items-center gap-0.5 flex-1 min-w-0">
                  {/* Mode toggle (Agent/Plan) */}
                  <DropdownMenu
                    open={modeDropdownOpen}
                    onOpenChange={(open) => {
                      setModeDropdownOpen(open)
                      if (!open) {
                        if (tooltipTimeoutRef.current) {
                          clearTimeout(tooltipTimeoutRef.current)
                          tooltipTimeoutRef.current = null
                        }
                        setModeTooltip(null)
                        hasShownTooltipRef.current = false
                      }
                    }}
                  >
                    <DropdownMenuTrigger asChild>
                      <button
                        className="flex items-center gap-1 px-1.5 py-1 text-xs text-muted-foreground hover:text-foreground transition-colors rounded-md hover:bg-muted/50 outline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring/70"
                        title={agentMode === "plan" ? "Plan mode" : "Agent mode"}
                        aria-label={agentMode === "plan" ? "Plan mode" : "Agent mode"}
                      >
                        {agentMode === "plan" ? (
                          <PlanIcon className="h-3.5 w-3.5 shrink-0" />
                        ) : (
                          <AgentIcon className="h-3.5 w-3.5 shrink-0" />
                        )}
                        <span>{agentMode === "plan" ? "Plan" : "Agent"}</span>
                        <ChevronDown className="h-3 w-3 shrink-0 opacity-50" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                      align="start"
                      sideOffset={6}
                      className="!min-w-[116px] !w-[116px]"
                      onCloseAutoFocus={(e) => e.preventDefault()}
                    >
                      <DropdownMenuItem
                        onClick={() => {
                          // Clear tooltip before closing dropdown (onMouseLeave won't fire)
                          if (tooltipTimeoutRef.current) {
                            clearTimeout(tooltipTimeoutRef.current)
                            tooltipTimeoutRef.current = null
                          }
                          setModeTooltip(null)
                          setAgentMode("agent")
                          setModeDropdownOpen(false)
                        }}
                        className="justify-between gap-2"
                        onMouseEnter={(e) => {
                          if (tooltipTimeoutRef.current) {
                            clearTimeout(tooltipTimeoutRef.current)
                            tooltipTimeoutRef.current = null
                          }
                          const rect = e.currentTarget.getBoundingClientRect()
                          const showTooltip = () => {
                            setModeTooltip({
                              visible: true,
                              position: {
                                top: rect.top,
                                left: rect.right + 8,
                              },
                              mode: "agent",
                            })
                            hasShownTooltipRef.current = true
                            tooltipTimeoutRef.current = null
                          }
                          if (hasShownTooltipRef.current) {
                            showTooltip()
                          } else {
                            tooltipTimeoutRef.current = setTimeout(
                              showTooltip,
                              1000,
                            )
                          }
                        }}
                        onMouseLeave={() => {
                          if (tooltipTimeoutRef.current) {
                            clearTimeout(tooltipTimeoutRef.current)
                            tooltipTimeoutRef.current = null
                          }
                          setModeTooltip(null)
                        }}
                      >
                        <div className="flex items-center gap-2">
                          <AgentIcon className="w-4 h-4 text-muted-foreground" />
                          <span>Agent</span>
                        </div>
                        {agentMode === "agent" && (
                          <CheckIcon className="h-3.5 w-3.5 ml-auto shrink-0" />
                        )}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => {
                          // Clear tooltip before closing dropdown (onMouseLeave won't fire)
                          if (tooltipTimeoutRef.current) {
                            clearTimeout(tooltipTimeoutRef.current)
                            tooltipTimeoutRef.current = null
                          }
                          setModeTooltip(null)
                          setAgentMode("plan")
                          setModeDropdownOpen(false)
                        }}
                        className="justify-between gap-2"
                        onMouseEnter={(e) => {
                          if (tooltipTimeoutRef.current) {
                            clearTimeout(tooltipTimeoutRef.current)
                            tooltipTimeoutRef.current = null
                          }
                          const rect = e.currentTarget.getBoundingClientRect()
                          const showTooltip = () => {
                            setModeTooltip({
                              visible: true,
                              position: {
                                top: rect.top,
                                left: rect.right + 8,
                              },
                              mode: "plan",
                            })
                            hasShownTooltipRef.current = true
                            tooltipTimeoutRef.current = null
                          }
                          if (hasShownTooltipRef.current) {
                            showTooltip()
                          } else {
                            tooltipTimeoutRef.current = setTimeout(
                              showTooltip,
                              1000,
                            )
                          }
                        }}
                        onMouseLeave={() => {
                          if (tooltipTimeoutRef.current) {
                            clearTimeout(tooltipTimeoutRef.current)
                            tooltipTimeoutRef.current = null
                          }
                          setModeTooltip(null)
                        }}
                      >
                        <div className="flex items-center gap-2">
                          <PlanIcon className="w-4 h-4 text-muted-foreground" />
                          <span>Plan</span>
                        </div>
                        {agentMode === "plan" && (
                          <CheckIcon className="h-3.5 w-3.5 ml-auto shrink-0" />
                        )}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                    {modeTooltip?.visible &&
                      createPortal(
                        <div
                          className="fixed z-[100000]"
                          style={{
                            top: modeTooltip.position.top + 14,
                            left: modeTooltip.position.left,
                            transform: "translateY(-50%)",
                          }}
                        >
                          <div
                            data-tooltip="true"
                            className="relative rounded-[12px] bg-popover px-2.5 py-1.5 text-xs text-popover-foreground dark max-w-[150px]"
                          >
                            <span>
                              {modeTooltip.mode === "agent"
                                ? "Apply changes directly without a plan"
                                : "Create a plan before making changes"}
                            </span>
                          </div>
                        </div>,
                        document.body,
                      )}
                  </DropdownMenu>

                  {/* Claude model selector */}
                  <DropdownMenu
                      open={hasCustomClaudeConfig ? false : isModelDropdownOpen}
                      onOpenChange={(open) => {
                        if (!hasCustomClaudeConfig) {
                          setIsModelDropdownOpen(open)
                        }
                      }}
                    >
                      <DropdownMenuTrigger asChild>
                        <button
                          disabled={hasCustomClaudeConfig}
                          className={cn(
                            "flex items-center gap-1 px-1.5 py-1 text-xs text-muted-foreground transition-colors rounded-md outline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring/70",
                            hasCustomClaudeConfig
                              ? "opacity-70 cursor-not-allowed"
                              : "hover:text-foreground hover:bg-muted/50",
                          )}
                          title={hasCustomClaudeConfig ? "Custom Model" : selectedModel?.name}
                          aria-label={hasCustomClaudeConfig ? "Custom Model" : `Claude ${selectedModel?.name}`}
                        >
                          <span>{hasCustomClaudeConfig ? "Custom" : selectedModel?.name || "Model"}</span>
                          <ChevronDown className="h-3 w-3 shrink-0 opacity-50" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start" className="w-[220px] max-h-[50vh] overflow-y-auto">
                        {availableModels.models.map((model) => {
                          const isSelected = selectedModel?.id === model.id
                          return (
                            <DropdownMenuItem
                              key={model.id}
                              onClick={() => {
                                setSelectedModel(model)
                                setLastSelectedModelId(model.id)
                              }}
                              className="gap-2 justify-between"
                            >
                              <div className="flex items-center gap-1.5">
                                <ClaudeCodeIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                <span>{model.name}</span>
                                {model.badge && (
                                  <span className={cn(
                                    "text-[10px] font-medium px-1 py-0.5 rounded",
                                    model.badge === "TEAM" && "bg-purple-500/20 text-purple-500",
                                    model.badge === "NEW" && "bg-green-500/20 text-green-500",
                                  )}>
                                    {model.badge}
                                  </span>
                                )}
                              </div>
                              {isSelected && (
                                <CheckIcon className="h-3.5 w-3.5 shrink-0" />
                              )}
                            </DropdownMenuItem>
                          )
                        })}
                      </DropdownMenuContent>
                  </DropdownMenu>

                  {/* Thinking mode dialog */}
                  <AgentsThinkingDialog disabled={isStreaming} />

                  {/* Skills Dropdown - Shows skills and commands */}
                  <SkillsDropdown
                    onSkillSelect={handleSkillSelect}
                    disabled={isStreaming}
                  />

                  {/* Connection badge - shows connected WhatsApp group or Slack channel */}
                  {connectionType && connectionType !== "none" && connectionName && (
                    <div className="flex items-center gap-1 px-2 py-1 text-xs text-muted-foreground rounded-md bg-muted/40 border border-border/50 shrink-0 select-none">
                      {connectionType === "whatsapp"
                        ? <MessageCircle className="h-3 w-3 text-green-500 shrink-0" />
                        : <Hash className="h-3 w-3 text-purple-500 shrink-0" />}
                      <span className="truncate max-w-[120px]">{connectionName}</span>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-0.5 ml-auto flex-shrink-0">
                  {/* Hidden file input - accepts images and text/code files */}
                  <input
                    type="file"
                    ref={fileInputRef}
                    hidden
                    accept="image/jpeg,image/png,.txt,.md,.markdown,.json,.yaml,.yml,.xml,.csv,.tsv,.log,.ini,.cfg,.conf,.js,.ts,.jsx,.tsx,.py,.rb,.go,.rs,.java,.kt,.swift,.c,.cpp,.h,.hpp,.cs,.php,.html,.css,.scss,.sass,.less,.sql,.sh,.bash,.zsh,.ps1,.bat,.env,.gitignore,.dockerignore,.editorconfig,.prettierrc,.eslintrc,.babelrc,.nvmrc,.pdf"
                    multiple
                    onChange={(e) => {
                      const inputFiles = Array.from(e.target.files || [])
                      onAddAttachments(inputFiles)
                      e.target.value = ""
                    }}
                  />

                  {/* Archive conversation button */}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 rounded-sm outline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring/70"
                    onClick={handleArchiveChat}
                    disabled={isStreaming || isArchivingChat || !onArchiveChat}
                    title="Archive conversation"
                  >
                    <Archive className="h-4 w-4" />
                  </Button>

                  {/* Context window indicator - click to compact */}
                  <AgentContextIndicator
                    tokenData={messageTokenData}
                    onCompact={onCompact}
                    isCompacting={isCompacting}
                    disabled={isStreaming}
                  />

                  {/* Attachment button */}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 rounded-sm outline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring/70"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={images.length >= 5 && files.length >= 10}
                  >
                    <AttachIcon className="h-4 w-4" />
                  </Button>

                  {/* Send/Stop button, Continue button, or Build Plan button */}
                  <div className="ml-1">
                    {/* Show "Continue" button when session was interrupted and input is empty */}
                    {hasInterruptedSession &&
                    !hasContent &&
                    images.length === 0 &&
                    files.length === 0 &&
                    textContexts.length === 0 &&
                    (diffTextContexts?.length ?? 0) === 0 &&
                    !isStreaming &&
                    onContinue ? (
                      <Button
                        onClick={onContinue}
                        size="sm"
                        className="h-7 gap-1.5 rounded-lg"
                      >
                        Continue
                        <Kbd className="text-primary-foreground/70">
                          ⌘↵
                        </Kbd>
                      </Button>
                    ) : /* Show "Build plan" button when plan is ready, input is empty, and in plan mode */
                    isPlanMode &&
                    hasUnapprovedPlan &&
                    !hasContent &&
                    images.length === 0 &&
                    files.length === 0 &&
                    textContexts.length === 0 &&
                    (diffTextContexts?.length ?? 0) === 0 &&
                    !isStreaming ? (
                      <Button
                        onClick={onApprovePlan}
                        size="sm"
                        className="h-7 gap-1.5 rounded-lg"
                      >
                        Build plan
                        <Kbd className="text-primary-foreground/70">
                          ⌘↵
                        </Kbd>
                      </Button>
                    ) : (
                      <AgentSendButton
                        isStreaming={isStreaming}
                        isSubmitting={false}
                        disabled={
                          (!hasContent &&
                            images.length === 0 &&
                            files.length === 0 &&
                            textContexts.length === 0 &&
                            (diffTextContexts?.length ?? 0) === 0 &&
                            queueLength === 0) ||
                          isUploading
                        }
                        hasContent={hasContent || images.length > 0 || files.length > 0 || textContexts.length > 0 || (diffTextContexts?.length ?? 0) > 0}
                        onClick={() => {
                          // If input is empty and queue has items, send first queue item
                          if (!hasContent && images.length === 0 && files.length === 0 && queueLength > 0 && onSendFromQueue && firstQueueItemId) {
                            onSendFromQueue(firstQueueItemId)
                          } else {
                            onSend()
                          }
                        }}
                        onStop={onStop}
                        isPlanMode={isPlanMode}
                      />
                    )}
                  </div>
                </div>
              </PromptInputActions>
            </PromptInput>
          </div>
        </div>

        {/* Working directory display */}
        {projectPath && (
          <div className="mt-1 px-1 text-xs text-muted-foreground/70 truncate" title={projectPath}>
            {projectPath}
          </div>
        )}
      </div>

      {/* File mention dropdown */}
      {/* Desktop: use projectPath for local file search */}
      <AgentsFileMention
        isOpen={
          showMentionDropdown &&
          (!!projectPath || !!repository || !!sandboxId)
        }
        onClose={() => {
          setShowMentionDropdown(false)
          // Reset subpage state when closing
          setShowingFilesList(false)
          setShowingSkillsList(false)
          setShowingAgentsList(false)
          setShowingToolsList(false)
        }}
        onSelect={handleMentionSelect}
        searchText={mentionSearchText}
        position={mentionPosition}
        teamId={teamId}
        repository={repository}
        sandboxId={sandboxId}
        projectPath={projectPath}
        changedFiles={changedFiles}
        // Subpage navigation state
        showingFilesList={showingFilesList}
        showingSkillsList={showingSkillsList}
        showingAgentsList={showingAgentsList}
        showingToolsList={showingToolsList}
      />

      {/* Slash command dropdown */}
      <AgentsSlashCommand
        isOpen={showSlashDropdown}
        onClose={handleCloseSlashTrigger}
        onSelect={handleSlashSelect}
        searchText={slashSearchText}
        position={slashPosition}
        projectPath={projectPath}
        isPlanMode={isPlanMode}
      />
    </div>
  )
}, arePropsEqual)
