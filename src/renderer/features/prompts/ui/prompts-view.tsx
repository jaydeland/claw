"use client"

import { useState } from "react"
import { trpc } from "../../../lib/trpc"
import { Button } from "../../../components/ui/button"
import { Textarea } from "../../../components/ui/textarea"
import { ScrollText, Save, RotateCcw, Edit3, Eye, EyeOff } from "lucide-react"
import { cn } from "../../../lib/utils"

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
  const [showPreview, setShowPreview] = useState(true)

  const utils = trpc.useUtils()

  // Fetch all prompts
  const { data: promptsData, isLoading } = trpc.prompts.list.useQuery()

  // Fetch categories
  const { data: categoriesData } = trpc.prompts.getCategories.useQuery()

  // Update mutation
  const updateMutation = trpc.prompts.update.useMutation({
    onSuccess: () => {
      utils.prompts.list.invalidate()
      setSelectedPrompt(null)
      setEditedContent("")
    },
  })

  // Reset mutation
  const resetMutation = trpc.prompts.resetToDefault.useMutation({
    onSuccess: () => {
      utils.prompts.list.invalidate()
    },
  })

  const handleSelectPrompt = (prompt: Prompt) => {
    setSelectedPrompt(prompt)
    setEditedContent(prompt.content)
    setShowPreview(true)
  }

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

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-muted-foreground">Loading prompts...</div>
      </div>
    )
  }

  const prompts = promptsData?.prompts ?? []
  const categories = categoriesData?.categories ?? []

  // Group prompts by category
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
      <div className="w-72 border-r border-border flex flex-col">
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

          {/* Uncategorized prompts */}
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

      {/* Main Content - Prompt Editor */}
      <div className="flex-1 flex flex-col">
        {selectedPrompt ? (
          <>
            <div className="p-4 border-b border-border">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold">{selectedPrompt.name}</h3>
                  {selectedPrompt.description && (
                    <p className="text-sm text-muted-foreground">
                      {selectedPrompt.description}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowPreview(!showPreview)}
                  >
                    {showPreview ? (
                      <>
                        <EyeOff className="h-4 w-4 mr-1" />
                        Hide Preview
                      </>
                    ) : (
                      <>
                        <Eye className="h-4 w-4 mr-1" />
                        Show Preview
                      </>
                    )}
                  </Button>
                  {selectedPrompt.isEditable && (
                    <>
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
                    </>
                  )}
                </div>
              </div>
              {!selectedPrompt.isEditable && (
                <p className="text-xs text-muted-foreground mt-2">
                  This prompt is read-only and cannot be edited.
                </p>
              )}
            </div>

            <div className="flex-1 overflow-hidden p-4">
              {selectedPrompt.isEditable ? (
                <div className="h-full flex flex-col">
                  <Textarea
                    value={editedContent}
                    onChange={(e) => setEditedContent(e.target.value)}
                    className="flex-1 font-mono text-sm resize-none"
                    placeholder="Enter prompt content..."
                  />
                  <div className="mt-2 text-xs text-muted-foreground flex justify-between">
                    <span>
                      {editedContent.length} characters
                      {editedContent.length !== selectedPrompt.content.length && (
                        <span className="ml-2 text-amber-500">
                          (modified: {editedContent.length - selectedPrompt.content.length > 0 ? "+" : ""}
                          {editedContent.length - selectedPrompt.content.length} chars)
                        </span>
                      )}
                    </span>
                    {showPreview && (
                      <span className="text-blue-500">Preview mode on</span>
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
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            <div className="text-center">
              <ScrollText className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Select a prompt to view or edit</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
