"use client"

import React, { useState, useMemo } from "react"
import { cn } from "../../../lib/utils"
import { trpc } from "../../../lib/trpc"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "../../../components/ui/dialog"
import { Button } from "../../../components/ui/button"
import { ClawForm, FormData } from "./claw-form"

interface CreateClawModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  claw?: {
    id: string
    name: string
    purpose: string
    instruction: string
    soulInstruction?: string
    targetWorktree: string
    triggerType: TriggerType
    triggerConfig: Record<string, string>
    isEnabled: boolean
    allowedDirectories?: string
    allowedMcpServers?: string
    sandboxMode?: "disabled" | "enabled" | "strict"
  } | null
}

type TriggerType = "cron" | "github_poll" | "manual" | "slack_mention" | "whatsapp_message"

export function CreateClawModal({ open, onOpenChange, claw }: CreateClawModalProps) {
  const isEditing = !!claw
  const utils = trpc.useUtils()

  const createMutation = trpc.claws.create.useMutation({
    onSuccess: () => {
      utils.claws.getAll.invalidate()
      onOpenChange(false)
    },
  })

  const updateMutation = trpc.claws.update.useMutation({
    onSuccess: () => {
      utils.claws.getAll.invalidate()
      onOpenChange(false)
    },
  })

  const handleSubmit = (formData: FormData, triggerConfig: Record<string, string>) => {
    if (isEditing && claw) {
      updateMutation.mutate({
        id: claw.id,
        name: formData.name,
        purpose: formData.purpose,
        instruction: formData.instruction,
        soulInstruction: formData.soulInstruction,
        targetWorktree: formData.targetWorktree,
        triggerType: formData.triggerType,
        triggerConfig,
        allowedDirectories: formData.allowedDirectories,
        allowedMcpServers: formData.allowedMcpServers,
        sandboxMode: formData.sandboxMode,
      })
    } else {
      createMutation.mutate({
        name: formData.name,
        purpose: formData.purpose,
        instruction: formData.instruction,
        soulInstruction: formData.soulInstruction,
        targetWorktree: formData.targetWorktree,
        triggerType: formData.triggerType,
        triggerConfig,
        allowedDirectories: formData.allowedDirectories,
        allowedMcpServers: formData.allowedMcpServers,
        sandboxMode: formData.sandboxMode,
      })
    }
  }

  const initialData = useMemo(() => {
    if (!claw) return undefined
    const config = claw.triggerConfig || {}
    return {
      name: claw.name,
      purpose: claw.purpose || "",
      instruction: claw.instruction,
      soulInstruction: claw.soulInstruction || "",
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
      sandboxMode: claw.sandboxMode || "disabled",
    }
  }, [claw])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit Claw" : "Create New Claw"}</DialogTitle>
          <DialogDescription>Configure a headless agent to run autonomously.</DialogDescription>
        </DialogHeader>

        <ClawForm
          initialData={initialData}
          onSubmit={handleSubmit}
          onCancel={() => onOpenChange(false)}
          isSubmitting={isEditing ? updateMutation.isPending : createMutation.isPending}
          submitError={(isEditing ? updateMutation.error : createMutation.error) as Error | null}
          mode={isEditing ? "edit" : "create"}
        />
      </DialogContent>
    </Dialog>
  )
}
