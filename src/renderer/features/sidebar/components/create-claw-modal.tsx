"use client"

import React, { useState, useMemo } from "react"
import { Clock, Github, Play, FolderOpen, Loader2, AlertCircle, Slack, MessageCircle } from "lucide-react"
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
import { Input } from "../../../components/ui/input"
import { Label } from "../../../components/ui/label"
import { Textarea } from "../../../components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../../components/ui/select"
import { Alert, AlertDescription } from "../../../components/ui/alert"

interface CreateClawModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

type TriggerType = "cron" | "github_poll" | "manual" | "slack_mention" | "whatsapp_message"

interface FormData {
  name: string
  instruction: string
  targetWorktree: string
  triggerType: TriggerType
  // Cron config
  cronExpression: string
  // GitHub poll config
  githubOwner: string
  githubRepo: string
  githubLabel: string
  // Slack config
  slackChannelFilter: string
  // WhatsApp config
  whatsappChatFilter: string
}

const initialFormData: FormData = {
  name: "",
  instruction: "",
  targetWorktree: "",
  triggerType: "manual",
  cronExpression: "0 */6 * * *", // Every 6 hours
  githubOwner: "",
  githubRepo: "",
  githubLabel: "agent-ready",
  slackChannelFilter: "",
  whatsappChatFilter: "",
}

