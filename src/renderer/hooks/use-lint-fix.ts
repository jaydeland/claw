import { useState } from "react"
import { trpc } from "../lib/trpc"
import { toast } from "sonner"

export interface LintDiagnostic {
  message: string
  line?: number
  column?: number
  severity?: "error" | "warning" | "info"
}

export function useLintFix() {
  const [isFixing, setIsFixing] = useState(false)

  const fixLintErrorsMutation = trpc.claude.fixLintErrors.useMutation({
    onSuccess: (result) => {
      if (result.success) {
        const changeCount = result.changesApplied || 0
        if (changeCount > 0) {
          toast.success(`Fixed ${changeCount} issue${changeCount === 1 ? "" : "s"} with Claude`)
        } else {
          toast.info("Claude reviewed the file but made no changes")
        }
      } else {
        toast.error(result.error || "Failed to fix lint errors")
      }
    },
    onError: (error) => {
      toast.error(error.message || "Failed to fix lint errors")
    },
  })

  const fixLintErrors = async (
    filePath: string,
    diagnostics: LintDiagnostic[],
    cwd: string
  ) => {
    if (diagnostics.length === 0) {
      toast.info("No lint errors to fix")
      return
    }

    setIsFixing(true)
    toast.loading(`Fixing ${diagnostics.length} lint error${diagnostics.length === 1 ? "" : "s"}...`, {
      id: "lint-fix",
    })

    try {
      const result = await fixLintErrorsMutation.mutateAsync({
        filePath,
        diagnostics,
        cwd,
      })

      toast.dismiss("lint-fix")
      setIsFixing(false)
      return result
    } catch (error) {
      toast.dismiss("lint-fix")
      setIsFixing(false)
      throw error
    }
  }

  return {
    fixLintErrors,
    isFixing,
  }
}
