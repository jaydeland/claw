"use client"

import React, { useState, useMemo } from "react"
import { Zap, Plus, Play, Settings, History, Clock, CheckCircle, XCircle, Loader2, Power, PowerOff, Trash2, ExternalLink, Edit, RefreshCw } from "lucide-react"
import { cn } from "../../../lib/utils"
import { trpc } from "../../../lib/trpc"
import { useAtom } from "jotai"
import { selectedClawAtom, isEditingClawAtom } from "../../../lib/atoms"
import { Input } from "../../../components/ui/input"
import { Button } from "../../../components/ui/button"
import { Switch } from "../../../components/ui/switch"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "../../../components/ui/dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../../../components/ui/alert-dialog"
import { ScrollArea } from "../../../components/ui/scroll-area"
import { CreateClawModal } from "./create-claw-modal"

interface ClawsTabContentProps {
  className?: string
  isMobileFullscreen?: boolean
}

type ClawWithParsedConfig = {
  id: string
  name: string
  purpose: string
  instruction: string
  soulInstruction?: string
  targetWorktree: string
  triggerType: "cron" | "github_poll" | "manual" | "slack_mention" | "whatsapp_message"
  triggerConfig: { expression?: string; owner?: string; repo?: string; label?: string; slackChannelFilter?: string; whatsappChatFilter?: string }
  isEnabled: boolean
  createdAt: Date
  allowedDirectories?: string
  allowedMcpServers?: string
}

