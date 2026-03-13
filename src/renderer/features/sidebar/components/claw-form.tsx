"use client"

import React, { useState, useMemo } from "react"
import { Clock, Github, Play, FolderOpen, Loader2, AlertCircle, Slack, MessageCircle, Plus, Check, Copy } from "lucide-react"
import { cn } from "../../../lib/utils"
import { trpc } from "../../../lib/trpc"
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

export type TriggerType = "cron" | "github_poll" | "manual" | "slack_mention" | "whatsapp_message"

export interface FormData {
  name: string
  purpose: string
  instruction: string
  soulInstruction: string
  targetWorktree: string
  triggerType: TriggerType
  cronExpression: string
  githubOwner: string
  githubRepo: string
  githubLabel: string
  slackChannelFilter: string
  whatsappChatFilter: string
  allowedDirectories: string[]
  allowedMcpServers: string[]
  sandboxMode: "disabled" | "enabled" | "strict"
}

export interface ClawFormProps {
  initialData?: Partial<FormData>
  clawId?: string
  onSubmit: (data: FormData, triggerConfig: Record<string, string>) => void
  onCancel: () => void
  isSubmitting: boolean
  submitError: Error | null
  mode: "create" | "edit"
}

const defaultFormData: FormData = {
  name: "",
  purpose: "",
  instruction: "",
  soulInstruction: "",
  targetWorktree: "",
  triggerType: "manual",
  cronExpression: "0 */6 * * *",
  githubOwner: "",
  githubRepo: "",
  githubLabel: "agent-ready",
  slackChannelFilter: "",
  whatsappChatFilter: "",
  allowedDirectories: [],
  allowedMcpServers: [],
  sandboxMode: "disabled",
}

