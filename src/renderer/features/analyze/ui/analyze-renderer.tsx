"use client"

import { memo, useCallback, useEffect } from "react"
import { useAtom, useAtomValue, useSetAtom } from "jotai"
import {
  analyzeDisplayModeAtom,
  analyzeSidebarOpenAtom,
  analyzeSidebarOpenRuntimeAtom,
  selectedAnalysisTypeAtom,
} from "../atoms"
import { AnalyzeSidebar } from "./analyze-sidebar"
import { AnalyzeDialog } from "./analyze-dialog"
import { AnalyzeFullscreen } from "./analyze-fullscreen"

interface AnalyzeRendererProps {
  projectId: string
}

export const AnalyzeRenderer = memo(function AnalyzeRenderer({ projectId }: AnalyzeRendererProps) {
  const displayMode = useAtomValue(analyzeDisplayModeAtom)
  const [isOpen, setIsOpen] = useAtom(analyzeSidebarOpenAtom)
  const [runtimeOpen, setRuntimeOpen] = useAtom(analyzeSidebarOpenRuntimeAtom)
  const selectedType = useAtomValue(selectedAnalysisTypeAtom)

  // Determine which open state to use based on display mode
  const effectiveOpen = displayMode === "side-peek" ? isOpen : runtimeOpen

  const handleClose = useCallback(() => {
    if (displayMode === "side-peek") {
      setIsOpen(false)
    } else {
      setRuntimeOpen(false)
    }
  }, [displayMode, setIsOpen, setRuntimeOpen])

  // Handle fullscreen mode for full-page display
  useEffect(() => {
    if (effectiveOpen && displayMode === "full-page") {
      // Fullscreen handling if needed
    }
  }, [effectiveOpen, displayMode])

  // Render based on display mode
  if (displayMode === "side-peek") {
    return <AnalyzeSidebar />
  }

  if (displayMode === "center-peek") {
    return (
      <AnalyzeDialog
        isOpen={effectiveOpen}
        onClose={handleClose}
        projectId={projectId}
      />
    )
  }

  if (displayMode === "full-page") {
    return (
      <AnalyzeFullscreen
        isOpen={effectiveOpen}
        onClose={handleClose}
        projectId={projectId}
      />
    )
  }

  return null
})
