"use client"

import { AlertCircle, AlertTriangle, Info, RefreshCw } from "lucide-react"
import { cn } from "../lib/utils"
import { Button } from "./ui/button"
import { LintFixButton } from "./lint-fix-button"
import type { LintDiagnostic } from "../hooks/use-lint-fix"

interface DiagnosticsPanelProps {
  filePath: string
  diagnostics: LintDiagnostic[]
  cwd: string
  onRefresh?: () => void
  onFixComplete?: () => void
}

function getSeverityIcon(severity?: string) {
  switch (severity) {
    case "error":
      return <AlertCircle className="w-4 h-4 text-red-500" />
    case "warning":
      return <AlertTriangle className="w-4 h-4 text-amber-500" />
    default:
      return <Info className="w-4 h-4 text-blue-500" />
  }
}

function getSeverityColor(severity?: string) {
  switch (severity) {
    case "error":
      return "text-red-500"
    case "warning":
      return "text-amber-500"
    default:
      return "text-blue-500"
  }
}

/**
 * Panel showing TypeScript/ESLint diagnostics with Claude-powered auto-fix
 *
 * Usage:
 * <DiagnosticsPanel
 *   filePath="/path/to/file.ts"
 *   diagnostics={diagnostics}
 *   cwd="/path/to/project"
 *   onRefresh={() => runTypeScriptCheck()}
 *   onFixComplete={() => runTypeScriptCheck()}
 * />
 */
export function DiagnosticsPanel({
  filePath,
  diagnostics,
  cwd,
  onRefresh,
  onFixComplete,
}: DiagnosticsPanelProps) {
  const errorCount = diagnostics.filter((d) => d.severity === "error").length
  const warningCount = diagnostics.filter((d) => d.severity === "warning").length
  const infoCount = diagnostics.length - errorCount - warningCount

  if (diagnostics.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
        <AlertCircle className="w-8 h-8 mb-2 text-emerald-500" />
        <p className="text-sm">No diagnostics found</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header with stats and actions */}
      <div className="flex items-center justify-between px-4 py-2 bg-muted/50 rounded-lg">
        <div className="flex items-center gap-4 text-xs">
          {errorCount > 0 && (
            <span className="flex items-center gap-1 text-red-500">
              <AlertCircle className="w-3.5 h-3.5" />
              {errorCount} error{errorCount === 1 ? "" : "s"}
            </span>
          )}
          {warningCount > 0 && (
            <span className="flex items-center gap-1 text-amber-500">
              <AlertTriangle className="w-3.5 h-3.5" />
              {warningCount} warning{warningCount === 1 ? "" : "s"}
            </span>
          )}
          {infoCount > 0 && (
            <span className="flex items-center gap-1 text-blue-500">
              <Info className="w-3.5 h-3.5" />
              {infoCount} info
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {onRefresh && (
            <Button variant="ghost" size="sm" onClick={onRefresh}>
              <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
              Refresh
            </Button>
          )}
          <LintFixButton
            filePath={filePath}
            diagnostics={diagnostics}
            cwd={cwd}
            onFixComplete={onFixComplete}
          />
        </div>
      </div>

      {/* Diagnostic list */}
      <div className="space-y-2">
        {diagnostics.map((diagnostic, index) => (
          <div
            key={index}
            className="flex items-start gap-3 p-3 bg-muted/30 rounded-lg border border-border"
          >
            <div className="flex-shrink-0 mt-0.5">
              {getSeverityIcon(diagnostic.severity)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline gap-2 mb-1">
                {diagnostic.line && (
                  <span className="text-xs font-mono text-muted-foreground">
                    Line {diagnostic.line}{diagnostic.column ? `:${diagnostic.column}` : ""}
                  </span>
                )}
                <span className={cn("text-xs font-medium", getSeverityColor(diagnostic.severity))}>
                  {diagnostic.severity?.toUpperCase() || "INFO"}
                </span>
              </div>
              <p className="text-sm text-foreground">{diagnostic.message}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