export function CreateClawModal({ open, onOpenChange }: CreateClawModalProps) {
  const [formData, setFormData] = useState<FormData>(initialFormData)
  const [errors, setErrors] = useState<Partial<Record<keyof FormData, string>>>({})

  const utils = trpc.useUtils()
  const { data: projects } = trpc.projects.getAll.useQuery()

  const createMutation = trpc.claws.create.useMutation({
    onSuccess: () => {
      utils.claws.getAll.invalidate()
      setFormData(initialFormData)
      setErrors({})
      onOpenChange(false)
    },
  })

  const validate = (): boolean => {
    const newErrors: Partial<Record<keyof FormData, string>> = {}

    if (!formData.name.trim()) {
      newErrors.name = "Name is required"
    }

    if (!formData.instruction.trim()) {
      newErrors.instruction = "Instruction is required"
    }

    if (!formData.targetWorktree.trim()) {
      newErrors.targetWorktree = "Target worktree is required"
    }

    if (formData.triggerType === "cron") {
      if (!formData.cronExpression.trim()) {
        newErrors.cronExpression = "Cron expression is required"
      } else if (!isValidCronExpression(formData.cronExpression)) {
        newErrors.cronExpression = "Invalid cron expression format"
      }
    }

    if (formData.triggerType === "github_poll") {
      if (!formData.githubOwner.trim()) {
        newErrors.githubOwner = "Repository owner is required"
      }
      if (!formData.githubRepo.trim()) {
        newErrors.githubRepo = "Repository name is required"
      }
      if (!formData.githubLabel.trim()) {
        newErrors.githubLabel = "Label is required"
      }
    }

    // Note: slack_mention and whatsapp_message don't require config
    // Channel/chat filters are optional

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = () => {
    if (!validate()) return

    const triggerConfig =
      formData.triggerType === "cron"
        ? { expression: formData.cronExpression }
        : formData.triggerType === "github_poll"
          ? {
              owner: formData.githubOwner,
              repo: formData.githubRepo,
              label: formData.githubLabel,
            }
          : formData.triggerType === "slack_mention"
            ? {
                slackChannelFilter: formData.slackChannelFilter || undefined,
              }
            : formData.triggerType === "whatsapp_message"
              ? {
                  whatsappChatFilter: formData.whatsappChatFilter || undefined,
                }
              : {}

    createMutation.mutate({
      name: formData.name,
      instruction: formData.instruction,
      targetWorktree: formData.targetWorktree,
      triggerType: formData.triggerType,
      triggerConfig,
    })
  }

  const handleProjectSelect = (projectId: string) => {
    const project = projects?.find((p) => p.id === projectId)
    if (project) {
      setFormData((prev) => ({
        ...prev,
        targetWorktree: project.path,
      }))
      if (project.gitOwner && project.gitRepo) {
        setFormData((prev) => ({
          ...prev,
          githubOwner: project.gitOwner || "",
          githubRepo: project.gitRepo || "",
        }))
      }
    }
  }

  const showCronConfig = formData.triggerType === "cron"
  const showGitHubConfig = formData.triggerType === "github_poll"
  const showSlackConfig = formData.triggerType === "slack_mention"
  const showWhatsAppConfig = formData.triggerType === "whatsapp_message"

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create New Claw</DialogTitle>
          <DialogDescription>Configure a headless agent to run autonomously.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Name */}
          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              placeholder="e.g., Daily Code Review"
              value={formData.name}
              onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
              className={cn(errors.name && "border-destructive")}
            />
            {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
          </div>

          {/* Project/Worktree Selection */}
          <div className="space-y-2">
            <Label htmlFor="project">Target Project</Label>
            <Select value="" onValueChange={handleProjectSelect}>
              <SelectTrigger id="project">
                <SelectValue placeholder="Select a project..." />
              </SelectTrigger>
              <SelectContent>
                {projects?.map((project) => (
                  <SelectItem key={project.id} value={project.id}>
                    {project.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Target Worktree */}
          <div className="space-y-2">
            <Label htmlFor="worktree">Target Worktree Path</Label>
            <div className="flex items-center gap-2">
              <FolderOpen className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              <Input
                id="worktree"
                placeholder="/path/to/worktree"
                value={formData.targetWorktree}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, targetWorktree: e.target.value }))
                }
                className={cn(errors.targetWorktree && "border-destructive")}
              />
            </div>
            {errors.targetWorktree && (
              <p className="text-xs text-destructive">{errors.targetWorktree}</p>
            )}
          </div>

          {/* Instruction */}
          <div className="space-y-2">
            <Label htmlFor="instruction">System Instruction</Label>
            <Textarea
              id="instruction"
              placeholder="Enter the instructions for Claude to execute..."
              value={formData.instruction}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, instruction: e.target.value }))
              }
              className={cn(
                "min-h-[100px] resize-none",
                errors.instruction && "border-destructive"
              )}
            />
            {errors.instruction && (
              <p className="text-xs text-destructive">{errors.instruction}</p>
            )}
          </div>

          {/* Trigger Type */}
          <div className="space-y-2">
            <Label>Trigger Type</Label>
            <div className="grid grid-cols-3 gap-2">
              <Button
                type="button"
                variant={formData.triggerType === "cron" ? "default" : "outline"}
                size="sm"
                onClick={() =>
                  setFormData((prev) => ({ ...prev, triggerType: "cron" }))
                }
                className="flex flex-col items-center gap-1 h-auto py-2"
              >
                <Clock className="h-4 w-4" />
                <span className="text-xs">Cron</span>
              </Button>
              <Button
                type="button"
                variant={formData.triggerType === "github_poll" ? "default" : "outline"}
                size="sm"
                onClick={() =>
                  setFormData((prev) => ({ ...prev, triggerType: "github_poll" }))
                }
                className="flex flex-col items-center gap-1 h-auto py-2"
              >
                <Github className="h-4 w-4" />
                <span className="text-xs">GitHub</span>
              </Button>
              <Button
                type="button"
                variant={formData.triggerType === "manual" ? "default" : "outline"}
                size="sm"
                onClick={() =>
                  setFormData((prev) => ({ ...prev, triggerType: "manual" }))
                }
                className="flex flex-col items-center gap-1 h-auto py-2"
              >
                <Play className="h-4 w-4" />
                <span className="text-xs">Manual</span>
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant={formData.triggerType === "slack_mention" ? "default" : "outline"}
                size="sm"
                onClick={() =>
                  setFormData((prev) => ({ ...prev, triggerType: "slack_mention" }))
                }
                className="flex flex-col items-center gap-1 h-auto py-2"
              >
                <Slack className="h-4 w-4" />
                <span className="text-xs">Slack</span>
              </Button>
              <Button
                type="button"
                variant={formData.triggerType === "whatsapp_message" ? "default" : "outline"}
                size="sm"
                onClick={() =>
                  setFormData((prev) => ({ ...prev, triggerType: "whatsapp_message" }))
                }
                className="flex flex-col items-center gap-1 h-auto py-2"
              >
                <MessageCircle className="h-4 w-4" />
                <span className="text-xs">WhatsApp</span>
              </Button>
            </div>
          </div>

          {/* Cron Configuration */}
          {showCronConfig && (
            <div className="space-y-2 p-3 bg-muted/50 rounded-md">
              <Label htmlFor="cron">Cron Expression</Label>
              <Input
                id="cron"
                placeholder="*/5 * * * *"
                value={formData.cronExpression}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, cronExpression: e.target.value }))
                }
                className={cn(errors.cronExpression && "border-destructive")}
              />
              {errors.cronExpression && (
                <p className="text-xs text-destructive">{errors.cronExpression}</p>
              )}
              <p className="text-xs text-muted-foreground">
                Format: minute hour day month weekday (e.g., "0 9 * * 1-5" for 9am weekdays)
              </p>
            </div>
          )}

          {/* GitHub Configuration */}
          {showGitHubConfig && (
            <div className="space-y-3 p-3 bg-muted/50 rounded-md">
              <div className="space-y-2">
                <Label htmlFor="gh-owner">Repository Owner</Label>
                <Input
                  id="gh-owner"
                  placeholder="e.g., myorg"
                  value={formData.githubOwner}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, githubOwner: e.target.value }))
                  }
                  className={cn(errors.githubOwner && "border-destructive")}
                />
                {errors.githubOwner && (
                  <p className="text-xs text-destructive">{errors.githubOwner}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="gh-repo">Repository Name</Label>
                <Input
                  id="gh-repo"
                  placeholder="e.g., myrepo"
                  value={formData.githubRepo}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, githubRepo: e.target.value }))
                  }
                  className={cn(errors.githubRepo && "border-destructive")}
                />
                {errors.githubRepo && (
                  <p className="text-xs text-destructive">{errors.githubRepo}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="gh-label">Label to Watch</Label>
                <Input
                  id="gh-label"
                  placeholder="e.g., agent-ready"
                  value={formData.githubLabel}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, githubLabel: e.target.value }))
                  }
                  className={cn(errors.githubLabel && "border-destructive")}
                />
                {errors.githubLabel && (
                  <p className="text-xs text-destructive">{errors.githubLabel}</p>
                )}
              </div>
            </div>
          )}

          {/* Slack Configuration */}
          {showSlackConfig && (
            <div className="space-y-3 p-3 bg-muted/50 rounded-md">
              <div className="space-y-2">
                <Label htmlFor="slack-filter">Slack Channel Filter (optional)</Label>
                <Input
                  id="slack-filter"
                  placeholder="#claw-commands or leave empty for all channels"
                  value={formData.slackChannelFilter}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, slackChannelFilter: e.target.value }))
                  }
                />
                <p className="text-xs text-muted-foreground">
                  Leave empty to respond to all channels. Use channel name (e.g., #claw-commands) or channel ID.
                </p>
              </div>
            </div>
          )}

          {/* WhatsApp Configuration */}
          {showWhatsAppConfig && (
            <div className="space-y-3 p-3 bg-muted/50 rounded-md">
              <div className="space-y-2">
                <Label htmlFor="whatsapp-filter">WhatsApp Chat Filter (optional)</Label>
                <Input
                  id="whatsapp-filter"
                  placeholder="group, individual, or phone number"
                  value={formData.whatsappChatFilter}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, whatsappChatFilter: e.target.value }))
                  }
                />
                <p className="text-xs text-muted-foreground">
                  Use &quot;group&quot; for groups only, &quot;individual&quot; for DMs only, phone number, or leave empty for all.
                </p>
              </div>
            </div>
          )}

          {/* Error Alert */}
          {createMutation.error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                {createMutation.error.message || "Failed to create claw"}
              </AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={createMutation.isPending}>
            {createMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Create Claw
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/**
 * Basic cron expression validation
 * Supports: * (any), numbers, ranges (1-5), steps (*-slash-5), lists (1,2,3)
 */
function isValidCronExpression(expression: string): boolean {
  const parts = expression.trim().split(/\s+/)
  if (parts.length !== 5) return false

  const patterns = [
    /^[\*0-5]?\d([-\/,][\*0-5]?\d)?$/, // minute (0-59)
    /^[\*0-2]?\d([-\/,][\*0-2]?\d)?$/, // hour (0-23)
    /^[\*0-3]?\d([-\/,][\*0-3]?\d)?$/, // day (1-31)
    /^[\*0-1]?\d([-\/,][\*0-1]?\d)?$/, // month (1-12)
    /^[\*0-6]([-\/][0-6])?$/, // weekday (0-6)
  ]

  return parts.every((part, i) => patterns[i].test(part))
}
