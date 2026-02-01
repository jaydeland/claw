"use client"

import { useEffect, useRef, useState, useCallback } from "react"
import { useAtom, useAtomValue, useSetAtom } from "jotai"
import { X, Search, Play, Square, RotateCw, Trash2, Copy, Edit2, ChevronDown, ChevronRight, Loader2, CheckCircle2, XCircle, Download, XCircleIcon } from "lucide-react"
import { trpc } from "../../../lib/trpc"
import {
  selectedConductorJobIdAtom,
  conductorDetailDrawerOpenAtom,
  conductorDetailTabAtom,
} from "../atoms"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../../../components/ui/tabs"
import { Button } from "../../../components/ui/button"
import { Input } from "../../../components/ui/input"
import { cn } from "../../../lib/utils"
import type { Terminal as XTerm } from "xterm"
import type { FitAddon } from "@xterm/addon-fit"
import "xterm/css/xterm.css"

export function ConductorDetailPanel() {
  const [isOpen, setIsOpen] = useAtom(conductorDetailDrawerOpenAtom)
  const jobId = useAtomValue(selectedConductorJobIdAtom)
  const [activeTab, setActiveTab] = useAtom(conductorDetailTabAtom)

  const { data: job } = trpc.conductor.jobs.get.useQuery(
    { id: jobId! },
    { enabled: !!jobId }
  )

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Escape to close
      if (e.key === "Escape" && isOpen) {
        setIsOpen(false)
      }
      // Cmd/Ctrl + K to focus search (when on logs tab)
      if ((e.metaKey || e.ctrlKey) && e.key === "k" && isOpen && activeTab === "logs") {
        e.preventDefault()
        // Focus will be handled by logs tab component
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [isOpen, activeTab, setIsOpen])

  if (!isOpen || !jobId || !job) return null

  const isRunning = job.status === "in_progress"

  return (
    <div className="fixed right-0 top-0 h-full w-[600px] bg-background border-l border-border shadow-2xl z-50 flex flex-col animate-in slide-in-from-right duration-300">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {/* Running indicator */}
          {isRunning && (
            <div className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
            </div>
          )}
          <div className="flex-1 min-w-0">
            <h2 className="text-sm font-semibold truncate">{job.title}</h2>
            <p className="text-xs text-muted-foreground truncate">{job.id}</p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setIsOpen(false)}
          className="ml-2 flex-shrink-0"
          title="Close (Esc)"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)} className="flex-1 flex flex-col overflow-hidden">
        <TabsList className="w-full justify-start rounded-none border-b px-4">
          <TabsTrigger value="logs">Logs</TabsTrigger>
          <TabsTrigger value="checkpoints">Checkpoints</TabsTrigger>
          <TabsTrigger value="metadata">Metadata</TabsTrigger>
          <TabsTrigger value="actions">Actions</TabsTrigger>
        </TabsList>

        <div className="flex-1 overflow-hidden">
          <TabsContent value="logs" className="h-full m-0 p-0">
            <LogsTab jobId={jobId} />
          </TabsContent>

          <TabsContent value="checkpoints" className="h-full m-0 p-0">
            <CheckpointsTab jobId={jobId} />
          </TabsContent>

          <TabsContent value="metadata" className="h-full m-0 p-0">
            <MetadataTab job={job} />
          </TabsContent>

          <TabsContent value="actions" className="h-full m-0 p-0">
            <ActionsTab job={job} />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  )
}

// ============ LOGS TAB ============

