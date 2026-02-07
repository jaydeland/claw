"use client"

import { useMemo, useState, useCallback } from "react"
import { useAtomValue } from "jotai"
import { trpc } from "../../../lib/trpc"
import { selectedProjectAtom } from "../atoms"
import { Button } from "../../../components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../../../components/ui/tooltip"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "../../../components/ui/collapsible"
import {
  FileText,
  ChevronRight,
  ChevronDown,
  Play,
  AlertCircle,
  Rocket,
  CheckCircle2,
  Clock,
  FolderOpen,
} from "lucide-react"
import { cn } from "../../../lib/utils"
import { motion, AnimatePresence } from "motion/react"

interface GsdChatSidebarProps {
  onRunCommand: (command: string) => void
  onViewDocument: (path: string) => void
}

interface ParsedAction {
  id: string
  fullText: string
  description: string
  command: string | null
  hasCommand: boolean
}

function parseNextActions(actions: string[]): ParsedAction[] {
  return actions.map((action, index) => {
    // Extract command from patterns like `/gsd:command args` or `/command args`
    const commandMatch = action.match(/`(\/[^`]+)`/)
    const command = commandMatch ? commandMatch[1] : null

    // Clean description by removing the command markdown
    const description = action.replace(/`[^`]+`/g, "").trim()

    return {
      id: `action-${index}`,
      fullText: action,
      description: description || action,
      command,
      hasCommand: !!command,
    }
  })
}

function getStatusColor(status: string): string {
  const normalized = status.toLowerCase()
  if (normalized.includes("complete")) return "bg-green-500/20 text-green-500 border-green-500/30"
  if (normalized.includes("progress")) return "bg-blue-500/20 text-blue-500 border-blue-500/30"
  if (normalized.includes("planning")) return "bg-yellow-500/20 text-yellow-500 border-yellow-500/30"
  if (normalized.includes("deferred")) return "bg-gray-500/20 text-gray-500 border-gray-500/30"
  return "bg-muted text-muted-foreground border-border"
}

function getStatusIcon(status: string) {
  const normalized = status.toLowerCase()
  if (normalized.includes("complete")) return <CheckCircle2 className="h-3 w-3" />
  if (normalized.includes("progress")) return <Clock className="h-3 w-3" />
  if (normalized.includes("planning")) return <Rocket className="h-3 w-3" />
  return <Clock className="h-3 w-3" />
}

