"use client"

import { useState, useEffect } from "react"
import { useAtom, useSetAtom } from "jotai"
import { ArrowLeft, FolderOpen, GitBranch, Settings } from "lucide-react"
import { cn } from "../../../lib/utils"
import { Button } from "../../../components/ui/button"
import {
  selectedProjectAtom,
  selectedProjectDetailIdAtom,
  selectedAgentChatIdAtom,
} from "../../agents/atoms"
import { trpc } from "../../../lib/trpc"

// Settings tabs for project page
const PROJECT_TABS = [
  { id: "worktree", label: "Worktree Settings", icon: Settings },
  { id: "worktrees", label: "Worktrees", icon: GitBranch },
]

interface ProjectDetailPageProps {
  className?: string
}

export function ProjectDetailPage({ className }: ProjectDetailPageProps) {
  const [selectedProject, setSelectedProject] = useAtom(selectedProjectAtom)
  const [projectDetailId, setProjectDetailId] = useAtom(selectedProjectDetailIdAtom)
  const setSelectedChatId = useSetAtom(selectedAgentChatIdAtom)
  const [activeTab, setActiveTab] = useState("worktree")

  // Get the project from the detail ID or fall back to selectedProject
  const project = selectedProject?.id === projectDetailId ? selectedProject : null

  // Handle back button - close project detail view
  const handleBack = () => {
    setProjectDetailId(null)
  }

  // Handle new chat - close project detail and start new chat
  const handleNewChat = () => {
    setProjectDetailId(null)
    setSelectedChatId(null)
  }

  if (!project) {
    return (
      <div className={cn("flex flex-col items-center justify-center h-full", className)}>
        <p className="text-muted-foreground">No project selected</p>
        <Button variant="ghost" onClick={handleBack} className="mt-4">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Go Back
        </Button>
      </div>
    )
  }

  return (
    <div className={cn("flex flex-col h-full w-full", className)}>
      {/* Header */}
      <div className="flex-shrink-0 border-b px-4 py-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={handleBack}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <FolderOpen className="h-5 w-5 text-muted-foreground" />
              <h1 className="text-lg font-semibold truncate">{project.name}</h1>
            </div>
            <div className="text-sm text-muted-foreground truncate font-mono mt-0.5">
              {project.path}
            </div>
            {project.gitOwner && project.gitRepo && (
              <div className="text-xs text-muted-foreground truncate font-mono mt-0.5">
                <GitBranch className="h-3 w-3 inline mr-1" />
                {project.gitOwner}/{project.gitRepo}
              </div>
            )}
          </div>
          <Button variant="outline" size="sm" onClick={handleNewChat}>
            New Chat
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex-shrink-0 border-b px-4">
        <div className="flex gap-1">
          {PROJECT_TABS.map((tab) => {
            const Icon = tab.icon
            const isActive = activeTab === tab.id
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "flex items-center gap-2 px-3 py-2.5 text-sm font-medium border-b-2 transition-colors",
                  isActive
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                )}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {activeTab === "worktree" && (
          <div className="max-w-3xl space-y-8">
            <ProjectWorktreeSettings projectId={project.id} />
          </div>
        )}
        {activeTab === "worktrees" && (
          <div className="max-w-3xl">
            <ProjectWorktreesList projectId={project.id} />
          </div>
        )}
      </div>
    </div>
  )
}

// Worktree Settings Tab Component
function ProjectWorktreeSettings({ projectId }: { projectId: string }) {
  // Get config for selected project
  const { data: configData, refetch: refetchConfig } =
    trpc.worktreeConfig.get.useQuery(
      { projectId },
      { enabled: !!projectId },
    )

  // Save mutation
  const saveMutation = trpc.worktreeConfig.save.useMutation({
    onSuccess: () => {
      refetchConfig()
    },
    onError: (err) => {
      console.error("Failed to save worktree config:", err)
    },
  })

  // Local state for form fields
  const [configLocation, setConfigLocation] = useState(
    configData?.config?.["worktree-location"] ?? ".claw/worktree.json"
  )
  const [worktreeBaseDir, setWorktreeBaseDir] = useState("")

  // Update local state when config data loads
  useEffect(() => {
    if (configData?.config) {
      setConfigLocation(configData.config["worktree-location"] ?? ".claw/worktree.json")
      // worktreeBaseDir would come from a different source if needed
    }
  }, [configData])

  const handleSaveConfig = () => {
    saveMutation.mutate({
      projectId,
      config: {
        "worktree-location": configLocation || undefined,
      },
      target: "claw",
    })
  }

  if (!configData) {
    return <div className="text-muted-foreground">Loading...</div>
  }

  return (
    <div className="space-y-8">
      {/* Config Location */}
      <section>
        <h3 className="text-sm font-medium mb-3">Config Location</h3>
        <div className="space-y-3">
          <div>
            <label className="text-sm text-muted-foreground">Config File Path</label>
            <input
              type="text"
              value={configLocation}
              onChange={(e) => setConfigLocation(e.target.value)}
              className="w-full mt-1 px-3 py-2 text-sm border rounded-md bg-background"
              placeholder=".claw/worktree.json"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Where to store worktree configuration for this project
            </p>
          </div>
          <Button onClick={handleSaveConfig} disabled={saveMutation.isPending}>
            {saveMutation.isPending ? "Saving..." : "Save Config Location"}
          </Button>
        </div>
      </section>

      {/* Worktree Directory */}
      <section>
        <h3 className="text-sm font-medium mb-3">Worktree Directory</h3>
        <div className="space-y-3">
          <div>
            <label className="text-sm text-muted-foreground">Base Directory (optional)</label>
            <input
              type="text"
              value={worktreeBaseDir}
              onChange={(e) => setWorktreeBaseDir(e.target.value)}
              className="w-full mt-1 px-3 py-2 text-sm border rounded-md bg-background"
              placeholder="Leave empty for default location"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Override where git worktrees are created for this project
            </p>
          </div>
          <Button onClick={handleSaveConfig} disabled={saveMutation.isPending}>
            {saveMutation.isPending ? "Saving..." : "Save Directory"}
          </Button>
        </div>
      </section>
    </div>
  )
}

// Worktrees List Tab Component
function ProjectWorktreesList({ projectId }: { projectId: string }) {
  const { data: worktrees, isLoading } = trpc.worktrees.list.useQuery(
    { projectId },
    { enabled: !!projectId },
  )

  const deleteMutation = trpc.worktrees.delete.useMutation({
    onError: (err) => {
      console.error("Failed to delete worktree:", err)
    },
  })

  const handleDelete = (worktreePath: string) => {
    if (confirm(`Delete worktree at ${worktreePath}?`)) {
      deleteMutation.mutate({ path: worktreePath })
    }
  }

  if (isLoading) {
    return <div className="text-muted-foreground">Loading worktrees...</div>
  }

  if (!worktrees || worktrees.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
        <GitBranch className="h-12 w-12 mb-4 opacity-50" />
        <p>No worktrees found for this project</p>
        <p className="text-sm mt-1">Worktrees are created automatically when you start a new chat</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-medium">Git Worktrees</h3>
      <div className="space-y-2">
        {worktrees.map((worktree) => (
          <div
            key={worktree.path}
            className="flex items-center justify-between p-3 border rounded-lg"
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <GitBranch className="h-4 w-4 text-muted-foreground" />
                <span className="font-mono text-sm truncate">{worktree.path}</span>
              </div>
              {worktree.branch && (
                <div className="text-xs text-muted-foreground mt-1">
                  Branch: {worktree.branch}
                </div>
              )}
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleDelete(worktree.path)}
              className="text-destructive"
            >
              Delete
            </Button>
          </div>
        ))}
      </div>
    </div>
  )
}
