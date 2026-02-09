"use client"

import { memo } from "react"
import { useAtom, useAtomValue } from "jotai"
import {
  gsdDisplayModeAtom,
  gsdChatSidebarOpenAtom,
  gsdChatSidebarOpenRuntimeAtom,
} from "../atoms"
import { GsdPlanningSidebar } from "./gsd-planning-sidebar"
import { GsdPlanningDialog } from "./gsd-planning-dialog"
import { GsdPlanningFullscreen } from "./gsd-planning-fullscreen"

interface GsdRendererProps {
  onRunCommand: (command: string) => void
  onViewDocument: (path: string) => void
}

export const GsdRenderer = memo(function GsdRenderer({
  onRunCommand,
  onViewDocument,
}: GsdRendererProps) {
  const displayMode = useAtomValue(gsdDisplayModeAtom)
  const [isOpen, setIsOpen] = useAtom(gsdChatSidebarOpenAtom)
  const [runtimeOpen, setRuntimeOpen] = useAtom(gsdChatSidebarOpenRuntimeAtom)

  // Determine which open state to use based on display mode
  const effectiveOpen = displayMode === "side-peek" ? isOpen : runtimeOpen

  const handleClose = () => {
    if (displayMode === "side-peek") {
      setIsOpen(false)
    } else {
      setRuntimeOpen(false)
    }
  }

  // Render based on display mode
  if (displayMode === "side-peek") {
    return (
      <GsdPlanningSidebar
        onRunCommand={onRunCommand}
        onViewDocument={onViewDocument}
      />
    )
  }

  if (displayMode === "center-peek") {
    return (
      <GsdPlanningDialog
        isOpen={effectiveOpen}
        onClose={handleClose}
        onRunCommand={onRunCommand}
        onViewDocument={onViewDocument}
      />
    )
  }

  if (displayMode === "full-page") {
    return (
      <GsdPlanningFullscreen
        isOpen={effectiveOpen}
        onClose={handleClose}
        onRunCommand={onRunCommand}
        onViewDocument={onViewDocument}
      />
    )
  }

  return null
})
