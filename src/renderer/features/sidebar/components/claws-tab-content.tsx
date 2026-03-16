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

import { useState, useMemo, useCallback } from "react"
import { useAtom, useAtomValue, useSetAtom } from "jotai"
import {
  Zap,
  ChevronRight,
  ChevronDown,
  Plus,
  Play,
  Settings,
  MoreHorizontal,
  Trash2,
  Power,
  PowerOff,
  Search,
  Clock,
  CheckCircle,
  XCircle,
  Loader2,
  RefreshCw,
  History,
  FolderOpen,
} from "lucide-react"
import { cn } from "../../../lib/utils"
import { trpc } from "../../../lib/trpc"
import { Button } from "../../../components/ui/button"
import { Input } from "../../../components/ui/input"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../../../components/ui/dropdown-menu"
import {
  selectedClawIdAtom,
  selectedClawDetailIdAtom,
  expandedClawIdsAtom,
  clawSearchQueryAtom,
} from "../../claws/atoms"
import { selectedSidebarTabAtom } from "../../agents/atoms"
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
  triggerType: "cron" | "github_poll" | "manual" | "slack_mention" | "whatsapp_message" | "discord_message"
  triggerConfig: { expression?: string; owner?: string; repo?: string; label?: string; slackChannelFilter?: string; whatsappChatFilter?: string; discordChannelFilter?: string }
  isEnabled: boolean
  createdAt: Date
  allowedDirectories?: string
  allowedMcpServers?: string
}

