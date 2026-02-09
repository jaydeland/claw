"use client"

import { Button } from "@/components/ui/button"
import { Rocket, X } from "lucide-react"
import { GsdContent } from "../../gsd/ui/gsd-content"

interface GsdPlanningFullscreenProps {
  isOpen: boolean
  onClose: () => void
  onRunCommand: (command: string) => void
  onViewDocument: (path: string) => void
}

export function GsdPlanningFullscreen({
  isOpen,
  onClose,
  onRunCommand,
  onViewDocument,
}: GsdPlanningFullscreenProps) {
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-4 px-4 py-2 border-b">
        <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
          <Rocket className="h-4 w-4 text-primary" />
        </div>
        <div>
          <h1 className="text-lg font-semibold">GSD Planning</h1>
          <p className="text-xs text-muted-foreground">
            Get Shit Done - Project planning and execution
          </p>
        </div>

        <div className="flex-1" />

        <Button
          variant="ghost"
          size="icon"
          onClick={onClose}
          aria-label="Exit full screen"
        >
          <X className="h-5 w-5" />
        </Button>
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-hidden">
        <GsdContent />
      </div>
    </div>
  )
}
