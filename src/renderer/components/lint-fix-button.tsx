"use client"

import { Wand2, Loader2 } from "lucide-react"
import { Button } from "./ui/button"
import { useLintFix, type LintDiagnostic } from "../hooks/use-lint-fix"

interface LintFixButtonProps {
  filePath: string
  diagnostics: LintDiagnostic[]
  cwd: string
  variant?: "default" | "outline" | "ghost"
  size?: "default" | "sm" | "lg" | "icon"
  className?: string
  onFixComplete?: () => void
}

/**
 * Button that uses Claude to automatically fix TypeScript/ESLint errors
 *
 * Usage:
 * <LintFixButton
 *   filePath="/path/to/file.ts"
 *   diagnostics={[{ message: "Type error...", line: 42 }]}
 *   cwd="/path/to/project"
 * />
 */
export function LintFixButton({
  filePath,
  diagnostics,
  cwd,
  variant = "outline",
  size = "sm",
  className,
  onFixComplete,
}: LintFixButtonProps) {
  const { fixLintErrors, isFixing } = useLintFix()

  const handleFix = async () => {
    const result = await fixLintErrors(filePath, diagnostics, cwd)
    if (result?.success && onFixComplete) {
      onFixComplete()
    }
  }

  const errorCount = diagnostics.filter((d) => d.severity === "error").length
  const warningCount = diagnostics.filter((d) => d.severity === "warning").length

  const label = errorCount > 0
    ? `Fix ${errorCount} error${errorCount === 1 ? "" : "s"}`
    : warningCount > 0
      ? `Fix ${warningCount} warning${warningCount === 1 ? "" : "s"}`
      : "Fix with Claude"

  return (
    <Button
      variant={variant}
      size={size}
      onClick={handleFix}
      disabled={isFixing || diagnostics.length === 0}
      className={className}
    >
      {isFixing ? (
        <>
          <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
          Fixing...
        </>
      ) : (
        <>
          <Wand2 className="w-3.5 h-3.5 mr-1.5" />
          {label}
        </>
      )}
    </Button>
  )
}