function LogsTab({ jobId }: { jobId: string }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const xtermRef = useRef<XTerm | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const searchAddonRef = useRef<any>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const [autoScroll, setAutoScroll] = useState(true)
  const [levelFilter, setLevelFilter] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const allLogsRef = useRef<any[]>([])
  const [logCounts, setLogCounts] = useState({ info: 0, warning: 0, error: 0, debug: 0 })

  // Query existing logs
  const { data: logsData, isLoading } = trpc.conductor.logs.list.useQuery(
    { jobId, options: { limit: 1000, level: levelFilter as any } },
    { refetchOnMount: true }
  )

  // Update log counts when logs change
  useEffect(() => {
    if (!allLogsRef.current.length) return
    const counts = { info: 0, warning: 0, error: 0, debug: 0 }
    allLogsRef.current.forEach((log) => {
      if (counts[log.level as keyof typeof counts] !== undefined) {
        counts[log.level as keyof typeof counts]++
      }
    })
    setLogCounts(counts)
  }, [allLogsRef.current.length])

  // Keyboard shortcut to focus search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault()
        searchInputRef.current?.focus()
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [])

  // Subscribe to new logs
  trpc.conductor.logs.subscribe.useSubscription(
    { jobId },
    {
      onData: (log) => {
        allLogsRef.current.push(log)
        // Update counts
        setLogCounts((prev) => ({
          ...prev,
          [log.level]: (prev[log.level as keyof typeof prev] || 0) + 1,
        }))
        if (shouldShowLog(log, searchQuery)) {
          writeLogToTerminal(log)
        }
      },
    }
  )

  const shouldShowLog = (log: any, query: string) => {
    if (!query) return true
    const searchLower = query.toLowerCase()
    return (
      log.message.toLowerCase().includes(searchLower) ||
      log.level.toLowerCase().includes(searchLower)
    )
  }

  const writeLogToTerminal = (log: any) => {
    if (!xtermRef.current) return

    const levelColors: Record<string, string> = {
      error: "\x1b[31m",
      warning: "\x1b[33m",
      info: "\x1b[36m",
      debug: "\x1b[90m",
    }
    const color = levelColors[log.level] || "\x1b[37m"
    const timestamp = new Date(log.timestamp).toLocaleTimeString()
    xtermRef.current.writeln(
      `${color}[${timestamp}] [${log.level.toUpperCase()}]\x1b[0m ${log.message}`
    )

    if (autoScroll) {
      xtermRef.current.scrollToBottom()
    }
  }

  // Handle search query changes
  useEffect(() => {
    if (!xtermRef.current || !allLogsRef.current.length) return

    // Clear terminal and re-render filtered logs
    xtermRef.current.clear()
    allLogsRef.current.forEach((log) => {
      if (shouldShowLog(log, searchQuery)) {
        writeLogToTerminal(log)
      }
    })
  }, [searchQuery])

  // Export logs to file
  const exportLogs = useCallback(() => {
    const logsText = allLogsRef.current
      .map((log) => {
        const timestamp = new Date(log.timestamp).toISOString()
        return `[${timestamp}] [${log.level.toUpperCase()}] ${log.message}`
      })
      .join("\n")

    const blob = new Blob([logsText], { type: "text/plain" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `conductor-logs-${jobId}-${Date.now()}.txt`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }, [jobId])

  // Initialize xterm
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    let isUnmounted = false

    // Dynamically import xterm
    Promise.all([
      import("xterm"),
      import("@xterm/addon-fit"),
    ]).then(([{ Terminal }, { FitAddon }]) => {
      if (isUnmounted || !container) return

      const xterm = new Terminal({
        cursorStyle: "bar",
        cursorBlink: false,
        fontSize: 12,
        fontFamily: '"Cascadia Code", Menlo, Monaco, "Courier New", monospace',
        theme: {
          background: "transparent",
          foreground: "#d4d4d4",
        },
        rows: 20,
        scrollback: 10000,
        disableStdin: true,
      })

      const fitAddon = new FitAddon()
      xterm.loadAddon(fitAddon)
      xterm.open(container)
      fitAddon.fit()

      xtermRef.current = xterm
      fitAddonRef.current = fitAddon

      // Load existing logs
      if (logsData?.logs) {
        allLogsRef.current = [...logsData.logs]
        // Calculate initial counts
        const counts = { info: 0, warning: 0, error: 0, debug: 0 }
        logsData.logs.forEach((log) => {
          if (counts[log.level as keyof typeof counts] !== undefined) {
            counts[log.level as keyof typeof counts]++
          }
        })
        setLogCounts(counts)

        for (const log of logsData.logs) {
          writeLogToTerminal(log)
        }
      }

      // Load search addon
      import("@xterm/addon-search").then(({ SearchAddon }) => {
        if (isUnmounted || !xterm) return
        const searchAddon = new SearchAddon()
        xterm.loadAddon(searchAddon)
        searchAddonRef.current = searchAddon
      })

      // Handle resize
      const resizeObserver = new ResizeObserver(() => {
        fitAddon.fit()
      })
      resizeObserver.observe(container)

      return () => {
        isUnmounted = true
        resizeObserver.disconnect()
        xterm.dispose()
        xtermRef.current = null
        fitAddonRef.current = null
      }
    })

    return () => {
      isUnmounted = true
    }
  }, [logsData])

  return (
    <div className="flex flex-col h-full">
      {/* Controls */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-border">
        <div className="relative flex-1">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
          <Input
            ref={searchInputRef}
            placeholder="Search logs... (⌘K)"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-7 text-xs pl-7 pr-7"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              title="Clear search"
            >
              <XCircleIcon className="h-3 w-3" />
            </button>
          )}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setAutoScroll(!autoScroll)}
          className={cn("text-xs whitespace-nowrap", autoScroll && "bg-primary/10")}
          title="Toggle auto-scroll to bottom"
        >
          {autoScroll ? "Auto-scroll: On" : "Auto-scroll: Off"}
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => exportLogs()}
          className="text-xs"
          title="Export logs as text file"
        >
          <Download className="h-3 w-3" />
        </Button>
      </div>

      {/* Level Filter */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-border">
        <span className="text-xs text-muted-foreground mr-2">Filter:</span>
        {(["info", "warning", "error", "debug"] as const).map((level) => {
          const count = logCounts[level]
          return (
            <Button
              key={level}
              variant="outline"
              size="sm"
              onClick={() => setLevelFilter(levelFilter === level ? null : level)}
              className={cn(
                "text-xs",
                levelFilter === level && "bg-primary/10"
              )}
              title={`${count} ${level} log(s)`}
            >
              {level}
              {count > 0 && (
                <span className="ml-1.5 px-1 py-0.5 bg-muted rounded text-[10px] font-mono">
                  {count}
                </span>
              )}
            </Button>
          )
        })}
      </div>

      {/* Terminal */}
      {isLoading ? (
        <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
          Loading logs...
        </div>
      ) : (
        <div ref={containerRef} className="flex-1 overflow-hidden bg-muted/30 px-2 py-2" />
      )}
    </div>
  )
}

