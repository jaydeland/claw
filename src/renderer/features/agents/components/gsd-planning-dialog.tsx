"use client"

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Rocket, X } from "lucide-react"
import { GsdContent } from "../../gsd/ui/gsd-content"

interface GsdPlanningDialogProps {
  isOpen: boolean
  onClose: () => void
  onRunCommand: (command: string) => void
  onViewDocument: (path: string) => void
}

export function GsdPlanningDialog({
  isOpen,
  onClose,
  onRunCommand,
  onViewDocument,
}: GsdPlanningDialogProps) {
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-4xl h-[80vh] flex flex-col p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-6 py-4 border-b flex flex-row items-center justify-between space-y-0">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <Rocket className="h-4 w-4 text-primary" />
            </div>
            <div>
              <DialogTitle className="text-base font-semibold">GSD Planning</DialogTitle>
              <p className="text-xs text-muted-foreground">
                Get Shit Done - Project planning and execution
              </p>
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
        <div className="flex-1 min-h-0 overflow-hidden">
          <GsdContent />
        </div>
      </DialogContent>
    </Dialog>
  )
}
