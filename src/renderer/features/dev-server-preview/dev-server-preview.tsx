"use client"

import { useState, useRef, useCallback, useEffect, useMemo } from "react"
import { useAtom, useAtomValue, useSetAtom } from "jotai"
import { Button } from "../../components/ui/button"
import { RotateCw, ExternalLink, Play, AlertCircle } from "lucide-react"
import {
  ExternalLinkIcon,
  IconDoubleChevronRight,
} from "../../components/ui/icons"
import { Kbd } from "../../components/ui/kbd"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "../../components/ui/tooltip"
import { cn } from "../../lib/utils"
import {
  devServerPreviewUrlAtomFamily,
  devServerPreviewPortAtomFamily,
  devServerPreviewDisplayModeAtom,
  devServerPreviewSidebarOpenAtom,
  devServerPreviewSidebarOpenRuntimeAtom,
} from "./atoms"
import { trpc } from "../../lib/trpc"
import type { DetectedPort } from "../../main/lib/terminal/types"
import { toast } from "sonner"
import {
  agentsSettingsDialogOpenAtom,
  agentsSettingsDialogActiveTabAtom,
} from "../../lib/atoms"

interface DevServerPreviewProps {
  chatId: string
  workspaceId: string
  hideHeader?: boolean
  onClose?: () => void
  isMobile?: boolean
}

/**
 * DevServerPreview - Browser-like preview pane for dev servers
 *
 * Features:
 * - Auto-detects running dev servers from terminal processes
 * - Displays web server in an iframe-based browser view
 * - URL bar for manual navigation
 * - Refresh and external browser buttons
 * - Port selection when multiple servers are running
 */
