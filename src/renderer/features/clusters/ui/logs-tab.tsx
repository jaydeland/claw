"use client"

import { useState, useEffect, useRef } from "react"
import { useAtomValue, useAtom } from "jotai"
import { ScrollText, RefreshCw, Loader2, AlertTriangle, X, Play, Pause } from "lucide-react"
import { cn } from "../../../lib/utils"
import { trpc } from "../../../lib/trpc"
import { selectedClusterIdAtom, selectedNamespaceAtom } from "../atoms"
import { clustersDefaultNamespaceAtom } from "../../../lib/atoms"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../../components/ui/select"
import { Checkbox } from "../../../components/ui/checkbox"

interface LogEntry {
  timestamp: string
  podName: string
  containerName: string
  message: string
}

export function LogsTab() {
  const selectedClusterId = useAtomValue(selectedClusterIdAtom)
  const [selectedNamespace, setSelectedNamespace] = useAtom(selectedNamespaceAtom)
  const defaultNamespaceOverride = useAtomValue(clustersDefaultNamespaceAtom)

  const [selectedServices, setSelectedServices] = useState<string[]>([])
  const [excludeIstioSidecar, setExcludeIstioSidecar] = useState(true)
  const [isStreaming, setIsStreaming] = useState(false)
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [streamError, setStreamError] = useState<string | null>(null)
  const logsEndRef = useRef<HTMLDivElement>(null)
  const [autoScroll, setAutoScroll] = useState(true)
  const [wordWrap, setWordWrap] = useState(true)

  // Get derived namespace from email
  const { data: derivedNamespace } = trpc.clusters.getDefaultNamespace.useQuery()

  // Effective default namespace
  const effectiveDefaultNamespace = defaultNamespaceOverride || derivedNamespace || "default"
  const currentNamespace = selectedNamespace || effectiveDefaultNamespace

  // Get cluster status
  const { data: status } = trpc.clusters.getStatus.useQuery(
    { clusterName: selectedClusterId! },
    { enabled: !!selectedClusterId }
  )

  // Get namespaces
  const { data: namespaces } = trpc.clusters.getNamespaces.useQuery(
    { clusterName: selectedClusterId! },
    { enabled: !!selectedClusterId && status?.connected }
  )

  // Get services in selected namespace
  const { data: services, isLoading: servicesLoading } = trpc.clusters.getServices.useQuery(
    { clusterName: selectedClusterId!, namespace: currentNamespace },
    { enabled: !!selectedClusterId && status?.connected && !!currentNamespace }
  )

  // Stream logs using tRPC subscription
  trpc.clusters.streamLogs.useSubscription(
    {
      clusterName: selectedClusterId!,
      namespace: currentNamespace,
      services: selectedServices,
      excludeIstioSidecar,
    },
    {
      enabled: isStreaming && selectedServices.length > 0 && !!selectedClusterId && status?.connected,
      onData: (log) => {
        // Clear any previous errors once we start receiving logs
        setStreamError(null)
        setLogs((prev) => {
          const updated = [...prev, log]
          // Keep only last 500 logs
          return updated.slice(-500)
        })
      },
      onError: (error) => {
        console.error("[LogsTab] Stream error:", error)
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

  const handleServiceToggle = (serviceName: string) => {
    setSelectedServices((prev) =>
      prev.includes(serviceName)
        ? prev.filter((s) => s !== serviceName)
        : [...prev, serviceName]
    )
  }

  const handleStartStreaming = () => {
    if (selectedServices.length === 0) {
      return
    }
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

  if (!status?.connected) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        Waiting for cluster connection...
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Controls */}
      <div className="p-4 border-b border-border space-y-4 flex-shrink-0">
        {/* Namespace Selector */}
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Namespace:</span>
          <Select
            value={currentNamespace}
            onValueChange={(value) => setSelectedNamespace(value)}
          >
            <SelectTrigger className="w-[200px] h-8 text-xs">
              <SelectValue placeholder="Select namespace" />
            </SelectTrigger>
            <SelectContent>
              {namespaces?.map((ns) => (
                <SelectItem key={ns.name} value={ns.name}>
                  <span className="flex items-center gap-2">
                    {ns.name}
                    {ns.name === effectiveDefaultNamespace && (
                      <span className="text-xs text-muted-foreground">(default)</span>
                    )}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Service Multi-Select */}
        <div className="space-y-2">
          <span className="text-sm text-muted-foreground">Select Services:</span>
          {servicesLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              Loading services...
            </div>
          ) : services && services.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {services.map((svc) => (
                <button
                  key={svc.name}
                  type="button"
                  onClick={() => handleServiceToggle(svc.name)}
                  disabled={isStreaming}
                  className={cn(
                    "px-3 py-1.5 text-xs rounded-md border transition-colors",
                    selectedServices.includes(svc.name)
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-muted text-muted-foreground border-border hover:bg-muted/80",
                    isStreaming && "opacity-50 cursor-not-allowed"
                  )}
                >
                  {svc.name}
                </button>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No services found in {currentNamespace}
            </p>
          )}
        </div>

        {/* Options and Controls */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <Checkbox
                checked={excludeIstioSidecar}
                onCheckedChange={(checked) => setExcludeIstioSidecar(checked === true)}
                disabled={isStreaming}
              />
              <span className="text-muted-foreground">Exclude Istio Sidecar</span>
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <Checkbox
                checked={autoScroll}
                onCheckedChange={(checked) => setAutoScroll(checked === true)}
              />
              <span className="text-muted-foreground">Auto-scroll</span>
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <Checkbox
                checked={wordWrap}
                onCheckedChange={(checked) => setWordWrap(checked === true)}
              />
              <span className="text-muted-foreground">Word wrap</span>
            </label>
          </div>

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
                disabled={selectedServices.length === 0}
                className={cn(
                  "px-3 py-1.5 text-xs bg-primary text-primary-foreground hover:bg-primary/90 rounded-md flex items-center gap-1",
                  selectedServices.length === 0 && "opacity-50 cursor-not-allowed"
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
        ) : logs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-4">
            <div className="p-4 rounded-full bg-muted/50">
              <ScrollText className="h-8 w-8" />
            </div>
            <div className="text-center">
              <h3 className="text-lg font-medium text-foreground">Pod Logs</h3>
              {selectedServices.length === 0 ? (
                <p className="text-sm mt-1">Select one or more services to start streaming logs</p>
              ) : (
                <p className="text-sm mt-1">Click "Start Streaming" to begin</p>
              )}
            </div>
          </div>
        ) : (
          <div className={cn(
            "font-mono text-xs select-text",
            wordWrap ? "space-y-1" : "space-y-1 overflow-x-auto"
          )}>
            {logs.map((log, index) => (
              <div key={index} className={cn(
                "flex gap-2 hover:bg-muted/50 px-2 py-1 rounded",
                !wordWrap && "whitespace-nowrap"
              )}>
                <span className="text-muted-foreground flex-shrink-0">
                  {new Date(log.timestamp).toLocaleTimeString()}
                </span>
                <span className="text-blue-400 flex-shrink-0">{log.podName}</span>
                <span className="text-green-400 flex-shrink-0">[{log.containerName}]</span>
                <span className={cn(
                  "text-foreground",
                  wordWrap ? "break-all" : "whitespace-pre"
                )}>{log.message}</span>
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
              Streaming logs from {selectedServices.length} service{selectedServices.length !== 1 ? "s" : ""}
            </span>
          </div>
          <span className="text-muted-foreground">{logs.length} log entries</span>
        </div>
      )}
    </div>
  )
}
