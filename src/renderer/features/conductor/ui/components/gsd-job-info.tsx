"use client"

import { Loader2, Rocket } from "lucide-react"
import { Button } from "../../../../components/ui/button"
import { trpc } from "../../../../lib/trpc"
import type { ConductorJob } from "../../../../../main/lib/db/schema/conductor"
import { toast } from "sonner"

interface GsdJobInfoProps {
  job: ConductorJob
}

/**
 * Display GSD metadata and command trigger for GSD-linked jobs
 *
 * Shows phase/plan information and allows manually triggering GSD commands.
 */
export function GsdJobInfo({ job }: GsdJobInfoProps) {
  const gsdSource = job.gsdSource ? (JSON.parse(job.gsdSource) as {
    projectId: string
    phaseNumber: string
    planNumber?: string
    type: "phase" | "plan"
    filePath?: string
  }) : null

  const { data: gsdCommand } = trpc.conductor.jobs.getGsdCommandForJob.useQuery(
    { jobId: job.id },
    { enabled: !!job.gsdSource }
  )

  const triggerCommandMutation = trpc.conductor.jobs.triggerGsdCommand.useMutation({
    onSuccess: (result) => {
      toast.success(
        <div className="flex items-center gap-2">
          <span>GSD command created in chat</span>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              // TODO: Navigate to chat
              // window.desktopApi.openChat(result.chatId, result.subChatId)
            }}
          >
            Open
          </Button>
        </div>,
        { duration: 5000 }
      )
    },
    onError: (err) => {
      toast.error(`Failed to trigger GSD command: ${err.message}`)
    },
  })

  if (!gsdSource) return null

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Rocket className="h-3 w-3 text-purple-500" />
        <span>
          Phase {gsdSource.phaseNumber}
          {gsdSource.planNumber && ` • Plan ${gsdSource.planNumber}`}
          {gsdSource.type && ` • Type: ${gsdSource.type}`}
        </span>
      </div>

      {gsdCommand?.command && (
        <div className="space-y-2">
          <div className="text-xs font-mono bg-muted p-2 rounded border">
            {gsdCommand.command}
          </div>
          {gsdCommand.description && (
            <p className="text-xs text-muted-foreground">{gsdCommand.description}</p>
          )}
          <Button
            size="sm"
            variant="outline"
            onClick={() => triggerCommandMutation.mutate({ jobId: job.id })}
            disabled={triggerCommandMutation.isPending}
            className="w-full h-7 text-xs"
          >
            {triggerCommandMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                Creating...
              </>
            ) : (
              "Run GSD Command"
            )}
          </Button>
        </div>
      )}

      {job.gsdVerified && (
        <div className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1">
          <span className="w-1 h-1 rounded-full bg-green-500"></span>
          Verified complete
        </div>
      )}
    </div>
  )
}