export function ClawForm({
  initialData,
  onSubmit,
  onCancel,
  isSubmitting,
  submitError,
  mode,
}: ClawFormProps) {
  const [formData, setFormData] = useState<FormData>({
    ...defaultFormData,
    ...initialData,
  })
  const [errors, setErrors] = useState<Partial<Record<keyof FormData, string>>>({})

  const utils = trpc.useUtils()
  const { data: projects } = trpc.projects.list.useQuery()

  // WhatsApp group creation state
  const [createdGroupId, setCreatedGroupId] = useState<string | null>(null)
  const [showGroupCreator, setShowGroupCreator] = useState(false)
  const [groupName, setGroupName] = useState("")
  const [copied, setCopied] = useState(false)

  const createGroupMutation = trpc.whatsapp.createGroup.useMutation({
    onSuccess: (data) => {
      if (data.success && data.groupId) {
        setCreatedGroupId(data.groupId)
        setFormData((prev) => ({
          ...prev,
          whatsappChatFilter: data.groupId,
        }))
      }
    },
  })

  const getOwnJidQuery = trpc.whatsapp.getOwnJid.useQuery(undefined, {
    enabled: formData.triggerType === "whatsapp_message",
  })

  // Slack channel picker state
  const [slackChannelMode, setSlackChannelMode] = useState<"select" | "create">("select")
  const [slackNewChannelName, setSlackNewChannelName] = useState("")
  const [slackInviteUser, setSlackInviteUser] = useState("")

  const getBotChannelsQuery = trpc.slack.listBotChannels.useQuery(undefined, {
    enabled: formData.triggerType === "slack_mention",
  })

  const createChannelMutation = trpc.slack.createDedicatedChannel.useMutation({
    onSuccess: (data) => {
      setFormData((prev) => ({ ...prev, slackChannelFilter: data.channelId }))
      getBotChannelsQuery.refetch()
    },
  })

  const createChannelInviteWarning = createChannelMutation.data?.inviteWarning

  const { data: availableMcpServers } = trpc.claws.listAvailableMcpServers.useQuery()

  // Extra directory input state
  const [newDirInput, setNewDirInput] = useState("")

  const validate = (): boolean => {
    const newErrors: Partial<Record<keyof FormData, string>> = {}

    if (!formData.name.trim()) {
      newErrors.name = "Name is required"
    }

    if (!formData.purpose.trim()) {
      newErrors.purpose = "Purpose is required"
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

    if (formData.triggerType === "slack_mention") {
      if (!formData.slackChannelFilter.trim()) {
        newErrors.slackChannelFilter = "A Slack channel is required"
      }
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  // Reset group creator when trigger type changes away from WhatsApp
  if (formData.triggerType !== "whatsapp_message" && showGroupCreator) {
    setShowGroupCreator(false)
    setCreatedGroupId(null)
    setGroupName("")
    createGroupMutation.reset()
  }

  const handleSubmit = () => {
    if (!validate()) return

    const triggerConfig: Record<string, string> =
      formData.triggerType === "cron"
        ? { expression: formData.cronExpression }
        : formData.triggerType === "github_poll"
          ? {
              owner: formData.githubOwner,
              repo: formData.githubRepo,
              label: formData.githubLabel,
            }
          : formData.triggerType === "slack_mention"
            ? { slackChannelFilter: formData.slackChannelFilter }
            : formData.triggerType === "whatsapp_message"
              ? { whatsappChatFilter: formData.whatsappChatFilter ?? "" }
              : {}

    onSubmit(formData, triggerConfig)
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

  // Fetch WhatsApp groups for the selector
  const getGroupsQuery = trpc.whatsapp.getGroups.useQuery(undefined, {
    enabled: showWhatsAppConfig,
  })

  // Find the currently selected group from the fetched list
  const selectedGroup = useMemo(() => {
    if (!formData.whatsappChatFilter || !getGroupsQuery.data?.groups) return null
    return getGroupsQuery.data.groups.find((g) => g.id === formData.whatsappChatFilter)
  }, [formData.whatsappChatFilter, getGroupsQuery.data?.groups])

  return (
    <div className="space-y-4">
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

      {/* Purpose */}
      <div className="space-y-2">
        <Label htmlFor="purpose">Purpose <span className="text-destructive">*</span></Label>
        <Input
          id="purpose"
          placeholder="e.g., Review pull requests and suggest improvements"
          value={formData.purpose}
          onChange={(e) => setFormData((prev) => ({ ...prev, purpose: e.target.value }))}
          className={cn(errors.purpose && "border-destructive")}
        />
        {errors.purpose && <p className="text-xs text-destructive">{errors.purpose}</p>}
        <p className="text-xs text-muted-foreground">
          A short description of what this claw does (displayed in list view)
        </p>
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
        <Label htmlFor="instruction">Task Instruction</Label>
        <Textarea
          id="instruction"
          placeholder="Enter the specific task instructions for Claude to execute..."
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
        <p className="text-xs text-muted-foreground">
          The specific task this claw will execute (e.g., "Review the code in src/ and fix any TypeScript errors")
        </p>
      </div>

      {/* Soul Instruction */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="soul-instruction">Soul Instruction</Label>
          {formData.soulInstruction && formData.soulInstruction.length > 0 && (
            <span className="text-xs text-green-600 flex items-center gap-1">
              <Check className="h-3 w-3" />
              Applied from default template
            </span>
          )}
        </div>
        <Textarea
          id="soul-instruction"
          placeholder="Define the agent's persistent behavioral identity..."
          value={formData.soulInstruction}
          onChange={(e) =>
            setFormData((prev) => ({ ...prev, soulInstruction: e.target.value }))
          }
          className={cn(
            "min-h-[150px] resize-none font-mono text-xs",
            errors.soulInstruction && "border-destructive"
          )}
        />
        <p className="text-xs text-muted-foreground">
          Persistent behavioral guidelines injected before every task. Defines how the agent thinks and acts.
        </p>
        <div className="flex gap-2">
          {!formData.soulInstruction || formData.soulInstruction.length === 0 ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setFormData((prev) => ({
                  ...prev,
                  soulInstruction: `You are an autonomous automation agent operating in a fire-and-forget environment.

## Core Operating Principles

### 1. Safety First - Reversibility & Blast Radius
Before ANY operation, assess:
- Reversibility: Can this be undone easily? If not, proceed with extreme caution
- Blast Radius: How many systems/users could be affected?
- Destructive Operations: NEVER delete, remove, or downgrade without explicit requirement
- External Impact: When connected to WhatsApp/Slack, remember your responses affect real users

### 2. Act Decisively When Safe, Ask When Uncertain
- Safe operations: Create files, add features, read/analyze, refactor non-critical code → Act directly
- Uncertain operations: Modifying auth, changing APIs, touching production configs → Ask first
- Destructive operations: Deleting code, removing dependencies → Require explicit justification

### 3. No Over-Engineering
- Implement exactly what's requested - no speculative features
- Three similar lines of code is better than premature abstraction
- Don't add error handling for scenarios that can't happen
- Trust internal code and framework guarantees

### 4. Worktree Isolation Awareness
You operate in an isolated Git worktree at: {{targetWorktree}}
- Your changes are sandboxed to this directory
- Respect the worktree boundaries

### 5. Tool Usage Discipline
- Use dedicated tools (Read, Edit, Glob, Grep) over bash for file operations
- Reserve bash exclusively for system commands
- Never guess or generate URLs unless confident they help with programming

### 6. Completion Standards
- Verify your work compiles/runs before considering complete
- Run tests if available; fix failures before finishing
- End with clear status: what was done, what remains, any warnings`,
                }))
              }}
            >
              Load Default Soul Template
            </Button>
          ) : (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                if (confirm("This will replace the current soul instruction with the default template. Continue?")) {
                  setFormData((prev) => ({
                    ...prev,
                    soulInstruction: `You are an autonomous automation agent operating in a fire-and-forget environment.

## Core Operating Principles

### 1. Safety First - Reversibility & Blast Radius
Before ANY operation, assess:
- Reversibility: Can this be undone easily? If not, proceed with extreme caution
- Blast Radius: How many systems/users could be affected?
- Destructive Operations: NEVER delete, remove, or downgrade without explicit requirement
- External Impact: When connected to WhatsApp/Slack, remember your responses affect real users

### 2. Act Decisively When Safe, Ask When Uncertain
- Safe operations: Create files, add features, read/analyze, refactor non-critical code → Act directly
- Uncertain operations: Modifying auth, changing APIs, touching production configs → Ask first
- Destructive operations: Deleting code, removing dependencies → Require explicit justification

### 3. No Over-Engineering
- Implement exactly what's requested - no speculative features
- Three similar lines of code is better than premature abstraction
- Don't add error handling for scenarios that can't happen
- Trust internal code and framework guarantees

### 4. Worktree Isolation Awareness
You operate in an isolated Git worktree at: {{targetWorktree}}
- Your changes are sandboxed to this directory
- Respect the worktree boundaries

### 5. Tool Usage Discipline
- Use dedicated tools (Read, Edit, Glob, Grep) over bash for file operations
- Reserve bash exclusively for system commands
- Never guess or generate URLs unless confident they help with programming

### 6. Completion Standards
- Verify your work compiles/runs before considering complete
- Run tests if available; fix failures before finishing
- End with clear status: what was done, what remains, any warnings`,
                  }))
                }
              }}
            >
              Reset to Default Template
            </Button>
          )}
          {formData.soulInstruction && formData.soulInstruction.length > 0 && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                if (confirm("Clear the soul instruction? This will remove all behavioral guidelines.")) {
                  setFormData((prev) => ({ ...prev, soulInstruction: "" }))
                }
              }}
            >
              Clear
            </Button>
          )}
        </div>
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
            Format: minute hour day month weekday (e.g., &quot;0 9 * * 1-5&quot; for 9am weekdays)
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
          <div className="space-y-1">
            <Label>Slack Channel <span className="text-destructive">*</span></Label>
            <p className="text-xs text-muted-foreground">Select an existing channel or create a new one.</p>
          </div>

          {slackChannelMode === "select" ? (
            <div className="space-y-2">
              <Select
                value={formData.slackChannelFilter || "__none__"}
                onValueChange={(v) => {
                  if (v === "__create__") {
                    setSlackChannelMode("create")
                    setSlackNewChannelName("")
                    createChannelMutation.reset()
                  } else if (v !== "__none__") {
                    setFormData((prev) => ({ ...prev, slackChannelFilter: v }))
                  }
                }}
              >
                <SelectTrigger className={cn(errors.slackChannelFilter && "border-destructive")}>
                  <SelectValue placeholder={getBotChannelsQuery.isLoading ? "Loading channels..." : "Select a channel..."} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__create__">
                    <span className="flex items-center gap-1.5 text-primary">
                      <Plus className="h-3.5 w-3.5" />
                      Create new channel
                    </span>
                  </SelectItem>
                  {getBotChannelsQuery.isLoading && (
                    <SelectItem value="__loading__" disabled>Loading...</SelectItem>
                  )}
                  {!getBotChannelsQuery.isLoading && getBotChannelsQuery.data?.length === 0 && (
                    <SelectItem value="__empty__" disabled>
                      Bot isn&apos;t in any channels yet — use &quot;Create new channel&quot;
                    </SelectItem>
                  )}
                  {getBotChannelsQuery.data?.map((ch) => (
                    <SelectItem key={ch.id} value={ch.id}>
                      #{ch.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {formData.slackChannelFilter && (
                <p className="text-xs text-muted-foreground">
                  Channel ID: <code>{formData.slackChannelFilter}</code>
                </p>
              )}
              {errors.slackChannelFilter && (
                <p className="text-xs text-destructive">{errors.slackChannelFilter}</p>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              <Input
                placeholder="Channel name (e.g., claw-commands)"
                value={slackNewChannelName}
                onChange={(e) => setSlackNewChannelName(e.target.value)}
                disabled={createChannelMutation.isPending || !!createChannelMutation.data}
              />
              <Input
                placeholder="Add user (Slack user ID or email)"
                value={slackInviteUser}
                onChange={(e) => setSlackInviteUser(e.target.value)}
                disabled={createChannelMutation.isPending || !!createChannelMutation.data}
              />
              <div className="flex gap-2">
                <div className="flex-1" />
                {!createChannelMutation.data ? (
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => {
                      if (slackNewChannelName.trim()) {
                        createChannelMutation.mutate({
                          channelName: slackNewChannelName.trim(),
                          inviteUserIdOrEmail: slackInviteUser.trim() || undefined,
                        })
                      }
                    }}
                    disabled={createChannelMutation.isPending || !slackNewChannelName.trim()}
                  >
                    {createChannelMutation.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                    Create
                  </Button>
                ) : (
                  <Button type="button" variant="outline" size="sm" onClick={() => {
                    setSlackChannelMode("select")
                    setSlackNewChannelName("")
                    createChannelMutation.reset()
                  }}>
                    <Check className="h-4 w-4 mr-1" />
                    Done
                  </Button>
                )}
              </div>

              {createChannelMutation.data && (
                <Alert className="bg-green-500/10 text-green-600 border-green-500/20 text-xs">
                  <Check className="h-4 w-4" />
                  <AlertDescription>
                    #{createChannelMutation.data.channelName} created (private)
                    {createChannelMutation.data.alreadyExisted ? " — already existed, bot joined" : ""}
                    {createChannelMutation.data.invitedUserId ? ` — ${slackInviteUser} added` : ""}
                  </AlertDescription>
                </Alert>
              )}
              {createChannelInviteWarning && (
                <Alert className="text-xs">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{createChannelInviteWarning}</AlertDescription>
                </Alert>
              )}

              {createChannelMutation.error && (
                <Alert variant="destructive" className="text-xs">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{createChannelMutation.error.message}</AlertDescription>
                </Alert>
              )}

              {!createChannelMutation.data && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => { setSlackChannelMode("select"); setSlackNewChannelName("") }}
                >
                  Cancel
                </Button>
              )}
            </div>
          )}
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
              Leave empty to respond to no chats. Select a specific group from the dropdown, or type: &quot;group&quot; for all groups, &quot;individual&quot; for DMs only, or a phone number.
            </p>
          </div>

          {/* Group Selector Dropdown */}
          {getGroupsQuery.data?.success && getGroupsQuery.data.groups && getGroupsQuery.data.groups.length > 0 && (
            <div className="space-y-2 pt-2 border-t border-border/50">
              <Label htmlFor="whatsapp-group-select">Or Select a Group</Label>
              <Select
                value={selectedGroup?.id || formData.whatsappChatFilter || "__empty__"}
                onValueChange={(value) => {
                  if (value === "__empty__") {
                    setFormData((prev) => ({ ...prev, whatsappChatFilter: "" }))
                  } else {
                    setFormData((prev) => ({ ...prev, whatsappChatFilter: value }))
                  }
                }}
              >
                <SelectTrigger id="whatsapp-group-select">
                  <SelectValue placeholder="Select a group..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__empty__">Select a group...</SelectItem>
                  {/* Show unknown group if saved group not in list */}
                  {formData.whatsappChatFilter?.includes("@g.us") && !selectedGroup && (
                    <SelectItem value={formData.whatsappChatFilter}>
                      Unknown Group (ID: {formData.whatsappChatFilter.split("@")[0]?.slice(-8)}...)
                    </SelectItem>
                  )}
                  {getGroupsQuery.data.groups.map((group) => (
                    <SelectItem key={group.id} value={group.id}>
                      {group.name} ({group.participantCount} participants)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Loading State */}
          {getGroupsQuery.isLoading && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground pt-2">
              <Loader2 className="h-3 w-3 animate-spin" />
              Loading groups...
            </div>
          )}

          {/* Error State with Retry */}
          {getGroupsQuery.error && (
            <div className="space-y-2 pt-2">
              <p className="text-xs text-destructive">
                Failed to load groups: {getGroupsQuery.error.message}
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => getGroupsQuery.refetch()}
                disabled={getGroupsQuery.isRefetching}
              >
                {getGroupsQuery.isRefetching ? (
                  <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                ) : null}
                Retry
              </Button>
            </div>
          )}

          {/* Auto-create Group Section */}
          <div className="pt-2 border-t border-border/50">
            {!showGroupCreator ? (
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setShowGroupCreator(true)
                    setGroupName(formData.name || "Claw Notifications")
                  }}
                  disabled={createGroupMutation.isPending}
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Auto-create Group
                </Button>
                {getOwnJidQuery.data?.success && getOwnJidQuery.data?.jid && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      const jid = getOwnJidQuery.data.jid
                      if (jid) {
                        // Extract phone number from JID (format: 1234567890@s.whatsapp.net)
                        const phoneNumber = jid.split("@")[0]
                        setFormData((prev) => ({
                          ...prev,
                          whatsappChatFilter: phoneNumber,
                        }))
                      }
                    }}
                  >
                    Use My Number
                  </Button>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="group-name">Group Name</Label>
                  <div className="flex gap-2">
                    <Input
                      id="group-name"
                      placeholder="e.g., Claw Notifications"
                      value={groupName}
                      onChange={(e) => setGroupName(e.target.value)}
                      disabled={createGroupMutation.isPending || !!createdGroupId}
                    />
                    {!createdGroupId ? (
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => {
                          if (groupName.trim()) {
                            createGroupMutation.mutate({
                              name: groupName.trim(),
                              description: `This group is configured for the "${formData.name || "Claw"}" automation. Messages sent here will trigger the claw.`,
                            })
                          }
                        }}
                        disabled={createGroupMutation.isPending || !groupName.trim()}
                      >
                        {createGroupMutation.isPending && (
                          <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                        )}
                        Create
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          navigator.clipboard.writeText(createdGroupId)
                          setCopied(true)
                          setTimeout(() => setCopied(false), 2000)
                        }}
                      >
                        {copied ? (
                          <>
                            <Check className="h-4 w-4 mr-1" />
                            Copied
                          </>
                        ) : (
                          <>
                            <Copy className="h-4 w-4 mr-1" />
                            Copy ID
                          </>
                        )}
                      </Button>
                    )}
                  </div>
                </div>

                {createGroupMutation.error && (
                  <Alert variant="destructive" className="text-xs">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                      {createGroupMutation.error.message || "Failed to create group"}
                    </AlertDescription>
                  </Alert>
                )}

                {createdGroupId && (
                  <>
                    <Alert className="bg-green-500/10 text-green-600 border-green-500/20 text-xs">
                      <Check className="h-4 w-4" />
                      <AlertDescription>
                        Group created successfully! The group ID has been set as the chat filter.
                      </AlertDescription>
                    </Alert>
                    {createGroupMutation.data?.inviteUrl && (
                      <p className="text-xs text-muted-foreground">
                        <strong>Invite Link:</strong>{" "}
                        <a
                          href={createGroupMutation.data.inviteUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="underline"
                        >
                          {createGroupMutation.data.inviteUrl}
                        </a>
                      </p>
                    )}
                  </>
                )}

                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setShowGroupCreator(false)
                    setCreatedGroupId(null)
                    setGroupName("")
                    createGroupMutation.reset()
                  }}
                >
                  {createdGroupId ? "Done" : "Cancel"}
                </Button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Allowed Directories */}
      <div className="space-y-2">
        <Label>Allowed Directories</Label>
        <p className="text-xs text-muted-foreground">
          The target worktree is always included. Add extra directories the agent may read/write.
        </p>
        <div className="space-y-1">
          {/* Non-removable: targetWorktree */}
          {formData.targetWorktree && (
            <div className="flex items-center gap-2 px-2 py-1 bg-muted/40 rounded text-xs text-muted-foreground">
              <FolderOpen className="h-3 w-3 flex-shrink-0" />
              <span className="truncate flex-1">{formData.targetWorktree}</span>
              <span className="text-xs text-muted-foreground/60 flex-shrink-0">(required)</span>
            </div>
          )}
          {/* User-added dirs */}
          {formData.allowedDirectories.map((dir, i) => (
            <div key={i} className="flex items-center gap-2 px-2 py-1 bg-muted/40 rounded text-xs">
              <FolderOpen className="h-3 w-3 flex-shrink-0 text-muted-foreground" />
              <span className="truncate flex-1">{dir}</span>
              <button
                type="button"
                className="text-muted-foreground hover:text-destructive flex-shrink-0"
                onClick={() => setFormData((prev) => ({
                  ...prev,
                  allowedDirectories: prev.allowedDirectories.filter((_, idx) => idx !== i),
                }))}
              >
                ×
              </button>
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <Input
            placeholder="/path/to/extra/dir"
            value={newDirInput}
            onChange={(e) => setNewDirInput(e.target.value)}
            className="text-sm"
            onKeyDown={(e) => {
              if (e.key === "Enter" && newDirInput.trim()) {
                e.preventDefault()
                setFormData((prev) => ({
                  ...prev,
                  allowedDirectories: [...prev.allowedDirectories, newDirInput.trim()],
                }))
                setNewDirInput("")
              }
            }}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              if (newDirInput.trim()) {
                setFormData((prev) => ({
                  ...prev,
                  allowedDirectories: [...prev.allowedDirectories, newDirInput.trim()],
                }))
                setNewDirInput("")
              }
            }}
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Allowed MCP Servers */}
      {availableMcpServers && availableMcpServers.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Allowed MCP Servers</Label>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-xs h-6 px-2"
              onClick={() => setFormData((prev) => ({
                ...prev,
                allowedMcpServers: availableMcpServers.map(s => s.id),
              }))}
            >
              Select all
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            No selection = no MCPs available to this claw.
          </p>
          <div className="space-y-1 max-h-32 overflow-y-auto">
            {availableMcpServers.map((server) => (
              <label key={server.id} className="flex items-center gap-2 px-2 py-1 rounded hover:bg-muted/40 cursor-pointer text-sm">
                <input
                  type="checkbox"
                  checked={formData.allowedMcpServers.includes(server.id)}
                  onChange={(e) => {
                    setFormData((prev) => ({
                      ...prev,
                      allowedMcpServers: e.target.checked
                        ? [...prev.allowedMcpServers, server.id]
                        : prev.allowedMcpServers.filter(id => id !== server.id),
                    }))
                  }}
                  className="rounded"
                />
                <span className="flex-1 truncate">{server.name}</span>
                <span className="text-xs text-muted-foreground flex-shrink-0">{server.toolCount} tools</span>
              </label>
            ))}
          </div>
        </div>
      )}

      {/* Sandbox Mode */}
      <div className="space-y-2">
        <Label htmlFor="sandbox-mode">Sandbox Mode</Label>
        <Select
          value={formData.sandboxMode}
          onValueChange={(v: "disabled" | "enabled" | "strict") =>
            setFormData((prev) => ({ ...prev, sandboxMode: v }))
          }
        >
          <SelectTrigger id="sandbox-mode">
            <SelectValue placeholder="Select sandbox mode..." />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="disabled">
              <span className="flex items-center gap-2">
                <span>Disabled</span>
                <span className="text-xs text-muted-foreground">— Full access (default)</span>
              </span>
            </SelectItem>
            <SelectItem value="enabled">
              <span className="flex items-center gap-2">
                <span>Enabled</span>
                <span className="text-xs text-muted-foreground">— SDK sandbox restrictions</span>
              </span>
            </SelectItem>
            <SelectItem value="strict">
              <span className="flex items-center gap-2">
                <span>Strict</span>
                <span className="text-xs text-muted-foreground">— Read-only (plan mode)</span>
              </span>
            </SelectItem>
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          Controls tool permissions for this claw:
          <br />
          • <strong>Disabled</strong>: All tools allowed (Edit, Write, Bash, etc.)
          <br />
          • <strong>Enabled</strong>: Dangerous tools require explicit approval
          <br />
          • <strong>Strict</strong>: Read-only mode (no file modifications)
        </p>
      </div>

      {/* Error Alert */}
      {submitError && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            {submitError.message || `Failed to ${mode} claw`}
          </AlertDescription>
        </Alert>
      )}

      {/* Footer */}
      <div className="flex justify-end gap-2 pt-4 border-t">
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          onClick={handleSubmit}
          disabled={isSubmitting}
        >
          {isSubmitting && (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          )}
          {mode === "edit" ? "Save Changes" : "Create Claw"}
        </Button>
      </div>
    </div>
  )
}

/**
 * Basic cron expression validation
 */
function isValidCronExpression(expression: string): boolean {
  const parts = expression.trim().split(/\s+/)
  if (parts.length !== 5) return false

  const patterns = [
    /^[\*0-5]?\d([-\/][\*0-5]?\d)?$/, // minute (0-59)
    /^[\*0-2]?\d([-\/][\*0-2]?\d)?$/, // hour (0-23)
    /^[\*0-3]?\d([-\/][\*0-3]?\d)?$/, // day (1-31)
    /^[\*0-1]?\d([-\/][\*0-1]?\d)?$/, // month (1-12)
    /^[\*0-6]([-\/][0-6])?$/, // weekday (0-6)
  ]

  return parts.every((part, i) => patterns[i].test(part))
}
