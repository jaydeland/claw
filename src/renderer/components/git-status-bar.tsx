"use client"

import { useAtomValue } from "jotai"
import { GitBranch, ExternalLink, Github, GitFork } from "lucide-react"
import { trpc } from "../lib/trpc"
import { cn } from "../lib/utils"
import { selectedProjectAtom, selectedAgentChatIdAtom } from "../features/agents/atoms"

/**
 * Git Status Bar Component
 *
 * Displays at the bottom of the app when a project is selected,
 * showing repository name (org/repo) and current branch.
 * Shows worktree-specific branch if the chat has a worktree.
 * Provides a link to open the repository in the browser.
 */
export function GitStatusBar() {
  const selectedProject = useAtomValue(selectedProjectAtom)
  const selectedChatId = useAtomValue(selectedAgentChatIdAtom)

  // Query git status for the selected project and chat
  const { data: gitStatus } = trpc.projects.getGitStatus.useQuery(
    {
      id: selectedProject?.id!,
      chatId: selectedChatId ?? undefined,
    },
    {
      enabled: !!selectedProject?.id,
      refetchInterval: 30000, // Refresh every 30 seconds to catch branch changes
    }
  )

  // Don't show if no project selected or no git info
  if (!selectedProject || !gitStatus || !gitStatus.gitOwner || !gitStatus.gitRepo) {
    return null
  }

  const repoFullName = `${gitStatus.gitOwner}/${gitStatus.gitRepo}`

  // Generate repository URL based on provider
  const getRepoUrl = () => {
    if (!gitStatus.gitProvider || !gitStatus.gitOwner || !gitStatus.gitRepo) {
      return null
    }

    switch (gitStatus.gitProvider) {
      case "github":
        return `https://github.com/${gitStatus.gitOwner}/${gitStatus.gitRepo}`
      case "gitlab":
        return `https://gitlab.com/${gitStatus.gitOwner}/${gitStatus.gitRepo}`
      case "bitbucket":
        return `https://bitbucket.org/${gitStatus.gitOwner}/${gitStatus.gitRepo}`
      default:
        return null
    }
  }

  const repoUrl = getRepoUrl()

  const openInBrowser = () => {
    if (repoUrl && window.desktopApi?.openExternal) {
      window.desktopApi.openExternal(repoUrl)
    }
  }

  const getProviderIcon = () => {
    switch (gitStatus.gitProvider) {
      case "github":
        return <Github className="h-3 w-3" />
      case "gitlab":
      case "bitbucket":
        return <ExternalLink className="h-3 w-3" />
      default:
        return <ExternalLink className="h-3 w-3" />
    }
  }

  return (
    <div className="h-6 bg-muted/50 border-t border-border flex items-center px-3 text-xs text-muted-foreground flex-shrink-0">
      <div className="flex items-center gap-4 flex-1">
        {/* Provider Icon */}
        <div className="flex items-center gap-1.5">
          {getProviderIcon()}
        </div>

        {/* Repository Name */}
        <button
          onClick={openInBrowser}
          disabled={!repoUrl}
          className={cn(
            "flex items-center gap-1 font-mono text-muted-foreground/90",
            repoUrl && "hover:text-foreground hover:underline cursor-pointer transition-colors"
          )}
          title={repoUrl ? `Open ${repoFullName} in browser` : repoFullName}
        >
          <span className="font-semibold">{repoFullName}</span>
          {repoUrl && <ExternalLink className="h-2.5 w-2.5" />}
        </button>

        {/* Current Branch */}
        {gitStatus.currentBranch && (
          <div className="flex items-center gap-1.5">
            {gitStatus.isWorktree ? (
              <GitFork className="h-3 w-3" />
            ) : (
              <GitBranch className="h-3 w-3" />
            )}
            <span className="font-mono font-medium text-foreground">
              {gitStatus.currentBranch}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
