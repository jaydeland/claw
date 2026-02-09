"use client"

import { useEffect } from "react"
import { trpc } from "../../../lib/trpc"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "../../../components/ui/dialog"
import { Button } from "../../../components/ui/button"
import { FileText, X } from "lucide-react"
import { cn } from "../../../lib/utils"
import { ChatMarkdownRenderer } from "../../../components/chat-markdown-renderer"

interface GsdDocumentDialogProps {
  isOpen: boolean
  documentPath: string | null
  projectPath: string | null
  onClose: () => void
}

export function GsdDocumentDialog({
  isOpen,
  documentPath,
  projectPath,
  onClose,
}: GsdDocumentDialogProps) {
  // Fetch document content
  const { data, isLoading } = trpc.gsd.readPlanningDoc.useQuery(
    {
      projectPath: projectPath!,
      filePath: documentPath!,
    },
    {
      enabled: isOpen && !!projectPath && !!documentPath,
    }
  )

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose()
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [isOpen, onClose])

  const fileName = documentPath?.split("/").pop() || "Document"

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent showCloseButton={false} className="max-w-3xl max-h-[85vh] p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-6 py-4 border-b flex flex-row items-center justify-between space-y-0">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <FileText className="h-4 w-4 text-primary" />
            </div>
            <div>
              <DialogTitle className="text-base font-semibold">
                {fileName}
              </DialogTitle>
              {documentPath && (
                <p className="text-xs text-muted-foreground font-mono">
                  .planning/{documentPath}
                </p>
              )}
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-full"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </Button>
        </DialogHeader>

        <div className="overflow-y-auto max-h-[calc(85vh-80px)]">
          <div className="p-6">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              </div>
            ) : data?.content ? (
              <div className="prose prose-sm dark:prose-invert max-w-none">
                <ChatMarkdownRenderer content={data.content} />
              </div>
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                <FileText className="h-12 w-12 mx-auto mb-3 opacity-20" />
                <p>Document not found</p>
                {data?.error && (
                  <p className="text-xs mt-1 opacity-70">{data.error}</p>
                )}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
