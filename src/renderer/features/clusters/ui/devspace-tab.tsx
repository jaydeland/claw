"use client"

import { useState, useMemo, useCallback, useRef, useEffect } from "react"
import { useAtom, useAtomValue } from "jotai"
import {
  FolderSync,
  RefreshCw,
  Loader2,
  Play,
} from "lucide-react"
import { cn } from "../../../lib/utils"
import { trpc } from "../../../lib/trpc"
import { toast } from "sonner"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../../components/ui/select"
import { Terminal } from "../../terminal/terminal"
import { TerminalTabs } from "../../terminal/terminal-tabs"
import { terminalCwdAtom } from "../../terminal/atoms"
import {
  devspaceTerminalsAtom,
  devspaceActiveTerminalIdAtom,
  type DevSpaceTerminalInstance,
} from "../atoms"

/**
 * Generate a unique terminal ID
 */
function generateTerminalId(): string {
  return crypto.randomUUID().slice(0, 8)
}

/**
 * Generate a pane ID from terminal ID
 */
function generatePaneId(terminalId: string): string {
  return `devspace-${terminalId}`
}

export function DevSpaceTab() {
  // Service selection
  const [selectedService, setSelectedService] = useState<string>("")

  // Terminal management
  const [terminals, setTerminals] = useAtom(devspaceTerminalsAtom)
  const [activeTerminalId, setActiveTerminalId] = useAtom(devspaceActiveTerminalIdAtom)
  const terminalCwds = useAtomValue(terminalCwdAtom)

  // tRPC mutation for killing terminal sessions
  const killMutation = trpc.terminal.kill.useMutation()

  // Clear stale terminals on mount to prevent initialization issues
  // DevSpace terminals should not persist across app restarts since PTY sessions won't survive
  useEffect(() => {
    console.log("[DevSpaceTab] Clearing stale terminals from localStorage")
    setTerminals([])
    setActiveTerminalId(null)
  }, []) // Only run once on mount
  // eslint-disable-next-line react-hooks/exhaustive-deps

  // Refs to avoid callback recreation
  const terminalsRef = useRef(terminals)
  terminalsRef.current = terminals
  const activeTerminalIdRef = useRef(activeTerminalId)
  activeTerminalIdRef.current = activeTerminalId

  // Check if devspace is available
  const { data: isAvailable } = trpc.devspace.isAvailable.useQuery()

  // Get devspace settings
  const { data: settings } = trpc.devspace.getSettings.useQuery()

  // Get list of available services
  const {
    data: devspaceServices,
    isLoading: servicesLoading,
    refetch: refetchServices,
    isRefetching: isRefetchingServices,
  } = trpc.devspace.listDevspaceServices.useQuery()

  // Get devspace version
  const { data: version } = trpc.devspace.getVersion.useQuery(undefined, {
    enabled: isAvailable === true,
  })

  // Terminal management callbacks
  const createTerminal = useCallback((serviceName: string, servicePath: string) => {
    const currentTerminals = terminalsRef.current

    const id = generateTerminalId()
    const paneId = generatePaneId(id)

    const newTerminal: DevSpaceTerminalInstance = {
      id,
      paneId,
      serviceName,
      servicePath,
      createdAt: Date.now(),
    }

    setTerminals((prev) => [...prev, newTerminal])
    setActiveTerminalId(id)
  }, [setTerminals, setActiveTerminalId])

  const selectTerminal = useCallback(
    (id: string) => {
      setActiveTerminalId(id)
    },
    [setActiveTerminalId],
  )

  const closeTerminal = useCallback(
    (id: string) => {
      const currentTerminals = terminalsRef.current
      const currentActiveId = activeTerminalIdRef.current

      const terminal = currentTerminals.find((t) => t.id === id)
      if (!terminal) return

      // Kill the session on the backend
      killMutation.mutate({ paneId: terminal.paneId })

      // Remove from state
      const newTerminals = currentTerminals.filter((t) => t.id !== id)
      setTerminals(newTerminals)

      // If we closed the active terminal, switch to another
      if (currentActiveId === id) {
        const newActive = newTerminals[newTerminals.length - 1]?.id || null
        setActiveTerminalId(newActive)
      }
    },
    [setTerminals, setActiveTerminalId, killMutation],
  )

  const renameTerminal = useCallback(
    (id: string, name: string) => {
      setTerminals((prev) =>
        prev.map((t) => (t.id === id ? { ...t, serviceName: name } : t)),
      )
    },
    [setTerminals],
  )

  const closeOtherTerminals = useCallback(
    (id: string) => {
      const currentTerminals = terminalsRef.current

      // Kill all terminals except the one with the given id
      currentTerminals.forEach((terminal) => {
        if (terminal.id !== id) {
          killMutation.mutate({ paneId: terminal.paneId })
        }
      })

      // Keep only the terminal with the given id
      const remainingTerminal = currentTerminals.find((t) => t.id === id)
      setTerminals(remainingTerminal ? [remainingTerminal] : [])
      setActiveTerminalId(id)
    },
    [setTerminals, setActiveTerminalId, killMutation],
  )

  const closeTerminalsToRight = useCallback(
    (id: string) => {
      const currentTerminals = terminalsRef.current

      const index = currentTerminals.findIndex((t) => t.id === id)
      if (index === -1) return

      // Kill terminals to the right
      currentTerminals.slice(index + 1).forEach((terminal) => {
        killMutation.mutate({ paneId: terminal.paneId })
      })

      // Keep terminals up to and including the given id
      setTerminals(currentTerminals.slice(0, index + 1))
    },
    [setTerminals, killMutation],
  )

  // Handle starting a devspace service
  const handleStartDevspace = () => {
    if (!selectedService) {
      toast.error("Please select a service first")
      return
    }

    const service = devspaceServices?.find((s) => s.name === selectedService)
    if (!service) {
      toast.error("Service not found")
      return
    }

    // Create a new terminal
    createTerminal(service.name, service.path)
    toast.success(`Starting ${service.name}`)
  }

  // Get the active terminal
  const activeTerminal = useMemo(
    () => terminals.find((t) => t.id === activeTerminalId) || null,
    [terminals, activeTerminalId],
  )

  // Check if repos path is configured
  const hasReposPath = settings?.effectiveReposPath

  if (isAvailable === false) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 text-muted-foreground">
        <div className="p-4 rounded-full bg-muted/50">
          <FolderSync className="h-8 w-8" />
        </div>
        <div className="text-center">
          <h3 className="text-lg font-medium text-foreground">DevSpace Not Found</h3>
          <p className="text-sm mt-1">
            DevSpace CLI is not installed or not in your PATH.
          </p>
          <a
            href="https://devspace.sh/docs/getting-started/installation"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-primary hover:underline mt-2 inline-block"
          >
            Install DevSpace
          </a>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Control Bar */}
      <div className="p-4 border-b border-border flex items-center gap-4 flex-shrink-0">
        {/* Service Selector */}
        <span className="text-sm font-medium whitespace-nowrap">Service:</span>
        <Select
          value={selectedService}
          onValueChange={setSelectedService}
        >
          <SelectTrigger className="w-full max-w-sm h-8 text-xs">
            <SelectValue placeholder={hasReposPath ? "Select a service" : "Configure repos path in Kubernetes settings"} />
          </SelectTrigger>
          <SelectContent>
            {servicesLoading ? (
              <div className="flex items-center gap-2 p-2 text-sm text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" />
                Loading services...
              </div>
            ) : !hasReposPath ? (
              <div className="p-2 text-sm text-muted-foreground">
                Configure repos path in Kubernetes settings
              </div>
            ) : devspaceServices && devspaceServices.length > 0 ? (
              devspaceServices.map((service) => (
                <SelectItem key={service.name} value={service.name}>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs">{service.name}</span>
                    {service.hasDevConfig && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-500/20 text-green-400">
                        config found
                      </span>
                    )}
                  </div>
                </SelectItem>
              ))
            ) : (
              <div className="p-2 text-sm text-muted-foreground">
                No services found in repos path
              </div>
            )}
          </SelectContent>
        </Select>

        <button
          type="button"
          onClick={() => refetchServices()}
          disabled={isRefetchingServices}
          className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded transition-colors"
          title="Refresh services"
        >
          <RefreshCw className={cn("h-4 w-4", isRefetchingServices && "animate-spin")} />
        </button>

        <button
          type="button"
          onClick={handleStartDevspace}
          disabled={!selectedService || !hasReposPath}
          className={cn(
            "px-3 py-1.5 text-xs bg-primary text-primary-foreground hover:bg-primary/90 rounded-md flex items-center gap-1",
            (!selectedService || !hasReposPath) && "opacity-50 cursor-not-allowed"
          )}
        >
          <Play className="h-3 w-3" />
          Start
        </button>

        <div className="flex-1" />

        {/* Version info */}
        {version && (
          <span className="text-xs text-muted-foreground whitespace-nowrap">
            DevSpace v{version.split('\n')[0]}
          </span>
        )}
      </div>

      {/* Terminal Tabs and Content */}
      {terminals.length > 0 ? (
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
          {/* Terminal Tabs */}
          <TerminalTabs
            terminals={terminals.map(t => ({
              id: t.id,
              paneId: t.paneId,
              name: t.serviceName,
              createdAt: t.createdAt,
              cwd: t.servicePath,
              initialCwd: t.servicePath,
            }))}
            activeTerminalId={activeTerminalId}
            cwds={terminalCwds}
            onSelectTerminal={selectTerminal}
            onCloseTerminal={closeTerminal}
            onRenameTerminal={renameTerminal}
            onCloseOthers={closeOtherTerminals}
            onCloseToRight={closeTerminalsToRight}
            onCreateTerminal={() => {
              // Show hint to select service
              if (!selectedService) {
                toast.info("Select a service and click Start to add a terminal")
              } else {
                handleStartDevspace()
              }
            }}
          />

          {/* Active Terminal */}
          {activeTerminal && (
            <div className="flex-1 min-h-0 overflow-hidden">
              <Terminal
                paneId={activeTerminal.paneId}
                cwd={activeTerminal.servicePath}
                workspaceId="devspace"
                initialCommands={[settings?.startCommand || "devspace dev"]}
              />
            </div>
          )}
        </div>
      ) : (
        <div className="flex-1 min-h-0 overflow-hidden flex flex-col items-center justify-center text-muted-foreground gap-4">
          <div className="p-4 rounded-full bg-muted/50">
            <FolderSync className="h-8 w-8" />
          </div>
          <div className="text-center">
            <h3 className="text-lg font-medium text-foreground">DevSpace Terminal</h3>
            <p className="text-sm mt-1">
              Select a service and click Start to launch DevSpace
            </p>
            {!hasReposPath && (
              <p className="text-sm mt-2 text-amber-500">
                Configure repos path in Kubernetes settings first
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