export function GsdChatSidebar({ onRunCommand, onViewDocument }: GsdChatSidebarProps) {
  const selectedProject = useAtomValue(selectedProjectAtom)
  const [sendingActionId, setSendingActionId] = useState<string | null>(null)
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(["current-phase", "next-actions", "plans"])
  )
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set())

  const projectPath = selectedProject?.path

  // Fetch planning state
  const { data: planningState, isLoading: stateLoading } = trpc.gsd.getPlanningState.useQuery(
    { projectPath: projectPath! },
    { enabled: !!projectPath }
  )

  // Fetch planning docs
  const { data: planningDocs, isLoading: docsLoading } = trpc.gsd.listPlanningDocs.useQuery(
    { projectPath: projectPath! },
    { enabled: !!projectPath }
  )

  // Group files by directory
  const fileTree = useMemo(() => {
    if (!planningDocs?.files) return { root: [], folders: {} }

    const root: typeof planningDocs.files = []
    const folders: Record<string, typeof planningDocs.files> = {}

    for (const file of planningDocs.files) {
      if (!file.isDirectory) {
        const parts = file.path.split("/")
        if (parts.length === 1) {
          root.push(file)
        } else {
          const folder = parts[0]!
          if (!folders[folder]) folders[folder] = []
          folders[folder]!.push(file)
        }
      }
    }

    return { root, folders }
  }, [planningDocs])

  const toggleSection = useCallback((section: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev)
      if (next.has(section)) {
        next.delete(section)
      } else {
        next.add(section)
      }
      return next
    })
  }, [])

  const toggleFolder = useCallback((folder: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev)
      if (next.has(folder)) {
        next.delete(folder)
      } else {
        next.add(folder)
      }
      return next
    })
  }, [])

  const handleRunAction = useCallback(
    async (action: ParsedAction) => {
      if (!action.command || sendingActionId) return

      setSendingActionId(action.id)
      onRunCommand(action.command)

      // Clear sending state after a short delay
      setTimeout(() => setSendingActionId(null), 1000)
    },
    [onRunCommand, sendingActionId]
  )

  const parsedActions = useMemo(() => {
    return parseNextActions(planningState?.nextActions || [])
  }, [planningState?.nextActions])

  if (!projectPath) {
    return (
      <div className="w-64 border-l border-border flex flex-col bg-background">
        <div className="p-3 border-b border-border font-semibold text-sm">GSD Planning</div>
        <div className="p-4 text-sm text-muted-foreground text-center">
          No project selected
        </div>
      </div>
    )
  }

  if (stateLoading) {
    return (
      <div className="w-64 border-l border-border flex flex-col bg-background">
        <div className="p-3 border-b border-border font-semibold text-sm">GSD Planning</div>
        <div className="p-4 flex justify-center">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      </div>
    )
  }

  const hasPlanningState = planningState && !planningState.error

  return (
    <TooltipProvider delayDuration={300}>
      <div className="w-64 border-l border-border flex flex-col bg-background h-full overflow-hidden">
        {/* Header */}
        <div className="p-3 border-b border-border flex items-center justify-between shrink-0">
          <span className="font-semibold text-sm">GSD Planning</span>
          {hasPlanningState && planningState.currentPhase && (
            <span className="text-xs text-muted-foreground">
              Phase {planningState.currentPhase.number}
            </span>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto py-2 space-y-1">
          {!hasPlanningState ? (
            <div className="px-3 py-4 text-sm text-muted-foreground text-center">
              No planning documents found.
              <br />
              <span className="text-xs">Initialize GSD with /gsd:new-project</span>
            </div>
          ) : (
            <>
              {/* Current Phase */}
              {planningState.currentPhase && (
                <Collapsible
                  open={expandedSections.has("current-phase")}
                  onOpenChange={() => toggleSection("current-phase")}
                >
                  <CollapsibleTrigger className="w-full px-3 py-2 flex items-center justify-between hover:bg-muted/50 rounded-sm">
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      Current Phase
                    </span>
                    {expandedSections.has("current-phase") ? (
                      <ChevronDown className="h-3 w-3 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="h-3 w-3 text-muted-foreground" />
                    )}
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="px-3 pb-2">
                      <div className="p-3 rounded-lg border bg-muted/30">
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-medium text-sm">
                            {planningState.currentPhase.name}
                          </span>
                        </div>
                        <div
                          className={cn(
                            "inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium border",
                            getStatusColor(planningState.currentPhase.status)
                          )}
                        >
                          {getStatusIcon(planningState.currentPhase.status)}
                          {planningState.currentPhase.status}
                        </div>
                      </div>
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              )}

              {/* Blockers */}
              {planningState.blockers && planningState.blockers.length > 0 && (
                <div className="px-3 py-2">
                  <div className="p-3 rounded-lg border border-red-500/30 bg-red-500/10">
                    <div className="flex items-center gap-2 mb-2">
                      <AlertCircle className="h-4 w-4 text-red-500" />
                      <span className="font-medium text-sm">Blockers</span>
                    </div>
                    <ul className="space-y-1">
                      {planningState.blockers.map((blocker, index) => (
                        <li key={index} className="text-xs text-muted-foreground pl-6">
                          • {blocker}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}

              {/* Next Actions */}
              {parsedActions.length > 0 && (
                <Collapsible
                  open={expandedSections.has("next-actions")}
                  onOpenChange={() => toggleSection("next-actions")}
                >
                  <CollapsibleTrigger className="w-full px-3 py-2 flex items-center justify-between hover:bg-muted/50 rounded-sm">
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      Next Actions
                    </span>
                    {expandedSections.has("next-actions") ? (
                      <ChevronDown className="h-3 w-3 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="h-3 w-3 text-muted-foreground" />
                    )}
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="px-3 pb-2 space-y-1">
                      <AnimatePresence>
                        {parsedActions.map((action, index) => (
                          <motion.div
                            key={action.id}
                            initial={{ opacity: 0, y: -5 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: index * 0.05 }}
                          >
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className={cn(
                                    "w-full justify-start text-left h-auto py-2 px-3",
                                    action.hasCommand && "hover:bg-primary/10 hover:text-primary"
                                  )}
                                  disabled={!action.hasCommand || !!sendingActionId}
                                  onClick={() => handleRunAction(action)}
                                >
                                  <div className="flex items-start gap-2 w-full">
                                    {action.hasCommand ? (
                                      sendingActionId === action.id ? (
                                        <div className="h-4 w-4 mt-0.5 animate-spin rounded-full border-2 border-primary border-t-transparent shrink-0" />
                                      ) : (
                                        <Play className="h-4 w-4 mt-0.5 shrink-0 text-primary" />
                                      )
                                    ) : (
                                      <span className="h-4 w-4 mt-0.5 shrink-0 flex items-center justify-center text-xs text-muted-foreground">
                                        {index + 1}
                                      </span>
                                    )}
                                    <span className="text-xs leading-relaxed line-clamp-3">
                                      {action.description}
                                    </span>
                                  </div>
                                </Button>
                              </TooltipTrigger>
                              {action.command && (
                                <TooltipContent side="left" className="max-w-xs">
                                  <p className="text-xs">Run: {action.command}</p>
                                </TooltipContent>
                              )}
                            </Tooltip>
                          </motion.div>
                        ))}
                      </AnimatePresence>
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              )}

              {/* Plans / Files */}
              {planningDocs && planningDocs.files.length > 0 && (
                <Collapsible
                  open={expandedSections.has("plans")}
                  onOpenChange={() => toggleSection("plans")}
                >
                  <CollapsibleTrigger className="w-full px-3 py-2 flex items-center justify-between hover:bg-muted/50 rounded-sm">
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      Planning Docs
                    </span>
                    {expandedSections.has("plans") ? (
                      <ChevronDown className="h-3 w-3 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="h-3 w-3 text-muted-foreground" />
                    )}
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="px-2 pb-2">
                      {/* Root files */}
                      {fileTree.root.map((file) => (
                        <Button
                          key={file.path}
                          variant="ghost"
                          size="sm"
                          className="w-full justify-start text-left h-7 px-2 text-xs"
                          onClick={() => onViewDocument(file.path)}
                        >
                          <FileText className="h-3.5 w-3.5 mr-2 text-muted-foreground" />
                          <span className="truncate">{file.name}</span>
                        </Button>
                      ))}

                      {/* Folders */}
                      {Object.entries(fileTree.folders).map(([folderName, files]) => (
                        <div key={folderName}>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="w-full justify-start h-7 px-2 text-xs font-medium"
                            onClick={() => toggleFolder(folderName)}
                          >
                            {expandedFolders.has(folderName) ? (
                              <ChevronDown className="h-3 w-3 mr-1 text-muted-foreground" />
                            ) : (
                              <ChevronRight className="h-3 w-3 mr-1 text-muted-foreground" />
                            )}
                            <FolderOpen className="h-3.5 w-3.5 mr-2 text-muted-foreground" />
                            <span className="truncate">{folderName}</span>
                          </Button>

                          {expandedFolders.has(folderName) && (
                            <div className="pl-4 border-l border-border ml-4 mt-0.5">
                              {files.map((file) => (
                                <Button
                                  key={file.path}
                                  variant="ghost"
                                  size="sm"
                                  className="w-full justify-start text-left h-6 px-2 text-xs"
                                  onClick={() => onViewDocument(file.path)}
                                >
                                  <FileText className="h-3 w-3 mr-2 text-muted-foreground" />
                                  <span className="truncate">{file.name}</span>
                                </Button>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              )}
            </>
          )}
        </div>
      </div>
    </TooltipProvider>
  )
}
