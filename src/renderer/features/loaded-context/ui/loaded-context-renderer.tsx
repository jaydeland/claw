import { useAtomValue } from "jotai"
import { LoadedContextSidebar } from "./loaded-context-sidebar"
import { LoadedContextDialog } from "./loaded-context-dialog"
import { LoadedContextFullscreen } from "./loaded-context-fullscreen"
import {
  loadedContextDisplayModeAtom,
  loadedContextSidebarOpenAtom,
  loadedContextSidebarOpenRuntimeAtom,
} from "../atoms"

interface LoadedContextRendererProps {
  projectPath?: string
}

export function LoadedContextRenderer({ projectPath }: LoadedContextRendererProps) {
  const displayMode = useAtomValue(loadedContextDisplayModeAtom)
  const isSidebarOpen = useAtomValue(loadedContextSidebarOpenAtom)
  const isRuntimeOpen = useAtomValue(loadedContextSidebarOpenRuntimeAtom)

  // Render based on display mode
  if (displayMode === "side-peek") {
    return <LoadedContextSidebar projectPath={projectPath} />
  }

  if (displayMode === "center-peek" && isRuntimeOpen) {
    return <LoadedContextDialog projectPath={projectPath} />
  }

  if (displayMode === "full-page" && isRuntimeOpen) {
    return <LoadedContextFullscreen projectPath={projectPath} />
  }

  return null
}