// ============ CHECKPOINTS TAB ============

function CheckpointsTab({ jobId }: { jobId: string }) {
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc")
  const [expandedCheckpoint, setExpandedCheckpoint] = useState<string | null>(null)

  const { data: checkpoints, isLoading } = trpc.conductor.checkpoints.list.useQuery({ jobId })

  // Subscribe to new checkpoints
  trpc.conductor.checkpoints.subscribe.useSubscription(
    { jobId },
    {
      onData: (checkpoint) => {
        console.log("New checkpoint:", checkpoint)
      },
    }
  )

  const sortedCheckpoints = checkpoints
    ? [...checkpoints].sort((a, b) => {
        const timeA = new Date(a.timestamp).getTime()
        const timeB = new Date(b.timestamp).getTime()
        return sortOrder === "desc" ? timeB - timeA : timeA - timeB
      })
    : []

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Controls */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border">
        <span className="text-xs text-muted-foreground">
          {checkpoints?.length || 0} checkpoints
        </span>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setSortOrder(sortOrder === "desc" ? "asc" : "desc")}
          className="text-xs"
        >
          {sortOrder === "desc" ? "Newest first" : "Oldest first"}
        </Button>
      </div>

      {/* Timeline */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {isLoading ? (
          <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
            Loading checkpoints...
          </div>
        ) : sortedCheckpoints.length === 0 ? (
          <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
            No checkpoints yet
          </div>
        ) : (
          sortedCheckpoints.map((checkpoint, index) => {
            const isSuccess = checkpoint.message.toLowerCase().includes("success") ||
                             checkpoint.message.toLowerCase().includes("complete")
            const isError = checkpoint.message.toLowerCase().includes("error") ||
                           checkpoint.message.toLowerCase().includes("fail")

            return (
            <div
              key={checkpoint.id}
              className="relative pl-6 pb-3 border-l-2 border-muted last:border-l-0"
            >
              {/* Timeline dot with status */}
              <div className={cn(
                "absolute left-0 top-1 w-3 h-3 -ml-[7px] rounded-full border-2 border-background",
                isError ? "bg-destructive" : isSuccess ? "bg-green-500" : "bg-primary"
              )} />

              {/* Content */}
              <div className="space-y-1">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-medium">{checkpoint.message}</p>
                  <button
                    onClick={() =>
                      setExpandedCheckpoint(
                        expandedCheckpoint === checkpoint.id ? null : checkpoint.id
                      )
                    }
                    className="text-muted-foreground hover:text-foreground"
                  >
                    {expandedCheckpoint === checkpoint.id ? (
                      <ChevronDown className="h-3 w-3" />
                    ) : (
                      <ChevronRight className="h-3 w-3" />
                    )}
                  </button>
                </div>
                <p className="text-xs text-muted-foreground">
                  {new Date(checkpoint.timestamp).toLocaleString()}
                </p>

                {/* Metadata (expandable) */}
                {expandedCheckpoint === checkpoint.id && checkpoint.metadata && (
                  <pre className="text-xs bg-muted rounded p-2 mt-2 overflow-x-auto">
                    {JSON.stringify(JSON.parse(checkpoint.metadata), null, 2)}
                  </pre>
                )}
              </div>
            </div>
            )
          })
        )}
      </div>
    </div>
  )
}

