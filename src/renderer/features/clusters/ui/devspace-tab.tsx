"use client"

import { useState, useEffect, useRef, useMemo } from "react"
import {
  FolderSync,
  RefreshCw,
  Loader2,
  AlertTriangle,
  X,
  Play,
  Pause,
  WrapText,
  Filter,
} from "lucide-react"
import { cn } from "../../../lib/utils"
import { trpc } from "../../../lib/trpc"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../../components/ui/select"
import { Checkbox } from "../../../components/ui/checkbox"
import { Input } from "../../../components/ui/input"

interface DevSpaceLogEntry {
  timestamp: string
  level: "info" | "warn" | "error" | "debug"
  message: string
  raw: string
}

interface DevSpaceProcess {
  pid: number
  command: string
  workingDir: string
  startTime: string
}

/**
 * Get color class based on log level
 */
function getLevelColor(level: DevSpaceLogEntry["level"]): string {
  switch (level) {
    case "error":
      return "text-red-400"
    case "warn":
      return "text-amber-400"
    case "debug":
      return "text-purple-400"
    case "info":
    default:
      return "text-blue-400"
  }
}

/**
 * Get background color for log level badge
 */
function getLevelBadgeClass(level: DevSpaceLogEntry["level"]): string {
  switch (level) {
    case "error":
      return "bg-red-500/20 text-red-400"
    case "warn":
      return "bg-amber-500/20 text-amber-400"
    case "debug":
      return "bg-purple-500/20 text-purple-400"
    case "info":
    default:
      return "bg-blue-500/20 text-blue-400"
  }
}

