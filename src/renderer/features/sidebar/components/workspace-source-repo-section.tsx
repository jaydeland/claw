"use client"

import { memo, useCallback } from "react"
import { useAtom } from "jotai"
import { ChevronRight, ChevronDown, GitBranch } from "lucide-react"
import { cn } from "../../../lib/utils"
import { SingleRepoSection } from "../../github/components/github-tree-pane"
import {
  workspaceSidebarGithubExpandedAtom,
  type GitHubSelection,
} from "../../github/atoms"

interface WorkspaceSourceRepoSectionProps {
  project: {
    id: string
    path: string
    name: string
    gitOwner?: string | null
    gitRepo?: string | null
  }
  onItemSelect: (sel: GitHubSelection) => void
}

export const WorkspaceSourceRepoSection = memo(function WorkspaceSourceRepoSection({
  project,
  onItemSelect,
}: WorkspaceSourceRepoSectionProps) {
  const [expanded, setExpanded] = useAtom(workspaceSidebarGithubExpandedAtom)
  const isExpanded = expanded.has(project.id)

  const toggle = useCallback(() => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(project.id)) {
        next.delete(project.id)
      } else {
        next.add(project.id)
      }
      return next
    })
  }, [project.id, setExpanded])

  return (
    <div className="space-y-0.5">
      {/* "Source Repo" collapsible header — compact sidebar style */}
      <button
        type="button"
        onClick={toggle}
        className={cn(
          "w-full flex items-center gap-1.5 px-2 py-1 rounded-md text-left transition-colors",
          "text-xs text-muted-foreground hover:bg-foreground/10 hover:text-foreground",
        )}
      >
        {isExpanded ? (
          <ChevronDown className="h-3 w-3 flex-shrink-0" />
        ) : (
          <ChevronRight className="h-3 w-3 flex-shrink-0" />
        )}
        <GitBranch className="h-3 w-3 flex-shrink-0" />
        <span className="font-medium">Repo</span>
        {project.gitOwner && project.gitRepo && (
          <span className="ml-auto font-mono text-[10px] opacity-60 truncate">
            {project.gitOwner}/{project.gitRepo}
          </span>
        )}
      </button>

      {/* Tree — only mounted when expanded to avoid unnecessary data fetches */}
      {isExpanded && (
        <div className="ml-4">
          <SingleRepoSection
            projectId={project.id}
            projectPath={project.path}
            projectName={project.name}
            isExpanded={true}
            onToggleExpanded={() => {
              // Noop — the outer header button controls show/hide
            }}
            hideRepoHeader={true}
            onItemSelect={onItemSelect}
          />
        </div>
      )}
    </div>
  )
})
