import { useCallback, useMemo } from "react"
import { useAtom, useSetAtom, useAtomValue } from "jotai"
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

interface LoadedContextDialogProps {
  projectPath?: string
}

export function LoadedContextDialog({ projectPath }: LoadedContextDialogProps) {
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
            <div className="flex items-center gap-2">
              <DialogTitle>Loaded Context</DialogTitle>
              {totalTokens > 0 && (
                <span className="text-xs text-muted-foreground">
                  ({formatHeaderTokens(totalTokens)} tokens)
                </span>
              )}
            </div>
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