// ============ METADATA TAB ============

function MetadataTab({ job }: { job: any }) {
  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4">
      {/* Basic Info */}
      <div className="space-y-3">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase">Basic Info</h3>
        <div className="space-y-2">
          <Field label="Title" value={job.title} />
          <Field label="Intent" value={job.intent || "(not set)"} />
          <Field label="Type" value={job.type || "(not set)"} badge />
          <Field label="Status" value={job.status} badge />
        </div>
      </div>

      {/* Relationships */}
      <div className="space-y-3">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase">Relationships</h3>
        <div className="space-y-2">
          <Field label="Parent ID" value={job.parentId || "(root level)"} link={job.parentId} />
          <Field label="Position" value={job.position.toString()} />
        </div>
      </div>

      {/* Git Info */}
      <div className="space-y-3">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase">Git Info</h3>
        <div className="space-y-2">
          <Field label="Worktree" value={job.worktreePath || "(not set)"} />
          <Field label="Branch" value={job.branchName || "(not set)"} />
          <Field label="Repo ID" value={job.repoId || "(not set)"} />
        </div>
      </div>

      {/* Timestamps */}
      <div className="space-y-3">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase">Timestamps</h3>
        <div className="space-y-2">
          <Field label="Created" value={new Date(job.createdAt).toLocaleString()} />
          <Field label="Updated" value={new Date(job.updatedAt).toLocaleString()} />
        </div>
      </div>

      {/* Runtime Info */}
      <div className="space-y-3">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase">Runtime</h3>
        <div className="space-y-2">
          <Field label="Process ID" value={job.pid?.toString() || "(not running)"} />
          <Field label="Jira Key" value={job.jiraKey || "(not set)"} />
        </div>
      </div>

      {/* Error */}
      {job.errorMessage && (
        <div className="space-y-3">
          <h3 className="text-xs font-semibold text-destructive uppercase">Error</h3>
          <div className="bg-destructive/10 border border-destructive/30 rounded p-3 text-xs text-destructive">
            {job.errorMessage}
          </div>
        </div>
      )}
    </div>
  )
}

function Field({
  label,
  value,
  badge = false,
  link = false,
}: {
  label: string
  value: string
  badge?: boolean
  link?: string | boolean
}) {
  const [, setSelectedJobId] = useAtom(selectedConductorJobIdAtom)

  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-muted-foreground">{label}</span>
      {badge ? (
        <span className="px-2 py-0.5 bg-primary/10 text-primary rounded text-xs font-medium">
          {value}
        </span>
      ) : link && typeof link === "string" ? (
        <button
          className="text-xs text-primary hover:underline"
          onClick={() => setSelectedJobId(link)}
        >
          {value}
        </button>
      ) : (
        <span className="text-xs font-medium truncate max-w-[300px]">{value}</span>
      )}
    </div>
  )
}

// ============ ACTIONS TAB ============

