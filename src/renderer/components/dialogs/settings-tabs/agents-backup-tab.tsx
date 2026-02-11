"use client"

import { trpc, trpcClient } from "../../../lib/trpc"
import { useState, useRef } from "react"
import { Button } from "../../ui/button"
import { toast } from "sonner"
import { cn } from "../../../lib/utils"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../ui/dialog"
import {
  Download,
  Upload,
  FileJson,
  AlertTriangle,
  CheckCircle,
  Info,
} from "lucide-react"
import { IconSpinner } from "../../ui/icons"

/**
 * Backup tab for exporting and importing settings
 */
export function AgentsBackupTab() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [showPreviewDialog, setShowPreviewDialog] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Get localStorage preferences for export
  const getLocalStoragePreferences = () => {
    const prefs: Record<string, any> = {}
    const keys = [
      "selectedThemeId",
      "systemLightThemeId",
      "systemDarkThemeId",
      "customHotkeys",
      "extendedThinkingEnabled",
      "soundNotificationsEnabled",
      "ctrlTabTarget",
      "showWorkspaceIcon",
    ]

    keys.forEach((key) => {
      const value = localStorage.getItem(key)
      if (value !== null) {
        try {
          prefs[key] = JSON.parse(value)
        } catch {
          prefs[key] = value
        }
      }
    })

    return prefs
  }

  // Use tRPC utils for manual query execution
  const utils = trpc.useUtils()

  // Store validation result
  const [validationResult, setValidationResult] = useState<any>(null)

  // Import mutation
  const importMutation = trpc.settingsExport.importSettings.useMutation({
    onSuccess: (result) => {
      if (result.success) {
        toast.success("Settings imported successfully. Please restart the app for changes to take effect.")
        setShowPreviewDialog(false)
        setSelectedFile(null)
      } else {
        toast.error(result.error || "Failed to import settings")
      }
    },
    onError: (error) => {
      toast.error(`Import failed: ${error.message}`)
    },
  })

  // Handle export button click
  const handleExport = async () => {
    setIsExporting(true)
    try {
      // Fetch export data directly using tRPC client
      const data = await trpcClient.settingsExport.exportSettings.query({
        uiPreferences: getLocalStoragePreferences(),
      })

      if (!data) {
        toast.error("Failed to export settings")
        return
      }

      // Create JSON blob and download
      const json = JSON.stringify(data, null, 2)
      const blob = new Blob([json], { type: "application/json" })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `claw-settings-${new Date().toISOString().split("T")[0]}.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)

      toast.success("Settings exported successfully")
    } catch (err) {
      console.error("[backup] Export failed:", err)
      toast.error(`Failed to export settings: ${err instanceof Error ? err.message : "Unknown error"}`)
    } finally {
      setIsExporting(false)
    }
  }

  // Handle file selection
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setSelectedFile(file)

    // Read and validate file
    try {
      const content = await file.text()
      const validation = await trpcClient.settingsExport.validateImportFile.query({
        jsonContent: content,
      })

      setValidationResult(validation)

      if (validation.valid) {
        // Show preview dialog
        setShowPreviewDialog(true)
      } else {
        toast.error(validation.error || "Invalid settings file")
        setSelectedFile(null)
        setValidationResult(null)
      }
    } catch (err) {
      console.error("[backup] File read failed:", err)
      toast.error(`Failed to read file: ${err instanceof Error ? err.message : "Unknown error"}`)
      setSelectedFile(null)
      setValidationResult(null)
    }

    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = ""
    }
  }

  // Handle import confirmation
  const handleImport = () => {
    if (!validationResult?.valid || !validationResult.data) {
      toast.error("No valid settings to import")
      return
    }

    // Get UI preferences to import
    const uiPrefs = validationResult.data.uiPreferences || {}

    importMutation.mutate({
      data: validationResult.data,
      uiPreferences: uiPrefs,
    })
  }

  return (
    <div className="space-y-8">
      {/* Export Section */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Download className="h-5 w-5 text-muted-foreground" />
          <h3 className="text-lg font-semibold">Export Settings</h3>
        </div>

        <div className="rounded-lg border bg-card p-6 space-y-4">
          <p className="text-sm text-muted-foreground">
            Export your settings to a JSON file for backup or sharing across machines.
          </p>

          <div className="space-y-2">
            <div className="text-sm font-medium">Includes:</div>
            <ul className="text-sm text-muted-foreground space-y-1 ml-4">
              <li className="flex items-center gap-2">
                <CheckCircle className="h-3.5 w-3.5 text-green-500" />
                Authentication mode & URLs
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle className="h-3.5 w-3.5 text-green-500" />
                Custom paths & environment variables
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle className="h-3.5 w-3.5 text-green-500" />
                MCP configurations & plugin directories
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle className="h-3.5 w-3.5 text-green-500" />
                UI preferences (theme, hotkeys)
              </li>
            </ul>
          </div>

          <div className="space-y-2">
            <div className="text-sm font-medium">Excludes (for security):</div>
            <ul className="text-sm text-muted-foreground space-y-1 ml-4">
              <li className="flex items-center gap-2">
                <Info className="h-3.5 w-3.5 text-orange-500" />
                API keys & OAuth tokens
              </li>
              <li className="flex items-center gap-2">
                <Info className="h-3.5 w-3.5 text-orange-500" />
                AWS credentials & session tokens
              </li>
            </ul>
          </div>

          <Button
            onClick={handleExport}
            disabled={isExporting}
            className="w-full"
          >
            {isExporting ? (
              <>
                <IconSpinner className="mr-2 h-4 w-4" />
                Exporting...
              </>
            ) : (
              <>
                <Download className="mr-2 h-4 w-4" />
                Download Settings File
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Import Section */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Upload className="h-5 w-5 text-muted-foreground" />
          <h3 className="text-lg font-semibold">Import Settings</h3>
        </div>

        <div className="rounded-lg border bg-card p-6 space-y-4">
          <div className="rounded-md bg-orange-50 dark:bg-orange-950/20 border border-orange-200 dark:border-orange-900/50 p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-orange-600 dark:text-orange-500 flex-shrink-0 mt-0.5" />
              <div className="space-y-1">
                <div className="text-sm font-medium text-orange-900 dark:text-orange-400">
                  Warning: This will replace all your current settings
                </div>
                <p className="text-sm text-orange-700 dark:text-orange-500/80">
                  Make sure to export your current settings first if you want to keep a backup.
                </p>
              </div>
            </div>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            onChange={handleFileSelect}
            className="hidden"
          />

          <Button
            onClick={() => fileInputRef.current?.click()}
            variant="outline"
            className="w-full"
          >
            <FileJson className="mr-2 h-4 w-4" />
            {selectedFile ? selectedFile.name : "Choose Settings File..."}
          </Button>

          {selectedFile && (
            <div className="text-sm text-muted-foreground flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-green-500" />
              File selected and validated
            </div>
          )}
        </div>
      </div>

      {/* Preview Dialog */}
      {showPreviewDialog && validationResult?.valid && (
        <Dialog open={showPreviewDialog} onOpenChange={setShowPreviewDialog}>
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Preview Import</DialogTitle>
              <DialogDescription>
                Review the changes before importing. This will replace your current settings.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              {/* Settings Preview */}
              <div className="space-y-2">
                <h4 className="font-medium text-sm">Core Settings</h4>
                <div className="rounded-lg border bg-muted/30 p-3 space-y-1">
                  <PreviewItem
                    label="Auth Mode"
                    value={validationResult.data?.settings.authMode}
                  />
                  <PreviewItem
                    label="Custom Config Dir"
                    value={validationResult.data?.settings.customConfigDir}
                  />
                  <PreviewItem
                    label="Custom Worktree Location"
                    value={validationResult.data?.settings.customWorktreeLocation}
                  />
                  <PreviewItem
                    label="Bedrock Region"
                    value={validationResult.data?.settings.bedrockRegion}
                  />
                </div>
              </div>

              {/* MCP Configs Preview */}
              {validationResult.data?.mcpConfigPaths && validationResult.data.mcpConfigPaths.length > 0 && (
                <div className="space-y-2">
                  <h4 className="font-medium text-sm">MCP Config Paths ({validationResult.data.mcpConfigPaths.length})</h4>
                  <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
                    {validationResult.data.mcpConfigPaths.map((config, i) => (
                      <div key={i} className="text-xs font-mono truncate">
                        {config.path}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Plugin Directories Preview */}
              {validationResult.data?.pluginDirectories && validationResult.data.pluginDirectories.length > 0 && (
                <div className="space-y-2">
                  <h4 className="font-medium text-sm">Plugin Directories ({validationResult.data.pluginDirectories.length})</h4>
                  <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
                    {validationResult.data.pluginDirectories.map((plugin, i) => (
                      <div key={i} className="text-xs font-mono truncate">
                        {plugin.path}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setShowPreviewDialog(false)}
              >
                Cancel
              </Button>
              <Button
                onClick={handleImport}
                disabled={importMutation.isPending}
                variant="destructive"
              >
                {importMutation.isPending ? (
                  <>
                    <IconSpinner className="mr-2 h-4 w-4" />
                    Importing...
                  </>
                ) : (
                  "Import & Replace All Settings"
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}

// Helper component for preview items
function PreviewItem({ label, value }: { label: string; value: any }) {
  if (value === null || value === undefined) return null

  const displayValue = typeof value === "object" ? JSON.stringify(value) : String(value)

  return (
    <div className="flex items-start gap-2 text-xs">
      <span className="text-muted-foreground min-w-[160px]">{label}:</span>
      <span className="font-mono flex-1 truncate">{displayValue}</span>
    </div>
  )
}
