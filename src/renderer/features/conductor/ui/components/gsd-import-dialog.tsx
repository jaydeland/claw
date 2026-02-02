"use client"

import { useState } from "react"
import { useAtom } from "jotai"
import { Loader2, FolderGit2, CheckCircle2, XCircle } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../../../components/ui/dialog"
import { Button } from "../../../../components/ui/button"
import { Checkbox } from "../../../../components/ui/checkbox"
import { trpc } from "../../../../lib/trpc"
import {
  conductorSelectedWorkspaceIdsAtom,
  gsdImportDialogOpenAtom,
} from "../../atoms"
import { toast } from "sonner"

/**
 * Dialog for importing GSD phases and plans into Conductor
 *
 * Shows selected workspaces, import options, and triggers the import mutation.
 */
export function GsdImportDialog() {
  const [open, setOpen] = useAtom(gsdImportDialogOpenAtom)
  const [selectedIds, setSelectedIds] = useAtom(conductorSelectedWorkspaceIdsAtom)
  const [importPlansAsTasks, setImportPlansAsTasks] = useState(true)

  const { data: projects } = trpc.projects.list.useQuery()
  const { data: gsdStatus } = trpc.gsd.getGsdStatusBatch.useQuery(
    {
      projectIds: selectedIds,
    },
    { enabled: selectedIds.length > 0 }
  )

  const importMutation = trpc.conductor.jobs.importFromGsd.useMutation({
    onSuccess: (result) => {
      const totalJobs = result.imported.reduce((sum, i) => sum + i.jobCount, 0)
      const totalPhases = result.imported.reduce((sum, i) => sum + i.phaseCount, 0)

      if (result.errors.length > 0) {
        toast.error(
          `Imported ${totalJobs} jobs from ${totalPhases} phases with ${result.errors.length} errors`
        )
      } else {
        toast.success(`Imported ${totalJobs} jobs from ${totalPhases} phases`)
      }

      // Clear selection and close dialog
      setSelectedIds([])
      setOpen(false)
    },
    onError: (err) => {
      toast.error(`Import failed: ${err.message}`)
    },
  })

  const selectedProjects = projects?.filter((p) => selectedIds.includes(p.id)) || []
  const selectedCount = selectedIds.length

  const totalPhases = selectedIds.reduce((sum, id) => {
    return sum + (gsdStatus?.[id]?.phaseCount || 0)
  }, 0)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import from GSD</DialogTitle>
          <DialogDescription>
            Import phases and plans from selected workspaces as Conductor jobs
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Selected workspaces list */}
          <div className="border rounded-lg p-3 max-h-64 overflow-y-auto">
            <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
              <FolderGit2 className="h-4 w-4" />
              Selected Workspaces ({selectedProjects.length})
            </h4>
            <div className="space-y-2">
              {selectedProjects.map((project) => {
                const status = gsdStatus?.[project.id]
                return (
                  <div
                    key={project.id}
                    className="flex items-start justify-between text-sm p-2 rounded hover:bg-muted/50"
                  >
                    <div className="flex-1">
                      <div className="font-medium">{project.name}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {project.path}
                      </div>
                      {status && (
                        <div className="text-xs text-muted-foreground mt-1">
                          {status.phaseCount} phases
                          {status.inProgressCount > 0 &&
                            ` • ${status.inProgressCount} in progress`}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Import preview */}
          {totalPhases > 0 && (
            <div className="text-sm text-muted-foreground flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-500" />
              Will import {totalPhases} phases
              {importPlansAsTasks && " with their plans as child tasks"}
            </div>
          )}

          {/* Import options */}
          <div className="space-y-2">
            <h4 className="text-sm font-medium">Options</h4>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="import-plans"
                checked={importPlansAsTasks}
                onCheckedChange={(checked) => setImportPlansAsTasks(!!checked)}
              />
              <label htmlFor="import-plans" className="text-sm cursor-pointer">
                Import plans as child tasks
              </label>
            </div>
            <p className="text-xs text-muted-foreground pl-6">
              When enabled, each plan in a phase will be imported as a child job
            </p>
          </div>

          {/* Warning for existing jobs */}
          <div className="text-xs text-muted-foreground bg-muted/50 p-2 rounded flex items-start gap-2">
            <XCircle className="h-3 w-3 mt-0.5 flex-shrink-0" />
            <div>
              Existing jobs will be skipped. To re-import, delete the existing jobs first.
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={importMutation.isPending}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              importMutation.mutate({
                projectIds: selectedIds,
                options: {
                  importPlansAsTasks,
                  overwriteExisting: false,
                },
              })
            }}
            disabled={importMutation.isPending || selectedCount === 0}
          >
            {importMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Import {totalPhases > 0 && `${totalPhases} Phases`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