export function ClawsTabContent({ className, isMobileFullscreen }: ClawsTabContentProps) {
  const [searchQuery, setSearchQuery] = useState("")
  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [selectedClaw, setSelectedClaw] = useAtom(selectedClawAtom)
  const [isEditingClaw, setIsEditingClaw] = useAtom(isEditingClawAtom)
  const [clawToDelete, setClawToDelete] = useState<string | null>(null)
  const [clawToTrigger, setClawToTrigger] = useState<string | null>(null)

  const utils = trpc.useUtils()

  const { data: clawsData, isLoading, error } = trpc.claws.getAll.useQuery()
  const { data: githubTokenData } = trpc.github.hasToken.useQuery()

  const toggleMutation = trpc.claws.toggleEnabled.useMutation({
    onSuccess: () => utils.claws.getAll.invalidate(),
  })

  const deleteMutation = trpc.claws.delete.useMutation({
    onSuccess: () => {
      utils.claws.getAll.invalidate()
      setClawToDelete(null)
    },
  })

  const triggerMutation = trpc.claws.trigger.useMutation({
    onSuccess: () => {
      setClawToTrigger(null)
      if (selectedClaw) {
        utils.claws.getExecutions.invalidate({ clawId: selectedClaw.id })
      }
    },
  })

  const claws = useMemo(() => {
    if (!clawsData?.claws) return []
    let result = clawsData.claws as ClawWithParsedConfig[]
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      result = result.filter(
        (c) =>
          c.name.toLowerCase().includes(query) ||
          c.purpose?.toLowerCase().includes(query) ||
          c.instruction.toLowerCase().includes(query) ||
          c.targetWorktree.toLowerCase().includes(query)
      )
    }
    return result
  }, [clawsData, searchQuery])

  const getTriggerLabel = (claw: ClawWithParsedConfig) => {
    switch (claw.triggerType) {
      case "cron":
        return `Cron: ${claw.triggerConfig.expression || "N/A"}`
      case "github_poll":
        return `GitHub: ${claw.triggerConfig.owner}/${claw.triggerConfig.repo}#${claw.triggerConfig.label}`
      case "manual":
        return "Manual trigger"
      case "slack_mention":
        return `Slack: ${claw.triggerConfig.slackChannelFilter || "mentions"}`
      case "whatsapp_message":
        return `WhatsApp: ${claw.triggerConfig.whatsappChatFilter || "messages"}`
      default:
        return "Unknown"
    }
  }

  const handleDelete = () => {
    if (clawToDelete) {
      deleteMutation.mutate({ id: clawToDelete })
    }
  }

  const handleTrigger = (clawId: string) => {
    setClawToTrigger(clawId)
    triggerMutation.mutate({ id: clawId })
  }

  return (
    <div className={cn("flex flex-col h-full", className)}>
      {/* Header with search and actions */}
      <div className="px-2 pb-2 flex-shrink-0 space-y-2">
        <div className="flex items-center gap-2">
          <Input
            placeholder="Search claws..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className={cn(
              "flex-1 rounded-lg text-sm bg-muted border border-input placeholder:text-muted-foreground/40",
              isMobileFullscreen ? "h-10" : "h-7"
            )}
          />
          <Button
            variant="outline"
            size="icon"
            className="h-7 w-7 shrink-0"
            onClick={() => setCreateModalOpen(true)}
            title="Create new claw"
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>

        {/* GitHub Token Warning */}
        {!githubTokenData?.hasToken && (
          <div className="text-xs text-amber-500 bg-amber-500/10 px-2 py-1.5 rounded border border-amber-500/20">
            GitHub token not configured. Some features may not work.
          </div>
        )}
      </div>

      {/* Claws list */}
      <div className="flex-1 overflow-y-auto px-2 scrollbar-thin scrollbar-thumb-muted-foreground/20 scrollbar-track-transparent">
        {error ? (
          <div className="flex flex-col items-center justify-center h-32 gap-3">
            <XCircle className="h-8 w-8 text-red-500" />
            <span className="text-sm text-red-500">Failed to load claws</span>
            <Button variant="outline" size="sm" onClick={() => utils.claws.getAll.invalidate()}>
              <RefreshCw className="h-3.5 w-3.5 mr-1" />
              Retry
            </Button>
          </div>
        ) : isLoading ? (
          <div className="flex items-center justify-center h-20">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : claws.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 gap-3">
            <Zap className="h-8 w-8 text-muted-foreground/50" />
            <span className="text-sm text-muted-foreground">
              {searchQuery ? "No claws found" : "No claws configured"}
            </span>
            <Button variant="outline" size="sm" onClick={() => setCreateModalOpen(true)}>
              <Plus className="h-3.5 w-3.5 mr-1" />
              Create Claw
            </Button>
          </div>
        ) : (
          <div className="space-y-1">
            {claws.map((claw) => (
              <div
                key={claw.id}
                className={cn(
                  "group flex flex-col gap-1 p-2 rounded-md hover:bg-foreground/5 cursor-pointer border border-transparent hover:border-border/50",
                  selectedClaw?.id === claw.id && "bg-foreground/5 border-border/50"
                )}
              >
                {/* Row 1: Name and status */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <Zap
                      className={cn(
                        "h-3.5 w-3.5 flex-shrink-0",
                        claw.isEnabled ? "text-green-500" : "text-muted-foreground"
                      )}
                    />
                    <span className="text-sm font-medium truncate">{claw.name}</span>
                  </div>
                  <Switch
                    checked={claw.isEnabled}
                    onCheckedChange={(checked) =>
                      toggleMutation.mutate({ id: claw.id, isEnabled: checked })
                    }
                    className="h-4 w-7"
                  />
                </div>

                {/* Purpose */}
                {claw.purpose && (
                  <div className="text-xs text-muted-foreground/80 truncate pl-5.5">
                    {claw.purpose}
                  </div>
                )}

                {/* Row 2: Trigger info */}
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground pl-5.5">
                  {claw.triggerType === "cron" && <Clock className="h-3 w-3" />}
                  {claw.triggerType === "github_poll" && <Settings className="h-3 w-3" />}
                  {claw.triggerType === "manual" && <Play className="h-3 w-3" />}
                  <span className="truncate">{getTriggerLabel(claw)}</span>
                </div>

                {/* Row 3: Worktree path */}
                <div className="text-xs text-muted-foreground/70 truncate pl-5.5">
                  {claw.targetWorktree}
                </div>

                {/* Row 4: Actions */}
                <div className="flex items-center gap-1 pl-5.5 mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleTrigger(claw.id)
                    }}
                    disabled={triggerMutation.isPending && clawToTrigger === claw.id}
                    title="Run now"
                  >
                    {triggerMutation.isPending && clawToTrigger === claw.id ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Play className="h-3 w-3" />
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={(e) => {
                      e.stopPropagation()
                      setSelectedClaw({ id: claw.id, name: claw.name, triggerType: claw.triggerType })
                      setIsEditingClaw(true)
                    }}
                    title="Edit"
                  >
                    <Edit className="h-3 w-3" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={(e) => {
                      e.stopPropagation()
                      setSelectedClaw(selectedClaw?.id === claw.id ? null : { id: claw.id, name: claw.name, triggerType: claw.triggerType })
                      setIsEditingClaw(false)
                    }}
                    title="View history"
                  >
                    <History className="h-3 w-3" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-destructive hover:text-destructive"
                    onClick={(e) => {
                      e.stopPropagation()
                      setClawToDelete(claw.id)
                    }}
                    title="Delete"
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create Claw Modal */}
      <CreateClawModal open={createModalOpen} onOpenChange={setCreateModalOpen} />

      {/* Delete Confirmation */}
      <AlertDialog open={!!clawToDelete} onOpenChange={() => setClawToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Claw</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this claw? This action cannot be undone and all
              execution history will be lost.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
