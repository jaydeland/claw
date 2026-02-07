"use client"

import { AlertTriangle, X } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
import { Button } from "../../../components/ui/button"
import { trpc } from "../../../lib/trpc"

/**
 * Banner component that appears when broken sessions are detected
 * Allows users to manually clear all session IDs and isolated directories
 */
export function BrokenSessionsBanner() {
  const [dismissed, setDismissed] = useState(false)

  // Check if broken sessions exist
  const { data: brokenSessionsStatus, isLoading, error } = trpc.claude.detectBrokenSessions.useQuery(undefined, {
    refetchInterval: 10000, // Check every 10 seconds
  })

  console.log('[BrokenSessionsBanner] Render:', { brokenSessionsStatus, isLoading, error, dismissed })

  // Mutation to clear broken sessions
  const clearMutation = trpc.claude.clearBrokenSessions.useMutation({
    onSuccess: (result) => {
      toast.success(
        `Cleared ${result.sessionIdsCleared} session(s) and ${result.directoriesCleared} director${result.directoriesCleared === 1 ? 'y' : 'ies'}`,
        { duration: 4000 }
      )
      setDismissed(false) // Reset dismissed state after clearing
    },
    onError: (error) => {
      toast.error(`Failed to clear sessions: ${error.message}`)
    },
  })

  const handleClearSessions = async () => {
    await clearMutation.mutateAsync()
  }

  const handleDismiss = () => {
    setDismissed(true)
  }

  // Don't show if dismissed or no broken sessions
  if (dismissed || !brokenSessionsStatus?.hasBroken) {
    return null
  }

  return (
    <div className="bg-amber-50 dark:bg-amber-950/30 border-b border-amber-200 dark:border-amber-800">
      <div className="flex items-center justify-between px-4 py-3 gap-3">
        <div className="flex items-center gap-2 text-sm text-amber-900 dark:text-amber-100 min-w-0 flex-1">
          <AlertTriangle className="h-4 w-4 flex-shrink-0" />
          <span className="flex-1">
            Some sessions have incompatible token limits and need to be cleared.
          </span>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <Button
            size="sm"
            variant="outline"
            onClick={handleClearSessions}
            disabled={clearMutation.isPending}
            className="border-amber-300 dark:border-amber-700 hover:bg-amber-100 dark:hover:bg-amber-900/50"
          >
            {clearMutation.isPending ? "Clearing..." : "Clear Sessions"}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={handleDismiss}
            className="hover:bg-amber-100 dark:hover:bg-amber-900/50"
            aria-label="Dismiss"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}
