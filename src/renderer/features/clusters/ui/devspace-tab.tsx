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
import {
  terminalCwdAtom,
  terminalsAtom,
  activeTerminalIdAtom,
  DEVSPACE_TERMINAL_ID,
} from "../../terminal/atoms"
import type { TerminalInstance } from "../../terminal/types"
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
 * Uses format `devspace:term:{id}` to match standard terminal pattern
 */
function generatePaneId(terminalId: string): string {
  return `devspace:term:${terminalId}`
}

// Module-level flag to track if we've cleared terminals this app session
// This prevents clearing terminals on every remount (e.g., when navigating between tabs)
let hasInitializedThisSession = false

export function DevSpaceTab() {
  // Service selection
  const [selectedService, setSelectedService] = useState<string>("")
  const [selectedBranch, setSelectedBranch] = useState<string>("")

  // Terminal management - DevSpace atoms
  const [terminals, setTerminals] = useAtom(devspaceTerminalsAtom)
  const [activeTerminalId, setActiveTerminalId] = useAtom(devspaceActiveTerminalIdAtom)
  const terminalCwds = useAtomValue(terminalCwdAtom)

  // Terminal management - Main terminal view atoms (for dual registration)
  const [allTerminals, setAllTerminals] = useAtom(terminalsAtom)
  const [allActiveIds, setAllActiveIds] = useAtom(activeTerminalIdAtom)

  // tRPC mutation for killing terminal sessions
  const killMutation = trpc.terminal.kill.useMutation()

  // Smart cleanup: remove terminals with dead PTY sessions on first mount
  // This preserves terminals that have live backend sessions while cleaning up stale ones
  useEffect(() => {
    if (hasInitializedThisSession) {
      console.log("[DevSpaceTab] Skipping terminal cleanup - already initialized this session")
      return
    }
    hasInitializedThisSession = true

    const cleanupDeadTerminals = async () => {
      console.log("[DevSpaceTab] First mount - checking terminal health")
      const aliveTerminals: DevSpaceTerminalInstance[] = []

      for (const terminal of terminals) {
        try {
          const isAlive = await trpc.terminal.isSessionAlive.mutate({ paneId: terminal.paneId })
          if (isAlive) {
            aliveTerminals.push(terminal)
            console.log(`[DevSpaceTab] Terminal ${terminal.serviceName} is alive`)
          } else {
            console.log(`[DevSpaceTab] Removing dead terminal: ${terminal.serviceName}`)
          }
        } catch (error) {
          console.error(`[DevSpaceTab] Failed to check terminal ${terminal.id}:`, error)
          // If check fails, assume dead and remove
        }
      }

      // Update state only if there were dead terminals
      if (aliveTerminals.length !== terminals.length) {
        setTerminals(aliveTerminals)
        // If active terminal was removed, clear it
        if (activeTerminalId && !aliveTerminals.find(t => t.id === activeTerminalId)) {
          setActiveTerminalId(null)
        }
      }

      // Also clean up from main terminal view
      setAllTerminals((prev) => {
        if (!prev[DEVSPACE_TERMINAL_ID]) return prev
        const devspaceTerminals = prev[DEVSPACE_TERMINAL_ID]
        const aliveIds = new Set(aliveTerminals.map(t => t.id))
        const filtered = devspaceTerminals.filter(t => aliveIds.has(t.id))
        if (filtered.length === devspaceTerminals.length) return prev
        return { ...prev, [DEVSPACE_TERMINAL_ID]: filtered }
      })
    }

    cleanupDeadTerminals()
  }, [terminals, activeTerminalId, setTerminals, setActiveTerminalId, setAllTerminals]) // Include dependencies

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

  // Get branches for selected service
  const selectedServicePath = useMemo(() => {
    if (!selectedService || !devspaceServices) return null
    const service = devspaceServices.find((s) => s.name === selectedService)
    return service?.path ?? null
  }, [selectedService, devspaceServices])

  const {
    data: branchData,
    isLoading: branchesLoading,
    refetch: refetchBranches,
    isRefetching: isRefetchingBranches,
    error: branchError,
  } = trpc.devspace.listBranches.useQuery(
    { servicePath: selectedServicePath! },
    { enabled: !!selectedServicePath }
  )

  // Auto-select current branch when branches load or reset when service changes
  useEffect(() => {
    if (branchData?.currentBranch) {
      setSelectedBranch(branchData.currentBranch)
    } else {
      setSelectedBranch("")
    }
  }, [branchData?.currentBranch, selectedService])

  // Terminal management callbacks
  const createTerminal = useCallback((serviceName: string, servicePath: string, targetBranch?: string) => {
    const id = generateTerminalId()
    const paneId = generatePaneId(id)
    const createdAt = Date.now()

    // Create DevSpace terminal instance
    const newDevspaceTerminal: DevSpaceTerminalInstance = {
      id,
      paneId,
      serviceName,
      servicePath,
      createdAt,
      targetBranch,
    }

    // Create matching TerminalInstance for main terminal view
    const newTerminalInstance: TerminalInstance = {
      id,
      paneId,
      name: serviceName,
      createdAt,
      cwd: servicePath,
    }

    // Register in DevSpace atoms
    setTerminals((prev) => [...prev, newDevspaceTerminal])
    setActiveTerminalId(id)

    // Register in main terminal view atoms (dual registration)
    setAllTerminals((prev) => ({
      ...prev,
      [DEVSPACE_TERMINAL_ID]: [...(prev[DEVSPACE_TERMINAL_ID] || []), newTerminalInstance],
    }))
    setAllActiveIds((prev) => ({
      ...prev,
      [DEVSPACE_TERMINAL_ID]: id,
    }))
  }, [setTerminals, setActiveTerminalId, setAllTerminals, setAllActiveIds])

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

      // Remove from DevSpace state
      const newTerminals = currentTerminals.filter((t) => t.id !== id)
      setTerminals(newTerminals)

      // Remove from main terminal view state
      setAllTerminals((prev) => ({
        ...prev,
        [DEVSPACE_TERMINAL_ID]: (prev[DEVSPACE_TERMINAL_ID] || []).filter((t) => t.id !== id),
      }))

      // If we closed the active terminal, switch to another
      if (currentActiveId === id) {
        const newActive = newTerminals[newTerminals.length - 1]?.id || null
        setActiveTerminalId(newActive)
        setAllActiveIds((prev) => ({
          ...prev,
          [DEVSPACE_TERMINAL_ID]: newActive,
        }))
      }
    },
    [setTerminals, setActiveTerminalId, setAllTerminals, setAllActiveIds, killMutation],
  )

  const renameTerminal = useCallback(
    (id: string, name: string) => {
      // Update DevSpace state
      setTerminals((prev) =>
        prev.map((t) => (t.id === id ? { ...t, serviceName: name } : t)),
      )
      // Update main terminal view state
      setAllTerminals((prev) => ({
        ...prev,
        [DEVSPACE_TERMINAL_ID]: (prev[DEVSPACE_TERMINAL_ID] || []).map((t) =>
          t.id === id ? { ...t, name } : t
        ),
      }))
    },
    [setTerminals, setAllTerminals],
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

      // Keep only the terminal with the given id in DevSpace state
      const remainingTerminal = currentTerminals.find((t) => t.id === id)
      setTerminals(remainingTerminal ? [remainingTerminal] : [])
      setActiveTerminalId(id)

      // Keep only the terminal with the given id in main terminal view state
      setAllTerminals((prev) => ({
        ...prev,
        [DEVSPACE_TERMINAL_ID]: (prev[DEVSPACE_TERMINAL_ID] || []).filter((t) => t.id === id),
      }))
      setAllActiveIds((prev) => ({
        ...prev,
        [DEVSPACE_TERMINAL_ID]: id,
      }))
    },
    [setTerminals, setActiveTerminalId, setAllTerminals, setAllActiveIds, killMutation],
  )

  const closeTerminalsToRight = useCallback(
    (id: string) => {
      const currentTerminals = terminalsRef.current

      const index = currentTerminals.findIndex((t) => t.id === id)
      if (index === -1) return

      // Get IDs of terminals to the right
      const idsToRemove = new Set(currentTerminals.slice(index + 1).map((t) => t.id))

      // Kill terminals to the right
      currentTerminals.slice(index + 1).forEach((terminal) => {
        killMutation.mutate({ paneId: terminal.paneId })
      })

      // Keep terminals up to and including the given id in DevSpace state
      setTerminals(currentTerminals.slice(0, index + 1))

      // Keep terminals up to and including the given id in main terminal view state
      setAllTerminals((prev) => ({
        ...prev,
        [DEVSPACE_TERMINAL_ID]: (prev[DEVSPACE_TERMINAL_ID] || []).filter((t) => !idsToRemove.has(t.id)),
      }))
    },
    [setTerminals, setAllTerminals, killMutation],
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

    // Determine if we need to checkout a different branch
    const needsBranchSwitch = selectedBranch && selectedBranch !== branchData?.currentBranch

    // Create a new terminal with optional branch
    createTerminal(service.name, service.path, needsBranchSwitch ? selectedBranch : undefined)
    toast.success(`Starting ${service.name}${needsBranchSwitch ? ` on branch ${selectedBranch}` : ""}`)
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
            ) : devspaceServices && devspaceServices.filter(s => s.hasDevConfig).length > 0 ? (
              devspaceServices.filter(s => s.hasDevConfig).map((service) => (
                <SelectItem key={service.name} value={service.name}>
                  <span className="font-mono text-xs">{service.name}</span>
                </SelectItem>
              ))
            ) : (
              <div className="p-2 text-sm text-muted-foreground">
                No services with devspace config found
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

        {/* Branch Selector - only shown when service is selected */}
        {selectedService && (
          <>
            <span className="text-sm font-medium whitespace-nowrap">Branch:</span>
            <Select
              value={selectedBranch || undefined}
              onValueChange={setSelectedBranch}
              disabled={branchesLoading}
            >
              <SelectTrigger className="w-[180px] h-8 text-xs">
                <span className="truncate">
                  <SelectValue placeholder={branchesLoading ? "Loading..." : (branchError || branchData?.error) ? "Error loading" : "Select branch"} />
                </span>
              </SelectTrigger>
              <SelectContent>
                {branchesLoading ? (
                  <div className="flex items-center gap-2 p-2 text-sm text-muted-foreground">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Loading branches...
                  </div>
                ) : branchError ? (
                  <div className="p-2 text-sm text-red-400">
                    Error: {branchError.message}
                  </div>
                ) : branchData?.error ? (
                  <div className="p-2 text-sm text-red-400">
                    {branchData.error}
                  </div>
                ) : branchData?.branches && branchData.branches.length > 0 ? (
                  branchData.branches.map((branch) => (
                    <SelectItem key={branch} value={branch}>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs">{branch}</span>
                        {branch === branchData.currentBranch && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400">
                            current
                          </span>
                        )}
                      </div>
                    </SelectItem>
                  ))
                ) : (
                  <div className="p-2 text-sm text-muted-foreground">
                    No branches found
                  </div>
                )}
              </SelectContent>
            </Select>

            <button
              type="button"
              onClick={() => refetchBranches()}
              disabled={isRefetchingBranches}
              className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded transition-colors"
              title="Refresh branches"
            >
              <RefreshCw className={cn("h-4 w-4", isRefetchingBranches && "animate-spin")} />
            </button>
          </>
        )}

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
            onCloseOtherTerminals={closeOtherTerminals}
            onCloseTerminalsToRight={closeTerminalsToRight}
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
                initialCommands={
                  activeTerminal.targetBranch
                    ? [`git checkout ${activeTerminal.targetBranch}`, settings?.startCommand || "devspace dev"]
                    : [settings?.startCommand || "devspace dev"]
                }
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