function ActionsTab({ job }: { job: any }) {
  const utils = trpc.useUtils()
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  const startMutation = trpc.conductor.jobs.start.useMutation({
    onSuccess: () => {
      utils.conductor.jobs.get.invalidate({ id: job.id })
    },
  })

  const stopMutation = trpc.conductor.jobs.stop.useMutation({
    onSuccess: () => {
      utils.conductor.jobs.get.invalidate({ id: job.id })
    },
  })

  const resumeMutation = trpc.conductor.jobs.resume.useMutation({
    onSuccess: () => {
      utils.conductor.jobs.get.invalidate({ id: job.id })
    },
  })

  const deleteMutation = trpc.conductor.jobs.delete.useMutation({
    onSuccess: () => {
      utils.conductor.jobs.list.invalidate()
    },
  })

  const cloneMutation = trpc.conductor.jobs.clone.useMutation({
    onSuccess: () => {
      utils.conductor.jobs.list.invalidate()
    },
  })

  const canStart = job.status !== "in_progress" && job.status !== "done"
  const canStop = job.status === "in_progress"
  const canResume = job.status !== "in_progress" && job.status !== "to_do"

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4">
      {/* Job Control */}
      <div className="space-y-3">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase">Job Control</h3>
        <div className="space-y-2">
          <Button
            variant="default"
            size="sm"
            className="w-full justify-start"
            disabled={!canStart || startMutation.isPending}
            onClick={() => startMutation.mutate({ id: job.id })}
            title={
              !canStart
                ? job.status === "done"
                  ? "Job is already completed"
                  : "Job is already in progress"
                : "Start executing this job"
            }
          >
            <Play className="h-4 w-4 mr-2" />
            {startMutation.isPending ? "Starting..." : "Start Job"}
          </Button>

          <Button
            variant="outline"
            size="sm"
            className="w-full justify-start"
            disabled={!canStop || stopMutation.isPending}
            onClick={() => stopMutation.mutate({ id: job.id })}
            title={!canStop ? "Job is not running" : "Stop the running job"}
          >
            <Square className="h-4 w-4 mr-2" />
            {stopMutation.isPending ? "Stopping..." : "Stop Job"}
          </Button>

          <Button
            variant="outline"
            size="sm"
            className="w-full justify-start"
            disabled={!canResume || resumeMutation.isPending}
            onClick={() => resumeMutation.mutate({ id: job.id })}
            title={
              !canResume
                ? job.status === "to_do"
                  ? "Use Start instead for new jobs"
                  : "Job is already in progress"
                : "Resume from last checkpoint"
            }
          >
            <RotateCw className="h-4 w-4 mr-2" />
            {resumeMutation.isPending ? "Resuming..." : "Resume Job"}
          </Button>
        </div>
      </div>

      {/* Management */}
      <div className="space-y-3">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase">Management</h3>
        <div className="space-y-2">
          <Button
            variant="outline"
            size="sm"
            className="w-full justify-start"
            onClick={() => {
              // TODO: Open edit form modal
              alert("Edit functionality coming soon!")
            }}
            title="Edit job details (coming soon)"
          >
            <Edit2 className="h-4 w-4 mr-2" />
            Edit Job
          </Button>

          <Button
            variant="outline"
            size="sm"
            className="w-full justify-start"
            disabled={cloneMutation.isPending}
            onClick={() =>
              cloneMutation.mutate({
                id: job.id,
                includeChildren: false,
              })
            }
          >
            <Copy className="h-4 w-4 mr-2" />
            Clone Job
          </Button>

          {!showDeleteConfirm ? (
            <Button
              variant="destructive"
              size="sm"
              className="w-full justify-start"
              onClick={() => setShowDeleteConfirm(true)}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Delete Job
            </Button>
          ) : (
            <div className="space-y-2 p-2 bg-destructive/10 border border-destructive/30 rounded">
              <p className="text-xs text-destructive">Are you sure? This will delete the job and all children.</p>
              <div className="flex gap-2">
                <Button
                  variant="destructive"
                  size="sm"
                  className="flex-1"
                  disabled={deleteMutation.isPending}
                  onClick={() => {
                    deleteMutation.mutate({ id: job.id })
                    setShowDeleteConfirm(false)
                  }}
                >
                  Confirm
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  onClick={() => setShowDeleteConfirm(false)}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
