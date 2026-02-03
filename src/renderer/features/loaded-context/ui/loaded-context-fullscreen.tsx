import { useCallback, useMemo } from "react"
import { useAtom, useSetAtom, useAtomValue } from "jotai"
import { X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { LoadedContextPanel } from "./loaded-context-panel"
import { LoadedContextViewModeSwitcher } from "./loaded-context-view-mode-switcher"
import {
  loadedContextDisplayModeAtom,
  loadedContextSidebarOpenAtom,
  loadedContextSidebarOpenRuntimeAtom,
} from "../atoms"
import { selectedAgentChatIdAtom } from "../../agents/atoms"
import { trpc } from "@/lib/trpc"
import { calculateLoadedContextTokens } from "../types"

/**
 * Format token count for header display
 */
function formatHeaderTokens(tokens: number): string {
  if (tokens < 1000) {
    return tokens.toLocaleString()
  }
  return `${(tokens / 1000).toFixed(1)}k`
}

interface LoadedContextFullscreenProps {
  projectPath?: string
}

export function LoadedContextFullscreen({ projectPath }: LoadedContextFullscreenProps) {
  const [displayMode, setDisplayMode] = useAtom(loadedContextDisplayModeAtom)
  const setIsOpen = useSetAtom(loadedContextSidebarOpenAtom)
  const [runtimeOpen, setRuntimeOpen] = useAtom(loadedContextSidebarOpenRuntimeAtom)
  const selectedChatId = useAtomValue(selectedAgentChatIdAtom)

  // Query the chat to get project info
  const { data: chatData } = trpc.chats.get.useQuery(
    { id: selectedChatId! },
    { enabled: !!selectedChatId }
  )

  // Query project to get path
  const { data: projectData } = trpc.projects.get.useQuery(
    { id: chatData?.projectId || "" },
    { enabled: !!chatData?.projectId }
  )

  // Use provided projectPath or get from project data
  const effectiveProjectPath = projectPath || projectData?.path

  // Fetch loaded context for token calculation
  const { data: contextData } = trpc.loadedContext.getLoadedContext.useQuery(
    { projectPath: effectiveProjectPath },
    { enabled: runtimeOpen }
  )

  // Calculate total tokens
  const totalTokens = useMemo(() => {
    if (!contextData) return 0
    return calculateLoadedContextTokens(contextData).total
  }, [contextData])

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
        <div className="flex items-center gap-2">
          <h1 className="text-lg font-semibold">Session Context</h1>
          {totalTokens > 0 && (
            <span className="text-sm text-muted-foreground">
              ({formatHeaderTokens(totalTokens)} tokens)
            </span>
          )}
        </div>
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
