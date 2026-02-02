import { useCallback } from "react"
import { useAtom, useSetAtom } from "jotai"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { LoadedContextPanel } from "./loaded-context-panel"
import { LoadedContextViewModeSwitcher } from "./loaded-context-view-mode-switcher"
import {
  loadedContextDisplayModeAtom,
  loadedContextSidebarOpenAtom,
  loadedContextSidebarOpenRuntimeAtom,
} from "../atoms"

interface LoadedContextDialogProps {
  projectPath?: string
}

export function LoadedContextDialog({ projectPath }: LoadedContextDialogProps) {
  const [displayMode, setDisplayMode] = useAtom(loadedContextDisplayModeAtom)
  const setIsOpen = useSetAtom(loadedContextSidebarOpenAtom)
  const [runtimeOpen, setRuntimeOpen] = useAtom(loadedContextSidebarOpenRuntimeAtom)

  const handleOpenChange = useCallback((open: boolean) => {
    setRuntimeOpen(open)
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

  return (
    <Dialog open={runtimeOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <div className="flex items-center justify-between">
            <DialogTitle>Loaded Context</DialogTitle>
            <LoadedContextViewModeSwitcher
              mode={displayMode}
              onModeChange={handleModeChange}
            />
          </div>
        </DialogHeader>
        <div className="flex-1 overflow-auto -mx-6 px-6">
          <LoadedContextPanel projectPath={projectPath} />
        </div>
      </DialogContent>
    </Dialog>
  )
}
