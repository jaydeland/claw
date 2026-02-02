import { useCallback, useEffect, useRef, useState } from "react"
import { useAtom, useSetAtom } from "jotai"
import { Button } from "../../../components/ui/button"
import { Textarea } from "../../../components/ui/textarea"
import { ChatMarkdownRenderer } from "../../../components/chat-markdown-renderer"
import { trpc } from "../../../lib/trpc"
import { toast } from "sonner"
import { Eye, Edit, Save, X, AlertCircle, Loader2 } from "lucide-react"
import { cn } from "../../../lib/utils"
import { gsdEditDirtyAtom, gsdEditContentAtom } from "../atoms"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../../../components/ui/alert-dialog"

interface PlanningDocEditorProps {
  projectPath: string
  docPath: string
  onClose: () => void
}

export function PlanningDocEditor({
  projectPath,
  docPath,
  onClose,
}: PlanningDocEditorProps) {
  const [content, setContent] = useAtom(gsdEditContentAtom)
  const [isDirty, setIsDirty] = useAtom(gsdEditDirtyAtom)
  const [isPreview, setIsPreview] = useState(false)
  const [showUnsavedWarning, setShowUnsavedWarning] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Fetch document content
  const { data: docContent, isLoading } = trpc.gsd.readPlanningDoc.useQuery(
    { projectPath, filePath: docPath },
    { enabled: !!projectPath && !!docPath }
  )

  // Store original content for comparison
  const originalContentRef = useRef("")

  // Initialize content from fetched data
  useEffect(() => {
    if (docContent?.content) {
      const initialContent = docContent.content

      // Check for draft in localStorage
      const key = `gsd-edit-draft:${projectPath}:${docPath}`
      const draft = localStorage.getItem(key)

      if (draft && draft !== initialContent) {
        // Use draft if available and different
        setContent(draft)
        originalContentRef.current = initialContent
        setIsDirty(true)
      } else {
        // Use fetched content
        setContent(initialContent)
        originalContentRef.current = initialContent
        setIsDirty(false)
      }
    }
  }, [docContent?.content, projectPath, docPath, setContent, setIsDirty])

  // Auto-save to localStorage (debounced)
  useEffect(() => {
    if (!content) return

    const key = `gsd-edit-draft:${projectPath}:${docPath}`
    const timeoutId = setTimeout(() => {
      localStorage.setItem(key, content)
    }, 2000)

    return () => clearTimeout(timeoutId)
  }, [content, projectPath, docPath])

  // Check if content has changed
  useEffect(() => {
    setIsDirty(content !== originalContentRef.current)
  }, [content, setIsDirty])

  const writeMutation = trpc.gsd.writePlanningDoc.useMutation({
    onSuccess: () => {
      toast.success("File saved successfully")
      originalContentRef.current = content || ""
      setIsDirty(false)

      // Clear localStorage draft
      const key = `gsd-edit-draft:${projectPath}:${docPath}`
      localStorage.removeItem(key)
    },
    onError: (error) => {
      toast.error(`Failed to save: ${error.message}`)
    },
  })

  const handleSave = useCallback(() => {
    if (!content) return

    writeMutation.mutate({
      projectPath,
      filePath: docPath,
      content,
    })
  }, [content, projectPath, docPath, writeMutation])

  const handleCancel = useCallback(() => {
    if (isDirty) {
      setShowUnsavedWarning(true)
    } else {
      onClose()
    }
  }, [isDirty, onClose])

  const handleConfirmDiscard = useCallback(() => {
    setContent(originalContentRef.current)
    setIsDirty(false)
    setShowUnsavedWarning(false)
    onClose()

    // Clear localStorage draft
    const key = `gsd-edit-draft:${projectPath}:${docPath}`
    localStorage.removeItem(key)
  }, [projectPath, docPath, setContent, setIsDirty, onClose])

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault()
        handleSave()
      } else if ((e.metaKey || e.ctrlKey) && e.key === "e") {
        e.preventDefault()
        setIsPreview((prev) => !prev)
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [handleSave])

  const fileName = docPath.split("/").pop() || docPath

  // Show loader while fetching content
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-40">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border/50">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-foreground">{fileName}</span>
          {isDirty && (
            <div className="flex items-center gap-1 text-xs text-amber-500">
              <AlertCircle className="size-3" />
              <span>Unsaved changes</span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Toggle Edit/Preview */}
          <div className="flex items-center gap-0.5 rounded-md bg-muted p-0.5">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsPreview(false)}
              className={cn(
                "h-7 px-2 rounded-sm",
                !isPreview && "bg-background shadow-sm"
              )}
            >
              <Edit className="size-3.5 mr-1" />
              <span className="text-xs">Edit</span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsPreview(true)}
              className={cn(
                "h-7 px-2 rounded-sm",
                isPreview && "bg-background shadow-sm"
              )}
            >
              <Eye className="size-3.5 mr-1" />
              <span className="text-xs">Preview</span>
            </Button>
          </div>

          {/* Save Button */}
          <Button
            variant="default"
            size="sm"
            onClick={handleSave}
            disabled={!isDirty || writeMutation.isPending}
          >
            <Save className="size-3.5 mr-1" />
            Save
          </Button>

          {/* Cancel Button */}
          <Button
            variant="ghost"
            size="sm"
            onClick={handleCancel}
            disabled={writeMutation.isPending}
          >
            <X className="size-3.5 mr-1" />
            Cancel
          </Button>
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-hidden">
        {isPreview ? (
          <div className="h-full overflow-y-auto px-4 py-3">
            <ChatMarkdownRenderer
              markdown={content || ""}
              size="md"
            />
          </div>
        ) : (
          <Textarea
            ref={textareaRef}
            value={content || ""}
            onChange={(e) => setContent(e.target.value)}
            className="w-full h-full resize-none border-0 rounded-none focus-visible:ring-0 focus-visible:ring-offset-0 font-mono text-sm leading-relaxed p-4"
            placeholder="Enter markdown content..."
            style={{
              fontFamily:
                "SFMono-Regular, Menlo, Consolas, 'PT Mono', 'Liberation Mono', Courier, monospace",
            }}
          />
        )}
      </div>

      {/* Keyboard shortcuts hint */}
      <div className="px-4 py-1.5 border-t border-border/50 flex items-center justify-between text-xs text-muted-foreground">
        <span>Cmd+S to save • Cmd+E to toggle preview</span>
        {writeMutation.isPending && (
          <span className="text-foreground">Saving...</span>
        )}
      </div>

      {/* Unsaved changes warning dialog */}
      <AlertDialog open={showUnsavedWarning} onOpenChange={setShowUnsavedWarning}>
        <AlertDialogContent className="w-[400px]">
          <AlertDialogHeader>
            <AlertDialogTitle>Discard unsaved changes?</AlertDialogTitle>
            <AlertDialogDescription className="px-5 pb-5">
              You have unsaved changes to "{fileName}". If you close without saving,
              your changes will be lost.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setShowUnsavedWarning(false)}>
              Cancel
            </AlertDialogCancel>
            <Button
              variant="destructive"
              onClick={handleConfirmDiscard}
            >
              Discard Changes
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
