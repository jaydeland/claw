"use client"

import { useEffect, useRef, useState } from "react"
import { useAtom, useAtomValue } from "jotai"
import { Network, Play, Square, RefreshCw, Plus, CheckCircle, XCircle, Loader2, ChevronDown, Folder, FolderOpen } from "lucide-react"
import { Button } from "../../../components/ui/button"
import { cn } from "../../../lib/utils"
import { trpc } from "../../../lib/trpc"
import { toast } from "sonner"
import {
  gitnexusAutoStartAtom,
  gitnexusInstallProgressAtom,
  gitnexusAnalyzeProgressAtom,
  gitnexusAnalyzingAtom,
  gitnexusInstallingAtom,
  gitnexusSelectedRepoAtom,
  gitnexusSelectedProjectIdAtom,
} from "../atoms"

interface GitNexusViewProps {
  projectPath: string
}

function StatusDot({ running, label }: { running: boolean; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      {running ? (
        <CheckCircle className="h-3 w-3 text-green-500" />
      ) : (
        <XCircle className="h-3 w-3 text-muted-foreground" />
      )}
      <span className={cn("text-xs", running ? "text-green-500" : "text-muted-foreground")}>
        {label}
      </span>
    </div>
  )
}

export function GitNexusView({ projectPath: defaultProjectPath }: GitNexusViewProps) {
  const autoStart = useAtomValue(gitnexusAutoStartAtom)
  const [installProgress, setInstallProgress] = useAtom(gitnexusInstallProgressAtom)
  const [analyzeProgress, setAnalyzeProgress] = useAtom(gitnexusAnalyzeProgressAtom)
  const [isAnalyzing, setIsAnalyzing] = useAtom(gitnexusAnalyzingAtom)
  const [isInstalling, setIsInstalling] = useAtom(gitnexusInstallingAtom)
  const [selectedRepo, setSelectedRepo] = useAtom(gitnexusSelectedRepoAtom)
  const [selectedProjectId, setSelectedProjectId] = useAtom(gitnexusSelectedProjectIdAtom)
  const [repoDropdownOpen, setRepoDropdownOpen] = useState(false)
  const [projectDropdownOpen, setProjectDropdownOpen] = useState(false)

  // Whether subscriptions should be active
  const [installActive, setInstallActive] = useState(false)
  const [analyzeActive, setAnalyzeActive] = useState(false)

  const autoStartedRef = useRef(false)

  // Fetch list of Claw projects
  const { data: projects = [] } = trpc.projects.list.useQuery()

  // Find the selected project or use default
  const selectedProject = projects.find((p) => p.id === selectedProjectId) ||
    projects.find((p) => p.path === defaultProjectPath) ||
    projects[0]

  // Use selected project path for GitNexus operations
  const projectPath = selectedProject?.path || defaultProjectPath || ""

  // Poll status every 3 seconds
  const { data: status, refetch: refetchStatus } = trpc.gitnexus.checkStatus.useQuery(
    { projectPath },
    { refetchInterval: 3000 }
  )

  // Fetch indexed repos when API server is running
  const { data: repos = [], refetch: refetchRepos } = trpc.gitnexus.listRepos.useQuery(
    undefined,
    {
      enabled: status?.apiServerRunning,
      refetchInterval: 10000, // Refresh every 10 seconds
    }
  )

  const startServersMutation = trpc.gitnexus.startServers.useMutation({
    onSuccess: (result) => {
      if (result.success) {
        refetchStatus()
      } else {
        toast.error(result.error ?? "Failed to start servers")
      }
    },
  })

  const stopServersMutation = trpc.gitnexus.stopServers.useMutation({
    onSuccess: () => {
      refetchStatus()
    },
  })

  const addMcpMutation = trpc.gitnexus.addMcpToProject.useMutation({
    onSuccess: (result) => {
      if (result.success) {
        toast.success("GitNexus MCP server added to .mcp.json")
      } else {
        toast.error(result.error ?? "Failed to write .mcp.json")
      }
    },
  })

  // Install subscription
  trpc.gitnexus.install.useSubscription(undefined, {
    enabled: installActive,
    onData: (data) => {
      if (data.type === "progress") {
        setInstallProgress((prev) => [...prev, data.message])
      } else if (data.type === "done") {
        setInstallProgress((prev) => [...prev, data.message])
        setIsInstalling(false)
        setInstallActive(false)
        refetchStatus()
        toast.success("GitNexus installed")
      } else if (data.type === "error") {
        setInstallProgress((prev) => [...prev, `Error: ${data.message}`])
        setIsInstalling(false)
        setInstallActive(false)
        toast.error(`Install failed: ${data.message}`)
      }
    },
  })

  // Analyze subscription
  trpc.gitnexus.analyzeProject.useSubscription(
    { projectPath },
    {
      enabled: analyzeActive && !!projectPath,
      onData: (data) => {
        if (data.type === "progress") {
          setAnalyzeProgress((prev) => [...prev, data.message])
        } else if (data.type === "done") {
          setAnalyzeProgress((prev) => [...prev, data.message])
          setIsAnalyzing(false)
          setAnalyzeActive(false)
          refetchStatus()
          toast.success("Project indexed successfully")
        } else if (data.type === "error") {
          setAnalyzeProgress((prev) => [...prev, `Error: ${data.message}`])
          setIsAnalyzing(false)
          setAnalyzeActive(false)
          toast.error(`Index failed: ${data.message}`)
        }
      },
    }
  )

  // Auto-start servers on mount if enabled
  useEffect(() => {
    if (!autoStart) return
    if (!status) return
    if (autoStartedRef.current) return
    if (!status.repoCloned || !status.webDepsInstalled) return
    if (status.apiServerRunning && status.webServerRunning) return

    autoStartedRef.current = true
    startServersMutation.mutate({ projectPath })
  }, [autoStart, status, projectPath]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleInstall = () => {
    setInstallProgress([])
    setIsInstalling(true)
    setInstallActive(true)
  }

  const handleIndexProject = () => {
    setAnalyzeProgress([])
    setIsAnalyzing(true)
    setAnalyzeActive(true)
  }

  const handleToggleServers = () => {
    if (status?.apiServerRunning || status?.webServerRunning) {
      stopServersMutation.mutate()
    } else {
      startServersMutation.mutate({ projectPath })
    }
  }

  // Derived state - must be before any early returns
  const serversRunning = status?.apiServerRunning && status?.webServerRunning
  const anyServerRunning = status?.apiServerRunning || status?.webServerRunning

  // Auto-select first repo if none selected and repos are available
  useEffect(() => {
    if (repos.length > 0 && !selectedRepo) {
      setSelectedRepo(repos[0].name)
    }
  }, [repos, selectedRepo, setSelectedRepo])

  // Not installed state
  if (!status?.repoCloned || !status?.webDepsInstalled) {
    return (
      <div className="h-full flex flex-col bg-background">
        {/* Toolbar */}
        <div className="flex items-center gap-3 px-4 py-2 border-b border-border flex-shrink-0">
          <Network className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold">GitNexus</h2>
        </div>

        {/* Setup card */}
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="max-w-md text-center space-y-4">
            <Network className="h-12 w-12 text-primary mx-auto" />
            <h3 className="text-lg font-semibold">Install GitNexus</h3>
            <p className="text-sm text-muted-foreground">
              GitNexus is a graph-powered code intelligence tool that indexes your repository and
              gives Claude deep architectural context about your codebase.
            </p>
            <ul className="text-xs text-muted-foreground text-left space-y-1 bg-muted/50 rounded-md p-4">
              <li>• Local API server on port 4747</li>
              <li>• Web UI at 127.0.0.1:5173</li>
              <li>• MCP server for Claude agents</li>
            </ul>

            {!isInstalling ? (
              <Button onClick={handleInstall} className="w-full">
                <Plus className="h-4 w-4 mr-2" />
                Install GitNexus
              </Button>
            ) : (
              <Button disabled className="w-full">
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Installing...
              </Button>
            )}

            {installProgress.length > 0 && (
              <div className="mt-4 text-left bg-muted rounded-md p-3 max-h-48 overflow-y-auto font-mono text-xs space-y-0.5">
                {installProgress.map((line, i) => (
                  <div key={i} className="text-muted-foreground leading-relaxed">
                    {line}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  // Build iframe URL with selected repo
  const iframeUrl = selectedRepo
    ? `http://127.0.0.1:5173?repo=${encodeURIComponent(selectedRepo)}`
    : "http://127.0.0.1:5173"

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-border flex-shrink-0 flex-wrap">
        <div className="flex items-center gap-2">
          <Network className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold">GitNexus</h2>
        </div>

        {/* Status dots */}
        <div className="flex items-center gap-3 ml-2">
          <StatusDot running={status.apiServerRunning} label="API" />
          <StatusDot running={status.webServerRunning} label="Web UI" />
        </div>

        {/* Project/Workspace selector dropdown */}
        {projects.length > 0 && (
          <div className="relative ml-2">
            <button
              type="button"
              onClick={() => setProjectDropdownOpen(!projectDropdownOpen)}
              className="flex items-center gap-1.5 px-2 py-1 text-sm bg-muted/50 hover:bg-muted rounded-md border border-border"
            >
              <FolderOpen className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="max-w-[150px] truncate">{selectedProject?.name || "Select project"}</span>
              <ChevronDown className="h-3 w-3 text-muted-foreground" />
            </button>
            {projectDropdownOpen && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setProjectDropdownOpen(false)}
                />
                <div className="absolute top-full left-0 mt-1 w-64 bg-popover border border-border rounded-md shadow-lg z-20 py-1 max-h-64 overflow-y-auto">
                  {projects.map((project) => (
                    <button
                      key={project.id}
                      type="button"
                      onClick={() => {
                        setSelectedProjectId(project.id)
                        // Reset selected repo when switching projects
                        setSelectedRepo(null)
                        setProjectDropdownOpen(false)
                      }}
                      className={cn(
                        "w-full px-3 py-2 text-left text-sm hover:bg-muted flex items-center gap-2",
                        selectedProject?.id === project.id && "bg-muted"
                      )}
                    >
                      <FolderOpen className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate">{project.name}</div>
                        <div className="text-xs text-muted-foreground truncate">
                          {project.path}
                        </div>
                      </div>
                      {selectedProject?.id === project.id && (
                        <CheckCircle className="h-3.5 w-3.5 text-primary flex-shrink-0" />
                      )}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* Repo selector dropdown */}
        {serversRunning && repos.length > 0 && (
          <div className="relative ml-2">
            <button
              type="button"
              onClick={() => setRepoDropdownOpen(!repoDropdownOpen)}
              className="flex items-center gap-1.5 px-2 py-1 text-sm bg-muted/50 hover:bg-muted rounded-md border border-border"
            >
              <Folder className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="max-w-[150px] truncate">{selectedRepo || "Select repo"}</span>
              <ChevronDown className="h-3 w-3 text-muted-foreground" />
            </button>
            {repoDropdownOpen && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setRepoDropdownOpen(false)}
                />
                <div className="absolute top-full left-0 mt-1 w-64 bg-popover border border-border rounded-md shadow-lg z-20 py-1 max-h-64 overflow-y-auto">
                  {repos.map((repo) => (
                    <button
                      key={repo.name}
                      type="button"
                      onClick={() => {
                        setSelectedRepo(repo.name)
                        setRepoDropdownOpen(false)
                      }}
                      className={cn(
                        "w-full px-3 py-2 text-left text-sm hover:bg-muted flex items-center gap-2",
                        selectedRepo === repo.name && "bg-muted"
                      )}
                    >
                      <Folder className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate">{repo.name}</div>
                        <div className="text-xs text-muted-foreground truncate">
                          {repo.stats.files} files • {repo.stats.nodes} nodes
                        </div>
                      </div>
                      {selectedRepo === repo.name && (
                        <CheckCircle className="h-3.5 w-3.5 text-primary flex-shrink-0" />
                      )}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        <div className="flex-1" />

        {/* Action buttons */}
        <div className="flex items-center gap-2">
          {projectPath && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleIndexProject}
              disabled={isAnalyzing || !status.apiServerRunning}
            >
              {isAnalyzing ? (
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
              )}
              Index Project
            </Button>
          )}

          <Button
            variant="outline"
            size="sm"
            onClick={() => addMcpMutation.mutate({ projectPath })}
            disabled={!projectPath || addMcpMutation.isPending}
          >
            <Plus className="h-3.5 w-3.5 mr-1.5" />
            Add to Claude Agents
          </Button>

          <Button
            variant={anyServerRunning ? "destructive" : "default"}
            size="sm"
            onClick={handleToggleServers}
            disabled={startServersMutation.isPending || stopServersMutation.isPending}
          >
            {anyServerRunning ? (
              <>
                <Square className="h-3.5 w-3.5 mr-1.5" />
                Stop Servers
              </>
            ) : (
              <>
                <Play className="h-3.5 w-3.5 mr-1.5" />
                Start Servers
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Analyze progress log (shown inline below toolbar when active) */}
      {(isAnalyzing || analyzeProgress.length > 0) && (
        <div className="border-b border-border px-4 py-2 bg-muted/50 max-h-32 overflow-y-auto flex-shrink-0">
          <div className="font-mono text-xs space-y-0.5">
            {analyzeProgress.map((line, i) => (
              <div key={i} className="text-muted-foreground leading-relaxed">
                {line}
              </div>
            ))}
            {isAnalyzing && (
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" />
                <span>Indexing...</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Main content: iframe or loading placeholder */}
      <div className="flex-1 overflow-hidden">
        {serversRunning ? (
          <iframe
            key={selectedRepo || "default"}
            src={iframeUrl}
            className="w-full h-full border-0"
            title="GitNexus"
          />
        ) : (
          <div className="h-full flex items-center justify-center">
            <div className="text-center space-y-3 text-muted-foreground">
              <Network className="h-10 w-10 mx-auto opacity-40" />
              <p className="text-sm">Start servers to open the GitNexus UI</p>
              <Button
                variant="default"
                size="sm"
                onClick={handleToggleServers}
                disabled={startServersMutation.isPending}
              >
                <Play className="h-3.5 w-3.5 mr-1.5" />
                Start Servers
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
