// Copyright 2026 Claw Contributors
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

"use client"

import { useState } from "react"
import { useAtom, useAtomValue } from "jotai"
import { ArrowLeft, Zap, Play, Power, PowerOff, FolderOpen, Clock, Github, MessageSquare } from "lucide-react"
import { cn } from "../../../lib/utils"
import { Button } from "../../../components/ui/button"
import { Input } from "../../../components/ui/input"
import { Textarea } from "../../../components/ui/textarea"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../../components/ui/tabs"
import { Switch } from "../../../components/ui/switch"
import { Label } from "../../../components/ui/label"
import { trpc } from "../../../lib/trpc"
import {
  selectedClawIdAtom,
  selectedClawDetailIdAtom,
  clawDetailActiveTabAtom,
} from "../../claws/atoms"
import { toast } from "sonner"

interface ClawDetailPageProps {
  className?: string
}

export function ClawDetailPage({ className }: ClawDetailPageProps) {
  const [selectedClawId, setSelectedClawId] = useAtom(selectedClawIdAtom)
  const [selectedClawDetailId, setSelectedClawDetailId] = useAtom(selectedClawDetailIdAtom)
  const [activeTab, setActiveTab] = useAtom(clawDetailActiveTabAtom)

  // Get claw settings
  const { data: settingsData, isLoading } = trpc.claws.getSettings.useQuery(
    { clawId: selectedClawId! },
    { enabled: !!selectedClawId }
  )

  const utils = trpc.useUtils()

  // Update settings mutation
  const updateSettingsMutation = trpc.claws.updateSettings.useMutation({
    onSuccess: () => {
      utils.claws.getSettings.invalidate()
      utils.claws.getAll.invalidate()
      toast.success("Settings updated")
    },
    onError: (error) => {
      toast.error("Failed to update settings")
      console.error(error)
    },
  })

  // Toggle enabled mutation
  const toggleMutation = trpc.claws.toggleEnabled.useMutation({
    onSuccess: () => {
      utils.claws.getSettings.invalidate()
      utils.claws.getAll.invalidate()
    },
  })

  // Trigger claw mutation
  const triggerMutation = trpc.claws.trigger.useMutation({
    onSuccess: () => {
      toast.success("Claw triggered")
      utils.claws.getSettings.invalidate()
    },
    onError: (error) => {
      toast.error("Failed to trigger claw")
      console.error(error)
    },
  })

  // Handle back
  const handleBack = () => {
    setSelectedClawDetailId(null)
  }

  // Handle save
  const handleSave = () => {
    if (!settingsData?.settings) return
    updateSettingsMutation.mutate({
      clawId: settingsData.settings.id,
      name: settingsData.settings.name,
      purpose: settingsData.settings.purpose,
      instruction: settingsData.settings.instruction,
      clawsSoul: settingsData.settings.clawsSoul,
      soulInstruction: settingsData.settings.soulInstruction,
      targetWorktree: settingsData.settings.targetWorktree,
      triggerType: settingsData.settings.triggerType,
      triggerConfig: settingsData.settings.triggerConfig,
      allowedDirectories: settingsData.settings.allowedDirectories,
      allowedMcpServers: settingsData.settings.allowedMcpServers,
      sandboxMode: settingsData.settings.sandboxMode,
    })
  }

  // Handle run now
  const handleRunNow = () => {
    if (!selectedClawId) return
    triggerMutation.mutate({ id: selectedClawId })
  }

  // Handle toggle enabled
  const handleToggleEnabled = () => {
    if (!settingsData?.settings) return
    toggleMutation.mutate({
      id: settingsData.settings.id,
      isEnabled: !settingsData.settings.isEnabled,
    })
  }

  // Get trigger icon
  const getTriggerIcon = () => {
    if (!settingsData?.settings) return null
    switch (settingsData.settings.triggerType) {
      case "cron":
        return <Clock className="h-4 w-4" />
      case "github_poll":
        return <Github className="h-4 w-4" />
      case "manual":
        return <Play className="h-4 w-4" />
      case "slack_mention":
      case "whatsapp_message":
        return <MessageSquare className="h-4 w-4" />
      default:
        return <Zap className="h-4 w-4" />
    }
  }

  if (isLoading || !settingsData?.settings) {
    return (
      <div className={cn("flex flex-col items-center justify-center h-full", className)}>
        <p className="text-muted-foreground">Loading...</p>
      </div>
    )
  }

  const settings = settingsData.settings

  return (
    <div className={cn("flex flex-col h-full w-full", className)}>
      {/* Header */}
      <div className="flex-shrink-0 border-b px-4 py-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={handleBack}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-2 flex-1 min-w-0">
            {getTriggerIcon()}
            <h1 className="text-lg font-semibold truncate">{settings.name}</h1>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleRunNow}
              disabled={triggerMutation.isPending}
            >
              <Play className="h-3.5 w-3.5 mr-2" />
              Run Now
            </Button>
            <Button
              variant={settings.isEnabled ? "default" : "outline"}
              size="sm"
              onClick={handleToggleEnabled}
              disabled={toggleMutation.isPending}
            >
              {settings.isEnabled ? (
                <Power className="h-3.5 w-3.5 mr-2" />
              ) : (
                <PowerOff className="h-3.5 w-3.5 mr-2" />
              )}
              {settings.isEnabled ? "Enabled" : "Disabled"}
            </Button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex-shrink-0 border-b px-4">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList>
            <TabsTrigger value="general">General</TabsTrigger>
            <TabsTrigger value="trigger">Trigger</TabsTrigger>
            <TabsTrigger value="history">History</TabsTrigger>
            <TabsTrigger value="files">Files</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto p-4">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsContent value="general" className="mt-0">
            <div className="max-w-3xl space-y-6">
              <div className="space-y-2">
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  value={settings.name}
                  onChange={(e) => {
                    settingsData.settings.name = e.target.value
                  }}
                  placeholder="Claw name"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="purpose">Purpose</Label>
                <Input
                  id="purpose"
                  value={settings.purpose || ""}
                  onChange={(e) => {
                    settingsData.settings.purpose = e.target.value
                  }}
                  placeholder="Short description of what this claw does"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="instruction">Instruction</Label>
                <Textarea
                  id="instruction"
                  value={settings.instruction}
                  onChange={(e) => {
                    settingsData.settings.instruction = e.target.value
                  }}
                  placeholder="The prompt/task passed to Claude"
                  rows={5}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="clawsSoul">Claws-Soul (System Prompt)</Label>
                <Textarea
                  id="clawsSoul"
                  value={settings.clawsSoul || ""}
                  onChange={(e) => {
                    settingsData.settings.clawsSoul = e.target.value
                  }}
                  placeholder="System prompt injected via SDK as system message"
                  rows={4}
                />
                <p className="text-xs text-muted-foreground">
                  This system prompt is injected into each SDK session at startup.
                  It defines the behavioral identity for this claw.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="soulInstruction">Soul Instruction</Label>
                <Textarea
                  id="soulInstruction"
                  value={settings.soulInstruction || ""}
                  onChange={(e) => {
                    settingsData.settings.soulInstruction = e.target.value
                  }}
                  placeholder="Persistent behavioral identity injected before instruction"
                  rows={4}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="worktree">Target Worktree</Label>
                <div className="flex gap-2">
                  <Input
                    id="worktree"
                    value={settings.targetWorktree}
                    onChange={(e) => {
                      settingsData.settings.targetWorktree = e.target.value
                    }}
                    placeholder="/path/to/worktree"
                    className="flex-1"
                  />
                  <Button variant="outline" size="icon">
                    <FolderOpen className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="sandboxMode">Sandbox Mode</Label>
                <select
                  id="sandboxMode"
                  value={settings.sandboxMode}
                  onChange={(e) => {
                    settingsData.settings.sandboxMode = e.target.value as "disabled" | "enabled" | "strict"
                  }}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="disabled">Disabled</option>
                  <option value="enabled">Enabled</option>
                  <option value="strict">Strict</option>
                </select>
              </div>

              <div className="flex gap-2 pt-4">
                <Button onClick={handleSave} disabled={updateSettingsMutation.isPending}>
                  {updateSettingsMutation.isPending ? "Saving..." : "Save Changes"}
                </Button>
                <Button variant="outline" onClick={handleBack}>
                  Cancel
                </Button>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="trigger" className="mt-0">
            <div className="max-w-3xl space-y-6">
              <div className="space-y-2">
                <Label>Trigger Type</Label>
                <div className="flex gap-2 flex-wrap">
                  {["cron", "github_poll", "manual", "slack_mention", "whatsapp_message"].map((type) => (
                    <Button
                      key={type}
                      variant={settings.triggerType === type ? "default" : "outline"}
                      size="sm"
                      onClick={() => {
                        settingsData.settings.triggerType = type as typeof settings.triggerType
                      }}
                    >
                      {type.replace("_", " ")}
                    </Button>
                  ))}
                </div>
              </div>

              {/* Trigger config based on type */}
              {settings.triggerType === "cron" && (
                <div className="space-y-2">
                  <Label htmlFor="cronExpression">Cron Expression</Label>
                  <Input
                    id="cronExpression"
                    value={(settings.triggerConfig as any).expression || ""}
                    onChange={(e) => {
                      (settings.triggerConfig as any).expression = e.target.value
                    }}
                    placeholder="0 9 * * 1-5"
                  />
                  <p className="text-xs text-muted-foreground">
                    Standard cron format: minute hour day month weekday
                  </p>
                </div>
              )}

              {settings.triggerType === "github_poll" && (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="owner">Owner</Label>
                    <Input
                      id="owner"
                      value={(settings.triggerConfig as any).owner || ""}
                      onChange={(e) => {
                        (settings.triggerConfig as any).owner = e.target.value
                      }}
                      placeholder="github-owner"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="repo">Repo</Label>
                    <Input
                      id="repo"
                      value={(settings.triggerConfig as any).repo || ""}
                      onChange={(e) => {
                        (settings.triggerConfig as any).repo = e.target.value
                      }}
                      placeholder="repo-name"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="label">Label</Label>
                    <Input
                      id="label"
                      value={(settings.triggerConfig as any).label || ""}
                      onChange={(e) => {
                        (settings.triggerConfig as any).label = e.target.value
                      }}
                      placeholder="agent-ready"
                    />
                  </div>
                </div>
              )}

              {(settings.triggerType === "slack_mention" || settings.triggerType === "whatsapp_message") && (
                <div className="space-y-2">
                  <Label htmlFor="channelFilter">Channel Filter</Label>
                  <Input
                    id="channelFilter"
                    value={(settings.triggerConfig as any).slackChannelFilter || (settings.triggerConfig as any).whatsappChatFilter || ""}
                    onChange={(e) => {
                      if (settings.triggerType === "slack_mention") {
                        (settings.triggerConfig as any).slackChannelFilter = e.target.value
                      } else {
                        (settings.triggerConfig as any).whatsappChatFilter = e.target.value
                      }
                    }}
                    placeholder="Channel or chat filter"
                  />
                </div>
              )}

              {settings.triggerType === "manual" && (
                <div className="p-4 rounded-lg bg-muted text-sm text-muted-foreground">
                  Manual trigger claws are executed on demand via the "Run Now" button.
                </div>
              )}

              <div className="flex gap-2 pt-4">
                <Button onClick={handleSave} disabled={updateSettingsMutation.isPending}>
                  {updateSettingsMutation.isPending ? "Saving..." : "Save Changes"}
                </Button>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="history" className="mt-0">
            <div className="max-w-4xl">
              {/* Execution history - to be implemented */}
              <div className="text-center text-muted-foreground py-8">
                <p>Execution history view coming soon</p>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="files" className="mt-0">
            <div className="max-w-4xl">
              {/* Files view - to be implemented */}
              <div className="text-center text-muted-foreground py-8">
                <p>Living documents view coming soon</p>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
