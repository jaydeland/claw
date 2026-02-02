import { useCallback } from "react"
import { useAtom, useSetAtom } from "jotai"
import { X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { LoadedContextPanel } from "./loaded-context-panel"
import { LoadedContextViewModeSwitcher } from "./loaded-context-view-mode-switcher"
import {
  loadedContextDisplayModeAtom,
  loadedContextSidebarOpenAtom,
  loadedContextSidebarOpenRuntimeAtom,
} from "../atoms"

interface LoadedContextFullscreenProps {
  projectPath?: string
}

export function LoadedContextFullscreen({ projectPath }: LoadedContextFullscreenProps) {
  const [displayMode, setDisplayMode] = useAtom(loadedContextDisplayModeAtom)
  const setIsOpen = useSetAtom(loadedContextSidebarOpenAtom)
  const [runtimeOpen, setRuntimeOpen] = useAtom(loadedContextSidebarOpenRuntimeAtom)

  const handleClose = useCallback(() => {
    setRuntimeOpen(false)
  }, [setRuntimeOpen])

  const handleModeChange = useCallback((newMode: "side-peek" | "center-peek" | "full-page") => {
    setDisplayMode(newMode)
    if (newMode === "side-peek") {
      setIsOpen(true)
      setRuntimeOpen(false)
    } else {
      setRuntimeOpen(true)
    }
  }, [setDisplayMode, setIsOpen, setRuntimeOpen])

  if (!runtimeOpen) return null

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <h1 className="text-lg font-semibold">Loaded Context</h1>
        <div className="flex items-center gap-2">
          <LoadedContextViewModeSwitcher
            mode={displayMode}
            onModeChange={handleModeChange}
          />
          <Button
            variant="ghost"
            size="icon"
            onClick={handleClose}
            className="h-8 w-8"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        <div className="max-w-4xl mx-auto py-4">
          <LoadedContextPanel projectPath={projectPath} />
        </div>
      </div>
    </div>
  )
}