export function ClawsTabContent({ className, isMobileFullscreen }: ClawsTabContentProps) {
  const [searchQuery, setSearchQuery] = useAtom(clawSearchQueryAtom)
  const setSelectedClawId = useSetAtom(selectedClawIdAtom)
  const setSelectedClawDetailId = useSetAtom(selectedClawDetailIdAtom)
  const [expandedClawIds, setExpandedClawIds] = useAtom(expandedClawIdsAtom)
  const setSelectedSidebarTab = useSetAtom(selectedSidebarTabAtom)
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)

  // Fetch all claws with error handling
  const { data: clawsData, isLoading, error } = trpc.claws.getAll.useQuery()

  // Fetch recent executions for each claw
  const { data: executionsData } = trpc.claws.getRecentExecutions.useQuery()

  const utils = trpc.useUtils()

  // Toggle mutation
  const toggleMutation = trpc.claws.toggleEnabled.useMutation({
    onSuccess: () => utils.claws.getAll.invalidate(),
  })

  // Delete mutation
  const deleteMutation = trpc.claws.delete.useMutation({
    onSuccess: () => {
      utils.claws.getAll.invalidate()
      utils.claws.getRecentExecutions.invalidate()
    },
  })

  // Trigger mutation
  const triggerMutation = trpc.claws.trigger.useMutation({
    onSuccess: () => {
      utils.claws.getAll.invalidate()
      utils.claws.getRecentExecutions.invalidate()
    },
  })

  // Toggle expansion
  const toggleExpanded = useCallback((clawId: string) => {
    const newExpanded = new Set(expandedClawIds)
    if (newExpanded.has(clawId)) {
      newExpanded.delete(clawId)
    } else {
      newExpanded.add(clawId)
    }
    setExpandedClawIds(newExpanded)
  }, [expandedClawIds, setExpandedClawIds])

  // Handle claw click - opens detail page
  const handleClawClick = useCallback((claw: ClawWithParsedConfig, e: React.MouseEvent) => {
    e.stopPropagation()
    setSelectedClawId(claw.id)
    setSelectedClawDetailId(claw.id)
  }, [setSelectedClawId, setSelectedClawDetailId])

  // Handle settings icon click
  const handleSettingsClick = useCallback((claw: ClawWithParsedConfig, e: React.MouseEvent) => {
    e.stopPropagation()
    setSelectedClawId(claw.id)
    setSelectedClawDetailId(claw.id)
  }, [setSelectedClawId, setSelectedClawDetailId])

  // Handle run now
  const handleRunNow = useCallback((clawId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    triggerMutation.mutate({ id: clawId })
  }, [triggerMutation])

  // Handle toggle enabled
  const handleToggleEnabled = useCallback((clawId: string, isEnabled: boolean, e: React.MouseEvent) => {
    e.stopPropagation()
    toggleMutation.mutate({ id: clawId, isEnabled: !isEnabled })
  }, [toggleMutation])

  // Handle delete
  const handleDelete = useCallback((clawId: string, clawName: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (confirm(`Delete "${clawName}"? This will also delete all execution history.`)) {
      deleteMutation.mutate({ id: clawId })
    }
  }, [deleteMutation])

  // Get trigger type icon - supports all trigger types dynamically
  const getTriggerIcon = (triggerType: string) => {
    switch (triggerType) {
      case "cron":
        return <Clock className="h-3 w-3 text-muted-foreground" />
      case "github_poll":
        return <Zap className="h-3 w-3 text-blue-500" />
      case "manual":
        return <Play className="h-3 w-3 text-green-500" />
      case "slack_mention":
        return <Zap className="h-3 w-3 text-purple-500" />
      case "whatsapp_message":
        return <Zap className="h-3 w-3 text-green-600" />
      case "discord_message":
        return <Zap className="h-3 w-3 text-indigo-500" />
      default:
        return <Zap className="h-3 w-3 text-muted-foreground" />
    }
  }

  // Get status icon
  const getStatusIcon = (status: string) => {
    switch (status) {
      case "success":
        return <CheckCircle className="h-3 w-3 text-green-500" />
      case "failed":
        return <XCircle className="h-3 w-3 text-red-500" />
      case "running":
        return <Loader2 className="h-3 w-3 text-blue-500 animate-spin" />
      default:
        return null
    }
  }

  // Get trigger label - supports all trigger types dynamically
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
      case "discord_message":
        return `Discord: ${claw.triggerConfig.discordChannelFilter || "messages"}`
      default:
        return "Unknown"
    }
  }

  // Filter claws by search
  const filteredClaws = useMemo(() => {
    if (!clawsData?.claws) return []
    const claws = clawsData.claws as ClawWithParsedConfig[]
    if (!searchQuery.trim()) return claws

    const query = searchQuery.toLowerCase()
    return claws.filter(
      (c) =>
        c.name.toLowerCase().includes(query) ||
        c.purpose?.toLowerCase().includes(query) ||
        c.instruction.toLowerCase().includes(query) ||
        c.targetWorktree.toLowerCase().includes(query)
    )
  }, [clawsData, searchQuery])

  // Group claws by trigger type - dynamically handles all trigger types
  const groupedClaws = useMemo(() => {
    const groups: Record<string, ClawWithParsedConfig[]> = {
      scheduled: [],
      github: [],
      manual: [],
      messaging: [],
    }

    filteredClaws.forEach((claw) => {
      switch (claw.triggerType) {
        case "cron":
          groups.scheduled.push(claw)
          break
        case "github_poll":
          groups.github.push(claw)
          break
        case "manual":
          groups.manual.push(claw)
          break
        case "slack_mention":
        case "whatsapp_message":
        case "discord_message":
          groups.messaging.push(claw)
          break
      }
    })

    return groups
  }, [filteredClaws])

  // Get recent executions for a claw
  const getRecentExecutions = useCallback((clawId: string) => {
    if (!executionsData?.executions) return []
    return executionsData.executions.filter((e) => e.clawId === clawId).slice(0, 3)
  }, [executionsData])

  // Reusable claw card component to avoid duplication
  const renderClawCard = (claw: ClawWithParsedConfig) => {
    const isExpanded = expandedClawIds.has(claw.id)
    const recentExecutions = getRecentExecutions(claw.id)

    return (
      <div
        key={claw.id}
        className={cn(
          "rounded-lg border p-2 space-y-1",
          selectedClawIdAtom === claw.id
            ? "bg-card border-border"
            : "bg-muted/30 border-transparent",
        )}
      >
        {/* Claw header */}
        <div className="group relative">
          <button
            type="button"
            onClick={(e) => {
              toggleExpanded(claw.id)
              handleClawClick(claw, e)
            }}
            className={cn(
              "w-full flex items-center gap-2 pl-2 pr-20 py-1.5 rounded-md text-left transition-colors",
              selectedClawIdAtom === claw.id
                ? "bg-foreground/10 text-foreground"
                : "hover:bg-foreground/10 text-foreground",
            )}
            aria-expanded={isExpanded}
            aria-label={`View details for ${claw.name}`}
          >
            {isExpanded ? (
              <ChevronDown className="h-3 w-3 flex-shrink-0 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-3 w-3 flex-shrink-0 text-muted-foreground" />
            )}
            {getTriggerIcon(claw.triggerType)}
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate">
                {claw.name}
              </div>
              <div className="text-[10px] text-muted-foreground truncate">
                {claw.purpose || "No purpose"}
              </div>
            </div>
          </button>

          {/* Status indicator */}
          <div className="absolute right-20 top-1/2 -translate-y-1/2">
            {claw.isEnabled ? (
              <Power className="h-3 w-3 text-green-500" />
            ) : (
              <PowerOff className="h-3 w-3 text-muted-foreground" />
            )}
          </div>

          {/* Settings icon */}
          <button
            type="button"
            onClick={(e) => handleSettingsClick(claw, e)}
            className="absolute right-12 top-1/2 -translate-y-1/2 p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-foreground/10 text-muted-foreground hover:text-foreground transition-all"
            aria-label={`Settings for ${claw.name}`}
          >
            <Settings className="h-3.5 w-3.5" />
          </button>

          {/* Context menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="absolute right-1 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-foreground/10 text-muted-foreground hover:text-foreground transition-colors"
                onClick={(e) => e.stopPropagation()}
                aria-label={`More options for ${claw.name}`}
              >
                <MoreHorizontal className="h-3 w-3" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem
                className="text-xs"
                onClick={(e) => handleSettingsClick(claw, e)}
              >
                <Settings className="h-3.5 w-3.5 mr-2" />
                Settings
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-xs"
                onClick={(e) => handleRunNow(claw.id, e)}
              >
                <Play className="h-3.5 w-3.5 mr-2" />
                Run Now
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-xs"
                onClick={(e) => handleToggleEnabled(claw.id, claw.isEnabled, e)}
              >
                {claw.isEnabled ? (
                  <>
                    <PowerOff className="h-3.5 w-3.5 mr-2" />
                    Disable
                  </>
                ) : (
                  <>
                    <Power className="h-3.5 w-3.5 mr-2" />
                    Enable
                  </>
                )}
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-xs text-destructive"
                onClick={(e) => handleDelete(claw.id, claw.name, e)}
              >
                <Trash2 className="h-3.5 w-3.5 mr-2" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Expanded content with tab leaves and executions */}
        {isExpanded && (
          <div className="ml-[10px] pl-3 pt-1 space-y-2">
            {/* Tab leaves in tree */}
            <div className="space-y-1" role="group" aria-label="Claw sections">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  handleSettingsClick(claw, e)
                }}
                className="w-full flex items-center gap-2 pl-4 pr-2 py-1 rounded-md text-left text-xs text-muted-foreground hover:bg-foreground/10 hover:text-foreground transition-colors"
              >
                <Settings className="h-3 w-3" />
                General
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  handleSettingsClick(claw, e)
                }}
                className="w-full flex items-center gap-2 pl-4 pr-2 py-1 rounded-md text-left text-xs text-muted-foreground hover:bg-foreground/10 hover:text-foreground transition-colors"
              >
                <Clock className="h-3 w-3" />
                Trigger
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  handleSettingsClick(claw, e)
                }}
                className="w-full flex items-center gap-2 pl-4 pr-2 py-1 rounded-md text-left text-xs text-muted-foreground hover:bg-foreground/10 hover:text-foreground transition-colors"
              >
                <History className="h-3 w-3" />
                History
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  handleSettingsClick(claw, e)
                }}
                className="w-full flex items-center gap-2 pl-4 pr-2 py-1 rounded-md text-left text-xs text-muted-foreground hover:bg-foreground/10 hover:text-foreground transition-colors"
              >
                <FolderOpen className="h-3 w-3" />
                Files
              </button>
            </div>

            {/* Recent executions */}
            {recentExecutions.length > 0 && (
              <div className="space-y-0.5" role="region" aria-label={`Recent executions for ${claw.name}`}>
                <div className="text-[9px] text-muted-foreground font-medium">Recent executions:</div>
                {recentExecutions.map((execution) => (
                  <div
                    key={execution.id}
                    className="flex items-center gap-2 text-[10px] text-muted-foreground"
                  >
                    {getStatusIcon(execution.status)}
                    <span className="truncate">
                      {new Date(execution.startedAt).toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className={cn("flex flex-col h-full", className)}>
      {/* Search input */}
      <div className="px-2 pb-2 flex-shrink-0">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/50" />
          <Input
            placeholder="Search claws..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className={cn(
              "w-full rounded-lg text-sm bg-muted border border-input placeholder:text-muted-foreground/40 pl-7",
              isMobileFullscreen ? "h-10" : "h-7",
            )}
            aria-label="Search claws"
          />
        </div>
      </div>

      {/* New Claw button */}
      <div className="px-2 pb-2 flex-shrink-0">
        <Button
          variant="outline"
          size="sm"
          className="w-full justify-start gap-2 h-8 text-xs"
          onClick={() => setIsCreateModalOpen(true)}
        >
          <Plus className="h-3.5 w-3.5" />
          New Claw
        </Button>
      </div>

      {/* Create Claw Modal */}
      <CreateClawModal
        open={isCreateModalOpen}
        onOpenChange={setIsCreateModalOpen}
      />

      {/* Claws tree */}
      <div className="flex-1 overflow-y-auto px-2 scrollbar-thin scrollbar-thumb-muted-foreground/20 scrollbar-track-transparent" role="tree" aria-label="Claws list">
        {error ? (
          <div className="flex flex-col items-center justify-center h-32 gap-3">
            <XCircle className="h-8 w-8 text-red-500" />
            <span className="text-sm text-red-500">Failed to load claws</span>
            {error.message && (
              <span className="text-xs text-muted-foreground max-w-[200px] truncate" title={error.message}>
                {error.message}
              </span>
            )}
            <Button variant="outline" size="sm" onClick={() => utils.claws.getAll.invalidate()}>
              <RefreshCw className="h-3.5 w-3.5 mr-1" />
              Retry
            </Button>
          </div>
        ) : isLoading ? (
          <div className="flex items-center justify-center h-20">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : filteredClaws.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-20 gap-2">
            <Zap className="h-6 w-6 text-muted-foreground/50" />
            <span className="text-sm text-muted-foreground text-center">
              {searchQuery ? "No claws found" : "No claws"}
            </span>
          </div>
        ) : (
          <div className="space-y-2">
            {/* Scheduled claws */}
            {groupedClaws.scheduled.length > 0 && (
              <div className="space-y-1" role="group" aria-label="Scheduled claws">
                <div className="text-xs font-medium text-muted-foreground px-2 py-1">
                  Scheduled ({groupedClaws.scheduled.length})
                </div>
                {groupedClaws.scheduled.map(renderClawCard)}
              </div>
            )}

            {/* GitHub claws */}
            {groupedClaws.github.length > 0 && (
              <div className="space-y-1" role="group" aria-label="GitHub claws">
                <div className="text-xs font-medium text-muted-foreground px-2 py-1">
                  GitHub ({groupedClaws.github.length})
                </div>
                {groupedClaws.github.map(renderClawCard)}
              </div>
            )}

            {/* Manual claws */}
            {groupedClaws.manual.length > 0 && (
              <div className="space-y-1" role="group" aria-label="Manual claws">
                <div className="text-xs font-medium text-muted-foreground px-2 py-1">
                  Manual ({groupedClaws.manual.length})
                </div>
                {groupedClaws.manual.map(renderClawCard)}
              </div>
            )}

            {/* Messaging claws */}
            {groupedClaws.messaging.length > 0 && (
              <div className="space-y-1" role="group" aria-label="Messaging claws">
                <div className="text-xs font-medium text-muted-foreground px-2 py-1">
                  Messaging ({groupedClaws.messaging.length})
                </div>
                {groupedClaws.messaging.map(renderClawCard)}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