export function DevSpaceTab() {
  const [selectedProcess, setSelectedProcess] = useState<number | null>(null)
  const [isStreaming, setIsStreaming] = useState(false)
  const [logs, setLogs] = useState<DevSpaceLogEntry[]>([])
  const [streamError, setStreamError] = useState<string | null>(null)
  const [autoScroll, setAutoScroll] = useState(true)
  const [wrapText, setWrapText] = useState(true)
  const [filterText, setFilterText] = useState("")
  const [filterLevel, setFilterLevel] = useState<DevSpaceLogEntry["level"] | "all">("all")
  const logsEndRef = useRef<HTMLDivElement>(null)

  // Check if devspace is available
  const { data: isAvailable } = trpc.devspace.isAvailable.useQuery()

  // Get devspace version
  const { data: version } = trpc.devspace.getVersion.useQuery(undefined, {
    enabled: isAvailable === true,
  })

  // Get list of active devspace processes
  const {
    data: processes,
    isLoading: processesLoading,
    refetch: refetchProcesses,
    isRefetching,
  } = trpc.devspace.listProcesses.useQuery(undefined, {
    refetchInterval: 10000, // Refresh every 10 seconds
  })

  // Stream logs using tRPC subscription
  trpc.devspace.streamLogs.useSubscription(
    { pid: selectedProcess! },
    {
      enabled: isStreaming && selectedProcess !== null,
      onData: (log) => {
        setStreamError(null)
        setLogs((prev) => {
          const updated = [...prev, log]
          // Keep only last 1000 logs
          return updated.slice(-1000)
        })
      },
      onError: (error) => {
        console.error("[DevSpaceTab] Stream error:", error)
        setStreamError(error.message || "Failed to stream logs")
        setIsStreaming(false)
      },
    }
  )

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (autoScroll && logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: "smooth" })
    }
  }, [logs, autoScroll])

  // Clear selection if selected process is no longer available
  useEffect(() => {
    if (selectedProcess && processes) {
      const stillExists = processes.some((p) => p.pid === selectedProcess)
      if (!stillExists) {
        setSelectedProcess(null)
        setIsStreaming(false)
        setLogs([])
      }
    }
  }, [processes, selectedProcess])

  const handleProcessSelect = (pidStr: string) => {
    const pid = parseInt(pidStr, 10)
    if (!isNaN(pid)) {
      setSelectedProcess(pid)
      setLogs([])
      setStreamError(null)
      setIsStreaming(false)
    }
  }

  const handleStartStreaming = () => {
    if (!selectedProcess) return
    setLogs([])
    setStreamError(null)
    setIsStreaming(true)
  }

  const handleStopStreaming = () => {
    setIsStreaming(false)
  }

  const handleClearLogs = () => {
    setLogs([])
  }

  // Filter logs based on text and level
  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      // Level filter
      if (filterLevel !== "all" && log.level !== filterLevel) {
        return false
      }
      // Text filter (case-insensitive)
      if (filterText && !log.message.toLowerCase().includes(filterText.toLowerCase())) {
        return false
      }
      return true
    })
  }, [logs, filterText, filterLevel])

  // Get selected process info
  const selectedProcessInfo = useMemo(() => {
    if (!selectedProcess || !processes) return null
    return processes.find((p) => p.pid === selectedProcess)
  }, [selectedProcess, processes])

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
      {/* Controls */}
      <div className="p-4 border-b border-border space-y-4 flex-shrink-0">
        {/* Process Selector */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 flex-1">
            <span className="text-sm text-muted-foreground whitespace-nowrap">Process:</span>
            <Select
              value={selectedProcess?.toString() || ""}
              onValueChange={handleProcessSelect}
              disabled={isStreaming}
            >
              <SelectTrigger className="w-full max-w-md h-8 text-xs">
                <SelectValue placeholder="Select a devspace process" />
              </SelectTrigger>
              <SelectContent>
                {processesLoading ? (
                  <div className="flex items-center gap-2 p-2 text-sm text-muted-foreground">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Loading processes...
                  </div>
                ) : processes && processes.length > 0 ? (
                  processes.map((proc) => (
                    <SelectItem key={proc.pid} value={proc.pid.toString()}>
                      <div className="flex flex-col">
                        <span className="font-mono text-xs">
                          PID {proc.pid} - {proc.workingDir}
                        </span>
                        <span className="text-xs text-muted-foreground truncate max-w-[350px]">
                          {proc.command}
                        </span>
                      </div>
                    </SelectItem>
                  ))
                ) : (
                  <div className="p-2 text-sm text-muted-foreground">
                    No active devspace processes found
                  </div>
                )}
              </SelectContent>
            </Select>
            <button
              type="button"
              onClick={() => refetchProcesses()}
              disabled={isRefetching}
              className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded transition-colors"
              title="Refresh processes"
            >
              <RefreshCw className={cn("h-4 w-4", isRefetching && "animate-spin")} />
            </button>
          </div>
          {version && (
            <span className="text-xs text-muted-foreground">DevSpace {version}</span>
          )}
        </div>

        {/* Selected Process Info */}
        {selectedProcessInfo && (
          <div className="px-3 py-2 bg-muted/30 rounded-md text-xs">
            <div className="flex items-center gap-4">
              <span className="text-muted-foreground">
                Working Dir: <span className="text-foreground font-mono">{selectedProcessInfo.workingDir}</span>
              </span>
              <span className="text-muted-foreground">
                Started: <span className="text-foreground">{selectedProcessInfo.startTime}</span>
              </span>
            </div>
          </div>
        )}

        {/* Filters and Controls */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-4 flex-1">
            {/* Text Filter */}
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Filter logs..."
                value={filterText}
                onChange={(e) => setFilterText(e.target.value)}
                className="h-8 w-48 text-xs"
              />
            </div>

            {/* Level Filter */}
            <Select
              value={filterLevel}
              onValueChange={(value) => setFilterLevel(value as DevSpaceLogEntry["level"] | "all")}
            >
              <SelectTrigger className="w-[100px] h-8 text-xs">
                <SelectValue placeholder="All levels" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All levels</SelectItem>
                <SelectItem value="info">Info</SelectItem>
                <SelectItem value="warn">Warn</SelectItem>
                <SelectItem value="error">Error</SelectItem>
                <SelectItem value="debug">Debug</SelectItem>
              </SelectContent>
            </Select>

            {/* Wrap Toggle */}
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <Checkbox
                checked={wrapText}
                onCheckedChange={(checked) => setWrapText(checked === true)}
              />
              <WrapText className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground text-xs">Wrap</span>
            </label>

            {/* Auto-scroll Toggle */}
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <Checkbox
                checked={autoScroll}
                onCheckedChange={(checked) => setAutoScroll(checked === true)}
              />
              <span className="text-muted-foreground text-xs">Auto-scroll</span>
            </label>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2">
            {logs.length > 0 && (
              <button
                type="button"
                onClick={handleClearLogs}
                className="px-3 py-1.5 text-xs bg-muted hover:bg-muted/80 rounded-md flex items-center gap-1"
              >
                <X className="h-3 w-3" />
                Clear
              </button>
            )}
            {!isStreaming ? (
              <button
                type="button"
                onClick={handleStartStreaming}
                disabled={!selectedProcess}
                className={cn(
                  "px-3 py-1.5 text-xs bg-primary text-primary-foreground hover:bg-primary/90 rounded-md flex items-center gap-1",
                  !selectedProcess && "opacity-50 cursor-not-allowed"
                )}
              >
                <Play className="h-3 w-3" />
                Start Streaming
              </button>
            ) : (
              <button
                type="button"
                onClick={handleStopStreaming}
                className="px-3 py-1.5 text-xs bg-red-500 text-white hover:bg-red-600 rounded-md flex items-center gap-1"
              >
                <Pause className="h-3 w-3" />
                Stop Streaming
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Log Display */}
      <div className="flex-1 overflow-y-auto bg-muted/30 p-4">
        {streamError ? (
          <div className="flex flex-col items-center justify-center h-full gap-4">
            <div className="p-4 rounded-full bg-red-500/10">
              <AlertTriangle className="h-8 w-8 text-red-500" />
            </div>
            <div className="text-center max-w-2xl">
              <h3 className="text-lg font-medium text-foreground mb-2">Log Streaming Error</h3>
              <p className="text-sm text-muted-foreground mb-4">{streamError}</p>
              <button
                type="button"
                onClick={() => {
                  setStreamError(null)
                  handleStartStreaming()
                }}
                className="px-4 py-2 text-sm bg-primary text-primary-foreground hover:bg-primary/90 rounded-md"
              >
                Try Again
              </button>
            </div>
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-4">
            <div className="p-4 rounded-full bg-muted/50">
              <FolderSync className="h-8 w-8" />
            </div>
            <div className="text-center">
              <h3 className="text-lg font-medium text-foreground">DevSpace Logs</h3>
              {!selectedProcess ? (
                <p className="text-sm mt-1">Select a devspace process to view logs</p>
              ) : logs.length === 0 ? (
                <p className="text-sm mt-1">Click "Start Streaming" to begin</p>
              ) : (
                <p className="text-sm mt-1">No logs match the current filter</p>
              )}
            </div>
          </div>
        ) : (
          <div className="font-mono text-xs space-y-1">
            {filteredLogs.map((log, index) => (
              <div
                key={index}
                className={cn(
                  "flex gap-2 hover:bg-muted/50 px-2 py-1 rounded",
                  !wrapText && "whitespace-nowrap"
                )}
              >
                <span className="text-muted-foreground flex-shrink-0">
                  {new Date(log.timestamp).toLocaleTimeString()}
                </span>
                <span
                  className={cn(
                    "px-1.5 py-0.5 rounded text-[10px] uppercase font-semibold flex-shrink-0",
                    getLevelBadgeClass(log.level)
                  )}
                >
                  {log.level}
                </span>
                <span
                  className={cn(
                    "text-foreground",
                    wrapText ? "break-all" : "overflow-hidden text-ellipsis",
                    getLevelColor(log.level)
                  )}
                >
                  {log.message}
                </span>
              </div>
            ))}
            <div ref={logsEndRef} />
          </div>
        )}
      </div>

      {/* Status Bar */}
      {isStreaming && (
        <div className="px-4 py-2 border-t border-border bg-muted/20 flex items-center justify-between text-xs flex-shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
            <span className="text-muted-foreground">
              Streaming logs from PID {selectedProcess}
            </span>
          </div>
          <div className="flex items-center gap-4">
            {filterText && (
              <span className="text-muted-foreground">
                Showing {filteredLogs.length} of {logs.length} entries
              </span>
            )}
            <span className="text-muted-foreground">{logs.length} total log entries</span>
          </div>
        </div>
      )}
    </div>
  )
}