export function DevServerPreview({
  chatId,
  workspaceId,
  hideHeader = false,
  onClose,
  isMobile = false,
}: DevServerPreviewProps) {
  const [isLoaded, setIsLoaded] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [showPortDropdown, setShowPortDropdown] = useState(false)
  const iframeRef = useRef<HTMLIFrameElement>(null)

  // State atoms
  const [url, setUrl] = useAtom(devServerPreviewUrlAtomFamily(chatId))
  const [selectedPort, setSelectedPort] = useAtom(devServerPreviewPortAtomFamily(chatId))
  const displayMode = useAtomValue(devServerPreviewDisplayModeAtom)
  const setIsSidebarOpen = useSetAtom(devServerPreviewSidebarOpenAtom)
  const setRuntimeOpen = useSetAtom(devServerPreviewSidebarOpenRuntimeAtom)

  // Query for detected ports in this workspace
  const { data: detectedPorts, refetch } = trpc.terminal.getPortsByWorkspace.useQuery(
    { workspaceId },
    {
      refetchInterval: 3000, // Poll every 3 seconds for port changes
      enabled: !!workspaceId,
    }
  )

  // Mutation for starting dev server (direct terminal execution)
  const createTerminalMutation = trpc.terminal.createOrAttach.useMutation({
    onSuccess: () => {
      toast.success("Dev server started", {
        description: "Running start commands in terminal",
      })
      // Refetch ports after 3 seconds to detect running server
      setTimeout(() => refetch(), 3000)
    },
    onError: (err) => {
      toast.error("Failed to start dev server", {
        description: err.message,
      })
    },
  })

  // Settings dialog atoms
  const setSettingsDialogOpen = useSetAtom(agentsSettingsDialogOpenAtom)
  const setSettingsActiveTab = useSetAtom(agentsSettingsDialogActiveTabAtom)

  // Query chat data to get project ID
  const { data: chatData } = trpc.chats.get.useQuery(
    { id: chatId },
    { enabled: !!chatId }
  )
  const projectId = chatData?.projectId

  // Query project to get project path
  const { data: projectData } = trpc.projects.get.useQuery(
    { id: projectId || "" },
    { enabled: !!projectId }
  )
  const projectPath = projectData?.path

  // Get start commands for the project
  const { data: startCommandsData } = trpc.projects.getStartCommands.useQuery(
    { id: projectId || "" },
    { enabled: !!projectId }
  )
  const startCommands = startCommandsData?.commands || []
  const hasStartCommands = startCommands.length > 0

  // Handle play button click - check startCommands and either open settings or run command
  const handlePlayClick = () => {
    if (!hasStartCommands) {
      // No start commands configured - open settings dialog
      setSettingsDialogOpen(true)
      setSettingsActiveTab("devserver")
      toast.info("Configure dev server", {
        description: "Please set up start commands in settings",
      })
    } else {
      // Start commands configured - run them directly in terminal
      const paneId = `dev-server-${Date.now()}`
      createTerminalMutation.mutate({
        paneId,
        workspaceId,
        cwd: projectPath || "~",
        initialCommands: startCommands,
      })
    }
  }

  // Auto-select first port when ports change and no port is selected
  useEffect(() => {
    if (detectedPorts && detectedPorts.length > 0 && !selectedPort) {
      const firstPort = detectedPorts[0]
      const defaultUrl = `http://localhost:${firstPort.port}/`
      setSelectedPort(firstPort.port)
      setUrl(defaultUrl)
    }
  }, [detectedPorts, selectedPort, setSelectedPort, setUrl])

  // Build the preview URL from selected port
  const previewUrl = useMemo(() => {
    if (url && url.startsWith("http")) {
      return url
    }
    if (selectedPort) {
      return `http://localhost:${selectedPort}/`
    }
    return ""
  }, [url, selectedPort])

  // Handle port selection
  const handlePortSelect = useCallback((port: DetectedPort) => {
    const newUrl = `http://localhost:${port.port}/`
    setSelectedPort(port.port)
    setUrl(newUrl)
    setIsLoaded(false)
    setShowPortDropdown(false)
  }, [setSelectedPort, setUrl])

  // Handle manual URL input
  const handleUrlChange = useCallback((newUrl: string) => {
    setUrl(newUrl)
    setIsLoaded(false)
  }, [setUrl])

  // Handle refresh
  const handleReload = useCallback(() => {
    if (isRefreshing) return
    setIsRefreshing(true)
    setIsLoaded(false)
    setReloadKey((prev) => prev + 1)
    setTimeout(() => setIsRefreshing(false), 400)
  }, [isRefreshing])

  // Handle external browser
  const handleOpenExternal = useCallback(() => {
    if (previewUrl) {
      window.open(previewUrl, "_blank")
    }
  }, [previewUrl])

  // Handle close based on display mode
  const handleClose = useCallback(() => {
    if (displayMode === "side-peek") {
      setIsSidebarOpen(false)
    } else {
      setRuntimeOpen(false)
    }
    onClose?.()
  }, [displayMode, setIsSidebarOpen, setRuntimeOpen, onClose])

  // Handle iframe load
  const handleIframeLoad = useCallback(() => {
    setIsLoaded(true)
  }, [])

  // Handle iframe error
  const handleIframeError = useCallback(() => {
    setIsLoaded(true) // Stop loading state even on error
  }, [])

  // Render port selection dropdown
  const renderPortSelector = () => {
    if (!detectedPorts || detectedPorts.length === 0) {
      return null
    }

    return (
      <div className="relative">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowPortDropdown(!showPortDropdown)}
          className={cn(
            "h-7 px-2 gap-1.5 text-xs",
            showPortDropdown && "bg-muted"
          )}
        >
          <Play className="h-3.5 w-3.5" />
          <span>{selectedPort || "Select"}</span>
          <ChevronDown className="h-3.5 w-3.5" />
        </Button>

        {showPortDropdown && (
          <div className="absolute top-full right-0 mt-1 bg-popover border rounded-md shadow-lg z-50 min-w-[200px]">
            <div className="p-1">
              {detectedPorts.map((portInfo) => (
                <button
                  key={`${portInfo.paneId}-${portInfo.port}`}
                  onClick={() => handlePortSelect(portInfo)}
                  className={cn(
                    "w-full text-left px-2 py-1.5 rounded text-xs flex items-center gap-2",
                    selectedPort === portInfo.port
                      ? "bg-accent text-accent-foreground"
                      : "hover:bg-accent/50"
                  )}
                >
                  <Play className="h-3 w-3 flex-shrink-0" />
                  <span className="flex-1 font-mono">:{portInfo.port}</span>
                  <span className="text-muted-foreground truncate max-w-[100px]">
                    {portInfo.processName}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    )
  }

  // No ports detected - show empty state
  if (!detectedPorts || detectedPorts.length === 0) {
    return (
      <div className={cn(
        "flex flex-col bg-background",
        isMobile ? "h-full w-full" : "h-full"
      )}>
        {!hideHeader && (
          <div className="flex items-center justify-between px-3 h-10 bg-background border-b flex-shrink-0">
            <div className="flex items-center gap-1">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleClose}
                    className="h-7 w-7 p-0 hover:bg-muted"
                  >
                    <IconDoubleChevronRight className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  Close preview
                  <Kbd>⌘J</Kbd>
                </TooltipContent>
              </Tooltip>
            </div>
          </div>
        )}

        <div className="flex-1 flex items-center justify-center p-6">
          <div className="text-center space-y-4 max-w-sm">
            <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mx-auto">
              <AlertCircle className="h-6 w-6 text-muted-foreground" />
            </div>
            <div className="space-y-2">
              <h3 className="font-medium text-foreground">No dev servers running</h3>
              {createTerminalMutation.isPending ? (
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">
                    Starting development server...
                  </p>
                  <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
                    <RotateCw className="h-3 w-3 animate-spin" />
                    <span>Running start commands in terminal</span>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">
                    {hasStartCommands
                      ? "Start the configured development server"
                      : "Configure a development server to preview it here"}
                  </p>
                  {projectId ? (
                    <Button
                      variant="default"
                      size="sm"
                      onClick={handlePlayClick}
                      className="w-full"
                    >
                      <Play className="h-3.5 w-3.5 mr-2" />
                      {hasStartCommands ? "Start Dev Server" : "Configure Dev Server"}
                    </Button>
                  ) : (
                    <div className="bg-muted rounded-md p-3 text-xs font-mono text-left space-y-1">
                      <div>• bun run dev</div>
                      <div>• npm run dev</div>
                      <div>• yarn dev</div>
                      <div>• pnpm dev</div>
                    </div>
                  )}
                </div>
              )}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={refetch}
              className="w-full"
              disabled={createTerminalMutation.isPending}
            >
              <RotateCw className="h-3.5 w-3.5 mr-2" />
              Refresh
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={cn(
      "flex flex-col bg-background",
      isMobile ? "h-full w-full" : "h-full"
    )}>
      {/* Header */}
      {!hideHeader && (
        <div className="flex items-center justify-between px-2 h-10 bg-background border-b flex-shrink-0">
          {/* Left: Close + Refresh */}
          <div className="flex items-center gap-0.5">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleClose}
                  className="h-7 w-7 p-0 hover:bg-muted"
                >
                  <IconDoubleChevronRight className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                Close preview
                <Kbd>⌘J</Kbd>
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleReload}
                  disabled={isRefreshing || !previewUrl}
                  className="h-7 w-7 p-0 hover:bg-muted"
                >
                  <RotateCw
                    className={cn(
                      "h-3.5 w-3.5",
                      isRefreshing && "animate-spin"
                    )}
                  />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                Refresh preview
              </TooltipContent>
            </Tooltip>
          </div>

          {/* Center: URL bar */}
          <div className="flex-1 mx-2 min-w-0 flex items-center justify-center">
            <input
              type="text"
              value={url || `http://localhost:${selectedPort || "..."}/`}
              onChange={(e) => handleUrlChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault()
                  setIsLoaded(false)
                  ;(e.target as HTMLInputElement).blur()
                }
              }}
              className="w-full max-w-md h-7 px-2 text-xs bg-muted border rounded-md focus:outline-none focus:ring-1 focus:ring-ring font-mono"
              placeholder="Enter URL..."
            />
          </div>

          {/* Right: Port selector + External link */}
          <div className="flex items-center gap-0.5">
            {renderPortSelector()}

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleOpenExternal}
                  disabled={!previewUrl}
                  className="h-7 w-7 p-0 hover:bg-muted"
                >
                  <ExternalLinkIcon className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                Open in browser
              </TooltipContent>
            </Tooltip>
          </div>
        </div>
      )}

      {/* Iframe Content */}
      <div className="flex-1 relative overflow-hidden bg-background">
        {previewUrl ? (
          <>
            <iframe
              ref={iframeRef}
              key={reloadKey}
              src={previewUrl}
              width="100%"
              height="100%"
              style={{ border: "none" }}
              title="Dev Server Preview"
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals allow-popups-to-escape-sandbox"
              onLoad={handleIframeLoad}
              onError={handleIframeError}
            />

            {/* Loading overlay */}
            {!isLoaded && (
              <div className="absolute inset-0 flex items-center justify-center bg-background z-10">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <RotateCw className="h-4 w-4 animate-spin" />
                  <span className="text-sm">Loading...</span>
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
            Select a port to preview
          </div>
        )}
      </div>
    </div>
  )
}

// Simple ChevronDown icon component
function ChevronDown({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  )
}
