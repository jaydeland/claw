"use client"

import { useAtom, useAtomValue, useSetAtom } from "jotai"
import { useCallback, useEffect } from "react"
import { ResizableSidebar } from "../../../components/ui/resizable-sidebar"
import { trpc } from "../../../lib/trpc"
import { selectedProjectAtom } from "../../agents/atoms"
import {
  analyzeSidebarOpenAtom,
  analyzeSidebarWidthAtom,
  analyzeSidebarOpenRuntimeAtom,
  analyzeDisplayModeAtom,
  effectiveAnalyzeOpenAtom,
} from "../atoms"
import { AnalyzePanel } from "./analyze-panel"

export function AnalyzeSidebar() {
  const selectedProject = useAtomValue(selectedProjectAtom)
  const displayMode = useAtomValue(analyzeDisplayModeAtom)
  const [isOpen, setIsOpen] = useAtom(analyzeSidebarOpenAtom)
  const setRuntimeOpen = useSetAtom(analyzeSidebarOpenRuntimeAtom)
  const effectiveOpen = useAtomValue(effectiveAnalyzeOpenAtom)

  // Subscribe to diagram updates
  const utils = trpc.useUtils()

  useEffect(() => {
    if (!selectedProject?.id) return

    const subscription = utils.analyzer.subscribe.subscribe(
      { projectId: selectedProject.id },
      {
        onData: (update) => {
          console.log("[Analyze] Diagram update:", update)
          // Invalidate queries to refresh data
          utils.analyzer.list.invalidate({ projectId: selectedProject.id })
          utils.analyzer.get.invalidate({ projectId: selectedProject.id, type: update.diagram.type as any })
        },
      }
    )

    return () => {
      subscription.unsubscribe()
    }
  }, [selectedProject?.id, utils])

  const closeSidebar = useCallback(() => {
    if (displayMode === "side-peek") {
      setIsOpen(false)
    } else {
      setRuntimeOpen(false)
    }
  }, [displayMode, setIsOpen, setRuntimeOpen])

  if (!effectiveOpen || !selectedProject) {
    return null
  }

  return (
    <ResizableSidebar
      isOpen={effectiveOpen}
      onClose={closeSidebar}
      widthAtom={analyzeSidebarWidthAtom}
      side="right"
      minWidth={350}
      maxWidth={800}
      animationDuration={0}
      initialWidth={0}
      exitWidth={0}
      showResizeTooltip={true}
      className="bg-background border-l"
      style={{ borderLeftWidth: "0.5px", overflow: "hidden" }}
    >
      <AnalyzePanel projectId={selectedProject.id} onClose={closeSidebar} />
    </ResizableSidebar>
  )
}
