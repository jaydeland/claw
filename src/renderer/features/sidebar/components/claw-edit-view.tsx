"use client"

import React from "react"
import { ArrowLeft, Loader2 } from "lucide-react"
import { useAtom } from "jotai"
import { cn } from "../../../lib/utils"
import { trpc } from "../../../lib/trpc"
import { selectedClawAtom, isEditingClawAtom } from "../../../lib/atoms"
import { Button } from "../../../components/ui/button"
import { ScrollArea } from "../../../components/ui/scroll-area"
import { ClawForm, FormData } from "./claw-form"

export interface ClawEditViewProps {
  className?: string
}

type TriggerType = "cron" | "github_poll" | "manual" | "slack_mention" | "whatsapp_message"

export function ClawEditView({ className }: ClawEditViewProps) {
  const [selectedClaw, setSelectedClaw] = useAtom(selectedClawAtom)
  const [isEditing, setIsEditing] = useAtom(isEditingClawAtom)
  const utils = trpc.useUtils()

  // Fetch full claw data for editing
  const { data: clawData, isLoading } = trpc.claws.getById.useQuery(
    { id: selectedClaw?.id || "" },
    { enabled: !!selectedClaw?.id }
  )

  const updateMutation = trpc.claws.update.useMutation({
    onSuccess: () => {
      utils.claws.getAll.invalidate()
      setIsEditing(false)
    },
  })

  const handleSubmit = (formData: FormData, triggerConfig: Record<string, string>) => {
    if (!selectedClaw) return

    updateMutation.mutate({
      id: selectedClaw.id,
      name: formData.name,
      instruction: formData.instruction,
      targetWorktree: formData.targetWorktree,
      triggerType: formData.triggerType,
      triggerConfig,
      allowedDirectories: formData.allowedDirectories,
      allowedMcpServers: formData.allowedMcpServers,
    })
  }

  const handleCancel = () => {
    setIsEditing(false)
  }

  const handleBack = () => {
    setIsEditing(false)
  }

  const initialData = React.useMemo(() => {
    if (!clawData?.claw) return undefined
    const claw = clawData.claw
    const config = claw.triggerConfig as Record<string, string> || {}
    return {
      name: claw.name,
      instruction: claw.instruction,
      targetWorktree: claw.targetWorktree,
      triggerType: claw.triggerType as TriggerType,
      cronExpression: config.expression || "0 */6 * * *",
      githubOwner: config.owner || "",
      githubRepo: config.repo || "",
      githubLabel: config.label || "agent-ready",
      slackChannelFilter: config.slackChannelFilter || "",
      whatsappChatFilter: config.whatsappChatFilter || "",
      allowedDirectories: claw.allowedDirectories ? JSON.parse(claw.allowedDirectories) : [],
      allowedMcpServers: claw.allowedMcpServers ? JSON.parse(claw.allowedMcpServers) : [],
    }
  }, [clawData])

  if (isLoading) {
    return (
      <div className={cn("h-full flex items-center justify-center", className)}>
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!clawData?.claw || !selectedClaw) {
    return (
      <div className={cn("h-full flex items-center justify-center", className)}>
        <div className="text-center text-muted-foreground">
          <p>Claw not found</p>
          <Button variant="outline" onClick={handleBack} className="mt-4">
            Go Back
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className={cn("h-full flex flex-col bg-background", className)}>
      {/* Header */}
      <div className="flex items-center gap-4 px-4 py-3 border-b border-border/50 flex-shrink-0">
        <Button
          variant="ghost"
          size="sm"
          onClick={handleBack}
          className="gap-2"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>
        <div className="flex-1">
          <h1 className="text-lg font-semibold">Edit Claw</h1>
          <p className="text-sm text-muted-foreground">{selectedClaw.name}</p>
        </div>
      </div>

      {/* Form */}
      <ScrollArea className="flex-1">
        <div className="max-w-2xl mx-auto p-6">
          <ClawForm
            initialData={initialData}
            clawId={selectedClaw.id}
            onSubmit={handleSubmit}
            onCancel={handleCancel}
            isSubmitting={updateMutation.isPending}
            submitError={updateMutation.error}
            mode="edit"
          />
        </div>
      </ScrollArea>
    </div>
  )
}
