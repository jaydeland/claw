"use client"

import { useState, useRef, useCallback, useEffect } from "react"
import { useAtomValue, useAtom } from "jotai"
import { trpc } from "../../../lib/trpc"
import { Button } from "../../../components/ui/button"
import { Textarea } from "../../../components/ui/textarea"
import { ScrollText, Save, RotateCcw } from "lucide-react"
import { cn } from "../../../lib/utils"
import { selectedProjectAtom, pendingPromptNavigationAtom } from "../../agents/atoms"
import { useContextualChat } from "../../shared/hooks/use-contextual-chat"
import { ContextualChatPane } from "../../shared/components/contextual-chat-pane"

interface Prompt {
  id: string
  key: string
  name: string
  description: string | null
  content: string
  category: string
  isEditable: boolean
  defaultValue: string | null
  createdAt: Date
  updatedAt: Date
}

export function PromptsView() {
  const [selectedPrompt, setSelectedPrompt] = useState<Prompt | null>(null)
  const [editedContent, setEditedContent] = useState<string>("")
  const [splitPosition, setSplitPosition] = useState(55)
  const isDragging = useRef(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const utils = trpc.useUtils()
  const selectedProject = useAtomValue(selectedProjectAtom)
  const [pendingPromptNav, setPendingPromptNav] = useAtom(pendingPromptNavigationAtom)

  const { data: promptsData, isLoading } = trpc.prompts.list.useQuery()
  const { data: categoriesData } = trpc.prompts.getCategories.useQuery()

  const updateMutation = trpc.prompts.update.useMutation({
    onSuccess: () => {
      utils.prompts.list.invalidate()
      setSelectedPrompt(null)
      setEditedContent("")
    },
  })

  const resetMutation = trpc.prompts.resetToDefault.useMutation({
    onSuccess: () => {
      utils.prompts.list.invalidate()
    },
  })

  // Per-prompt persistent chat session
  const { chatId, subChatId, isLoading: isChatLoading, create: createChat, reset: resetChat } = useContextualChat({
    sourceView: "prompts",
    sourceContext: { promptId: selectedPrompt?.id ?? "" },
    projectId: selectedProject?.id ?? "",
    chatName: selectedPrompt ? `Prompt: ${selectedPrompt.name}` : undefined,
    enabled: !!selectedPrompt && !!selectedProject,
  })

  const handleSelectPrompt = (prompt: Prompt) => {
    setSelectedPrompt(prompt)
    setEditedContent(prompt.content)
  }

  // Auto-select prompt when navigating from sidebar chat click
  useEffect(() => {
    if (!pendingPromptNav || !promptsData?.prompts?.length) return
    const target = promptsData.prompts.find(p => p.id === pendingPromptNav)
    if (target) {
      handleSelectPrompt(target)
      setPendingPromptNav(null)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingPromptNav, promptsData?.prompts])

  const handleSave = () => {
    if (selectedPrompt) {
      updateMutation.mutate({
        id: selectedPrompt.id,
        content: editedContent,
      })
    }
  }

  const handleReset = () => {
    if (selectedPrompt) {
      resetMutation.mutate({ id: selectedPrompt.id })
    }
  }

  const handleMouseDown = () => {
    isDragging.current = true
  }

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDragging.current || !containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    const pos = ((e.clientX - rect.left) / rect.width) * 100
    setSplitPosition(Math.min(Math.max(pos, 25), 75))
  }, [])

  const handleMouseUp = useCallback(() => {
    isDragging.current = false
  }, [])

  // Build AI context from selected prompt
  const promptSystemContext = selectedPrompt
    ? `You are reviewing the following system prompt:\n\nName: ${selectedPrompt.name}\nKey: ${selectedPrompt.key}\nCategory: ${selectedPrompt.category}\n${selectedPrompt.description ? `Description: ${selectedPrompt.description}\n` : ""}\n---\n\n${selectedPrompt.content}`
    : ""

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-muted-foreground">Loading prompts...</div>
      </div>
    )
  }

  const prompts = promptsData?.prompts ?? []
  const categories = categoriesData?.categories ?? []

  const promptsByCategory = categories.reduce(
    (acc, category) => {
      acc[category] = prompts.filter((p) => p.category === category)
      return acc
    },
    {} as Record<string, Prompt[]>
  )

  return (
    <div className="flex h-full">
      {/* Sidebar - Prompt List */}
      <div className="w-72 border-r border-border flex flex-col flex-shrink-0">
        <div className="p-4 border-b border-border">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <ScrollText className="h-5 w-5" />
            System Prompts
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            {prompts.length} prompt{prompts.length !== 1 ? "s" : ""} total
          </p>
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          {categories.map((category) => (
            <div key={category} className="mb-4">
              <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider px-2 mb-2">
                {category}
              </h3>
              <div className="space-y-1">
                {promptsByCategory[category]?.map((prompt) => (
                  <button
                    key={prompt.id}
                    onClick={() => handleSelectPrompt(prompt)}
                    className={cn(
                      "w-full text-left px-3 py-2 rounded-md text-sm transition-colors",
                      selectedPrompt?.id === prompt.id
                        ? "bg-primary/10 text-primary"
                        : "hover:bg-foreground/5 text-foreground"
                    )}
                  >
                    <div className="font-medium truncate">{prompt.name}</div>
                    {prompt.description && (
                      <div className="text-xs text-muted-foreground truncate">
                        {prompt.description}
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </div>
          ))}

          {prompts
            .filter((p) => !p.category)
            .map((prompt) => (
              <button
                key={prompt.id}
                onClick={() => handleSelectPrompt(prompt)}
                className={cn(
                  "w-full text-left px-3 py-2 rounded-md text-sm transition-colors",
                  selectedPrompt?.id === prompt.id
                    ? "bg-primary/10 text-primary"
                    : "hover:bg-foreground/5 text-foreground"
                )}
              >
                <div className="font-medium truncate">{prompt.name}</div>
                {prompt.description && (
                  <div className="text-xs text-muted-foreground truncate">
                    {prompt.description}
                  </div>
                )}
              </button>
            ))}
        </div>
      </div>

      {/* Split area: Editor + AI Chat */}
      {selectedPrompt ? (
        <div
          ref={containerRef}
          className="flex-1 flex overflow-hidden select-none"
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        >
          {/* Editor panel */}
          <div
            className="flex flex-col overflow-hidden"
            style={{ width: `${splitPosition}%` }}
          >
            {/* Header */}
            <div className="p-4 border-b border-border flex-shrink-0">
              <div className="flex items-center justify-between">
                <div className="min-w-0">
                  <h3 className="text-lg font-semibold truncate">{selectedPrompt.name}</h3>
                  {selectedPrompt.description && (
                    <p className="text-sm text-muted-foreground truncate">
                      {selectedPrompt.description}
                    </p>
                  )}
                </div>
                {selectedPrompt.isEditable && (
                  <div className="flex items-center gap-2 ml-2 flex-shrink-0">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleReset}
                      disabled={resetMutation.isPending}
                    >
                      <RotateCcw className="h-4 w-4 mr-1" />
                      Reset
                    </Button>
                    <Button
                      size="sm"
                      onClick={handleSave}
                      disabled={updateMutation.isPending || editedContent === selectedPrompt.content}
                    >
                      <Save className="h-4 w-4 mr-1" />
                      Save
                    </Button>
                  </div>
                )}
              </div>
              {!selectedPrompt.isEditable && (
                <p className="text-xs text-muted-foreground mt-2">
                  This prompt is read-only and cannot be edited.
                </p>
              )}
            </div>

            {/* Content */}
            <div className="flex-1 overflow-hidden p-4">
              {selectedPrompt.isEditable ? (
                <div className="h-full flex flex-col">
                  <Textarea
                    value={editedContent}
                    onChange={(e) => setEditedContent(e.target.value)}
                    className="flex-1 font-mono text-sm resize-none"
                    placeholder="Enter prompt content..."
                  />
                  <div className="mt-2 text-xs text-muted-foreground">
                    {editedContent.length} characters
                    {editedContent.length !== selectedPrompt.content.length && (
                      <span className="ml-2 text-amber-500">
                        (modified: {editedContent.length - selectedPrompt.content.length > 0 ? "+" : ""}
                        {editedContent.length - selectedPrompt.content.length} chars)
                      </span>
                    )}
                  </div>
                </div>
              ) : (
                <div className="h-full overflow-y-auto">
                  <pre className="font-mono text-sm whitespace-pre-wrap">
                    {selectedPrompt.content}
                  </pre>
                </div>
              )}
            </div>
          </div>

          {/* Resize handle */}
          <div
            className="w-1 bg-border hover:bg-primary/40 cursor-col-resize flex-shrink-0 transition-colors"
            onMouseDown={handleMouseDown}
          />

          {/* AI Chat panel */}
          <div className="flex-1 flex flex-col overflow-hidden min-w-0">
            <ContextualChatPane
              chatId={chatId}
              subChatId={subChatId}
              projectId={selectedProject?.id ?? ""}
              projectPath={selectedProject?.path ?? ""}
              isSessionLoading={isChatLoading}
              onReset={resetChat}
              onCreate={createChat}
              placeholder="Ask about this prompt..."
              systemContext={promptSystemContext}
            />
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center text-muted-foreground">
          <div className="text-center">
            <ScrollText className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>Select a prompt to view or edit</p>
          </div>
        </div>
      )}
    </div>
  )
}
