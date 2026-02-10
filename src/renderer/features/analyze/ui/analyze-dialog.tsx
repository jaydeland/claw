"use client"

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { AnalyzePanel } from "./analyze-panel"

interface AnalyzeDialogProps {
  isOpen: boolean
  onClose: () => void
  projectId: string
}

export function AnalyzeDialog({ isOpen, onClose, projectId }: AnalyzeDialogProps) {
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-6xl h-[80vh] flex flex-col p-0">
        <DialogHeader className="px-6 py-4 border-b flex flex-row items-center justify-between">
          <DialogTitle>Project Analysis</DialogTitle>
        </DialogHeader>
        <div className="flex-1 min-h-0 overflow-hidden">
          <AnalyzePanel projectId={projectId} onClose={onClose} />
        </div>
      </DialogContent>
    </Dialog>
  )
}
