"use client"

import { useEffect, useMemo } from "react"
import { useAtom, useAtomValue, useSetAtom } from "jotai"
import {
  Rocket,
  Loader2,
  Download,
  Check,
  FolderOpen,
  ChevronDown,
} from "lucide-react"
import { cn } from "../../../lib/utils"
import { trpc } from "../../../lib/trpc"
import { selectedProjectAtom, selectedAgentChatIdAtom } from "../../agents/atoms"
import {
  selectedGsdCategoryAtom,
  selectedGsdProjectIdAtom,
  gsdUpdateInfoAtom,
  gsdUpdateInProgressAtom,
} from "../../gsd/atoms"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../../../components/ui/dropdown-menu"
import { Button } from "../../../components/ui/button"

interface GsdTabContentProps {
  isMobileFullscreen?: boolean
  className?: string
}

/**
 * Version badge component showing current GSD version and update status
 */
function VersionBadge({
  version,
  updateAvailable,
  isChecking,
}: {
  version: string | null
  updateAvailable: boolean
  isChecking: boolean
}) {
  if (isChecking) {
    return (
      <div className="flex items-center gap-1 text-xs text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" />
        <span>Checking...</span>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-1.5">
      <span className="text-xs text-muted-foreground">
        {version ? `v${version}` : "Not installed"}
      </span>
      {updateAvailable && (
        <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" title="Update available" />
      )}
    </div>
  )
}

export function GsdTabContent({ className }: GsdTabContentProps) {
  const [selectedProjectId, setSelectedProjectId] = useAtom(selectedGsdProjectIdAtom)
  const setSelectedCategory = useSetAtom(selectedGsdCategoryAtom)
  const setSelectedChatId = useSetAtom(selectedAgentChatIdAtom)
  const [updateInfo, setUpdateInfo] = useAtom(gsdUpdateInfoAtom)
  const [updateInProgress, setUpdateInProgress] = useAtom(gsdUpdateInProgressAtom)
  const selectedProject = useAtomValue(selectedProjectAtom)

  // Fetch GSD version
  const { data: versionData } = trpc.gsd.getVersion.useQuery()

  // Check for updates
  const { data: updateData, isLoading: isCheckingUpdates } = trpc.gsd.checkForUpdates.useQuery(
    undefined,
    {
      enabled: !!versionData?.version,
      refetchOnMount: true,
      staleTime: 5 * 60 * 1000, // 5 minutes
    }
  )

  // Update mutation
  const updateMutation = trpc.gsd.downloadUpdate.useMutation({
    onSuccess: (result) => {
      setUpdateInProgress(false)
      if (result.success) {
        window.location.reload()
      }
    },
    onError: () => {
      setUpdateInProgress(false)
    },
  })

  // Fetch projects for dropdown
  const { data: projectsData } = trpc.projects.list.useQuery()

  // Update updateInfo atom when data changes
  useEffect(() => {
    if (updateData) {
      setUpdateInfo({
        available: updateData.updateAvailable,
        currentVersion: updateData.currentVersion,
        latestVersion: updateData.latestVersion,
        releaseUrl: updateData.releaseUrl,
        releaseNotes: updateData.releaseNotes,
      })
    }
  }, [updateData, setUpdateInfo])

  // Find selected project object
  const selectedProjectObj = useMemo(() => {
    if (!projectsData || !selectedProjectId) return null
    return projectsData.find((p) => p.id === selectedProjectId) || null
  }, [projectsData, selectedProjectId])

  // Default to current workspace project if none selected
  useEffect(() => {
    if (!selectedProjectId && selectedProject?.id) {
      setSelectedProjectId(selectedProject.id)
    }
  }, [selectedProject, selectedProjectId, setSelectedProjectId])

  // Handle opening GSD view
  const handleOpenGsd = () => {
    setSelectedCategory("gsd")
    setSelectedChatId(null)
  }

  // Handle update download
  const handleUpdate = () => {
    if (updateData?.latestVersion && !updateInProgress) {
      setUpdateInProgress(true)
      updateMutation.mutate({ version: updateData.latestVersion })
    }
  }

  return (
    <div className={cn("flex flex-col h-full", className)}>
      {/* Header with logo, version, and update */}
      <div className="px-3 py-2 border-b border-border/50 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Rocket className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold">GSD</span>
          </div>
          <VersionBadge
            version={versionData?.version || null}
            updateAvailable={updateInfo?.available || false}
            isChecking={isCheckingUpdates}
          />
        </div>

        {/* Update button */}
        {updateInfo?.available && updateInfo.latestVersion && (
          <Button
            size="sm"
            variant="outline"
            onClick={handleUpdate}
            disabled={updateInProgress}
            className="w-full mt-2 h-7 text-xs"
          >
            {updateInProgress ? (
              <>
                <Loader2 className="h-3 w-3 mr-1.5 animate-spin" />
                Updating...
              </>
            ) : (
              <>
                <Download className="h-3 w-3 mr-1.5" />
                Update to v{updateInfo.latestVersion}
              </>
            )}
          </Button>
        )}
      </div>

      {/* Project selector */}
      <div className="px-2 py-2 border-b border-border/50 flex-shrink-0">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-2 w-full px-2 py-1.5 rounded-md hover:bg-foreground/5 text-left">
              <FolderOpen className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
              <span className="text-xs truncate flex-1">
                {selectedProjectObj?.name || "Select project..."}
              </span>
              <ChevronDown className="h-3 w-3 text-muted-foreground flex-shrink-0" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            {projectsData?.map((project) => (
              <DropdownMenuItem
                key={project.id}
                onClick={() => setSelectedProjectId(project.id)}
                className="flex items-center gap-2"
              >
                <FolderOpen className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="truncate flex-1">{project.name}</span>
                {project.id === selectedProjectId && (
                  <Check className="h-3.5 w-3.5 text-primary flex-shrink-0" />
                )}
              </DropdownMenuItem>
            ))}
            {(!projectsData || projectsData.length === 0) && (
              <DropdownMenuItem disabled className="text-muted-foreground">
                No projects available
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Open GSD View button */}
      <div className="flex-1 px-2 pt-3">
        <Button
          variant="secondary"
          size="sm"
          onClick={handleOpenGsd}
          className="w-full h-8 text-xs"
        >
          <Rocket className="h-3.5 w-3.5 mr-1.5" />
          Open Planning Docs
        </Button>
        <p className="text-[10px] text-muted-foreground text-center mt-2 px-2">
          View documentation, README, and project planning files
        </p>
      </div>
    </div>
  )
}
