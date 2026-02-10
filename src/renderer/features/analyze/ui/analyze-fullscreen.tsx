"use client"

import { Button } from "@/components/ui/button"
import { DialogIcons, DialogIconSizes } from "@/lib/dialog-icons"
import { AnalyzePanel } from "./analyze-panel"

interface AnalyzeFullscreenProps {
  isOpen: boolean
  onClose: () => void
  projectId: string
}

export function AnalyzeFullscreen({ isOpen, onClose, projectId }: AnalyzeFullscreenProps) {
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-4 px-4 py-2 border-b">
        <h1 className="text-lg font-semibold">Project Analysis</h1>
        <div className="flex-1" />
        <Button
          variant="ghost"
          size="icon"
          onClick={onClose}
          aria-label="Exit full screen"
        >
          <DialogIcons.Close className={DialogIconSizes.default} />
        </Button>
      </div>

      {/* Analysis Panel */}
      <div className="flex-1 min-h-0 overflow-hidden">
        <AnalyzePanel projectId={projectId} onClose={onClose} />
      </div>
    </div>
  )
}
