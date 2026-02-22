"use client"

import { useAtom, useSetAtom } from "jotai"
import { X } from "lucide-react"
import { useState } from "react"
import { pendingAuthRetryMessageAtom } from "../../features/agents/atoms"
import {
  agentsLoginModalOpenAtom,
  agentsSettingsDialogActiveTabAtom,
  agentsSettingsDialogOpenAtom,
  type SettingsTab,
} from "../../lib/atoms"
import { appStore } from "../../lib/jotai-store"
import { trpc } from "../../lib/trpc"
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
} from "../ui/alert-dialog"
import { Button } from "../ui/button"
import { ClaudeCodeIcon, IconSpinner } from "../ui/icons"
import { Input } from "../ui/input"
import { Logo } from "../ui/logo"

export function ClaudeLoginModal() {
  const [open, setOpen] = useAtom(agentsLoginModalOpenAtom)
  const setSettingsOpen = useSetAtom(agentsSettingsDialogOpenAtom)
  const setSettingsActiveTab = useSetAtom(agentsSettingsDialogActiveTabAtom)
  const [showManualInput, setShowManualInput] = useState(false)
  const [manualToken, setManualToken] = useState("")
  const [error, setError] = useState<string | null>(null)

  const importSystemToken = trpc.claudeCode.importSystemToken.useMutation()
  const importToken = trpc.claudeCode.importToken.useMutation()

  const triggerAuthRetry = () => {
    const pending = appStore.get(pendingAuthRetryMessageAtom)
    if (pending) {
      appStore.set(pendingAuthRetryMessageAtom, { ...pending, readyToRetry: true })
    }
  }

  const clearPendingRetry = () => {
    const pending = appStore.get(pendingAuthRetryMessageAtom)
    if (pending && !pending.readyToRetry) {
      appStore.set(pendingAuthRetryMessageAtom, null)
    }
  }

  const handleImportFromCLI = async () => {
    setError(null)
    try {
      await importSystemToken.mutateAsync()
      triggerAuthRetry()
      setOpen(false)
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "No Claude Code CLI token found"
      )
      setShowManualInput(true)
    }
  }

  const handleImportManual = async () => {
    if (!manualToken.trim()) return
    setError(null)
    try {
      await importToken.mutateAsync({ token: manualToken.trim() })
      triggerAuthRetry()
      setOpen(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to import token")
    }
  }

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      clearPendingRetry()
      setShowManualInput(false)
      setManualToken("")
      setError(null)
    }
    setOpen(newOpen)
  }

  const handleOpenModelsSettings = () => {
    clearPendingRetry()
    setSettingsActiveTab("models" as SettingsTab)
    setSettingsOpen(true)
    setOpen(false)
  }

  const isImporting = importSystemToken.isPending || importToken.isPending

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogContent className="w-[380px] p-6">
        {/* Close button */}
        <AlertDialogCancel className="absolute right-4 top-4 h-6 w-6 p-0 border-0 bg-transparent hover:bg-muted rounded-sm opacity-70 hover:opacity-100">
          <X className="h-4 w-4" />
          <span className="sr-only">Close</span>
        </AlertDialogCancel>

        <div className="space-y-8">
          {/* Header */}
          <div className="text-center space-y-4">
            <div className="flex items-center justify-center gap-2 p-2 mx-auto w-max rounded-full border border-border">
              <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center">
                <Logo className="w-5 h-5" fill="white" />
              </div>
              <div className="w-10 h-10 rounded-full bg-[#D97757] flex items-center justify-center">
                <ClaudeCodeIcon className="w-6 h-6 text-white" />
              </div>
            </div>
            <div className="space-y-1">
              <h1 className="text-base font-semibold tracking-tight">
                Claude Code
              </h1>
              <p className="text-sm text-muted-foreground">
                Connect your Claude Code subscription
              </p>
            </div>
          </div>

          {/* Content */}
          <div className="space-y-4">
            {/* Error */}
            {error && (
              <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
                <p className="text-sm text-destructive">{error}</p>
              </div>
            )}

            {/* Primary action */}
            {!showManualInput && (
              <Button
                onClick={handleImportFromCLI}
                className="w-full"
                disabled={isImporting}
              >
                {isImporting ? (
                  <IconSpinner className="h-4 w-4" />
                ) : (
                  "Import from Claude Code CLI"
                )}
              </Button>
            )}

            {/* Manual token input */}
            {showManualInput && (
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground">
                  Paste your Claude OAuth token below. You can find it in{" "}
                  <span className="font-mono">~/.claude/.credentials.json</span>
                </p>
                <Input
                  value={manualToken}
                  onChange={(e) => setManualToken(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleImportManual()}
                  placeholder="Paste token here..."
                  className="font-mono text-xs"
                  autoFocus
                  disabled={isImporting}
                />
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => {
                      setShowManualInput(false)
                      setError(null)
                    }}
                    disabled={isImporting}
                  >
                    Back
                  </Button>
                  <Button
                    className="flex-1"
                    onClick={handleImportManual}
                    disabled={!manualToken.trim() || isImporting}
                  >
                    {isImporting ? <IconSpinner className="h-4 w-4" /> : "Import"}
                  </Button>
                </div>
              </div>
            )}

            {/* Manual entry link */}
            {!showManualInput && (
              <div className="text-center">
                <button
                  type="button"
                  onClick={() => setShowManualInput(true)}
                  className="text-xs text-muted-foreground underline underline-offset-4 transition-colors hover:text-foreground"
                >
                  Enter token manually
                </button>
              </div>
            )}

            <div className="text-center !mt-2">
              <button
                type="button"
                onClick={handleOpenModelsSettings}
                className="text-xs text-muted-foreground underline underline-offset-4 transition-colors hover:text-foreground"
              >
                Set a custom model in Settings
              </button>
            </div>
          </div>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  )
}
