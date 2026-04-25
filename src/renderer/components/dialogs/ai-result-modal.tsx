import { useState, useEffect } from "react"
import { createPortal } from "react-dom"
import { Button } from "../ui/button"
import { Check, Copy, X } from "lucide-react"
import { toast } from "sonner"

interface AiResultModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  content: string
  loading?: boolean
  error?: string
  onAccept?: (content: string) => void
  acceptLabel?: string
  showCopy?: boolean
}

export function AiResultModal({
  open,
  onOpenChange,
  title,
  content,
  loading = false,
  error,
  onAccept,
  acceptLabel = "Accept",
  showCopy = true,
}: AiResultModalProps) {
  const [copied, setCopied] = useState(false)

  // Handle Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onOpenChange(false)
      }
    }

    if (open) {
      document.addEventListener("keydown", handleKeyDown)
      return () => document.removeEventListener("keydown", handleKeyDown)
    }
  }, [open, onOpenChange])

  // Reset copied state when modal opens/closes
  useEffect(() => {
    if (!open) {
      setCopied(false)
    }
  }, [open])

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content)
      setCopied(true)
      toast.success("Copied to clipboard")
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      toast.error("Failed to copy to clipboard")
    }
  }

  const handleAccept = () => {
    if (onAccept) {
      onAccept(content)
    }
  }

  if (!open || typeof document === "undefined") return null

  return createPortal(
    <div className="fixed inset-0 z-[100000] flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={() => onOpenChange(false)}
      />

      {/* Dialog */}
      <div className="relative bg-background border border-border rounded-lg shadow-lg w-full max-w-3xl mx-4 max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button
            onClick={() => onOpenChange(false)}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading && (
            <div className="space-y-3">
              <div className="h-4 bg-muted rounded animate-pulse w-3/4" />
              <div className="h-4 bg-muted rounded animate-pulse w-full" />
              <div className="h-4 bg-muted rounded animate-pulse w-5/6" />
            </div>
          )}

          {error && (
            <div className="text-destructive text-sm bg-destructive/10 p-3 rounded-md">
              {error}
            </div>
          )}

          {!loading && !error && content && (
            <div className="bg-muted/50 rounded-md p-4 text-sm font-mono whitespace-pre-wrap overflow-x-auto">
              {content}
            </div>
          )}

          {!loading && !error && !content && (
            <div className="text-muted-foreground text-sm text-center py-8">
              No content to display
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 p-4 border-t border-border">
          {showCopy && content && !loading && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleCopy}
              className="gap-1.5"
            >
              {copied ? (
                <>
                  <Check className="h-3.5 w-3.5" />
                  Copied
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5" />
                  Copy
                </>
              )}
            </Button>
          )}

          {onAccept && (
            <Button
              size="sm"
              onClick={handleAccept}
              disabled={loading || !!error || !content}
            >
              {acceptLabel}
            </Button>
          )}

          <Button
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
          >
            {onAccept ? "Cancel" : "Close"}
          </Button>
        </div>
      </div>
    </div>,
    document.body
  )
}
