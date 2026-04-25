"use client"

import React from "react"
import { useAtom, useSetAtom } from "jotai"
import {
  Bot,
  LibraryBig,
  History,
  ChevronsLeft,
  ChevronsRight,
  FolderOpen,
  Database,
  Sparkles,
} from "lucide-react"
import { OriginalMCPIcon } from "../../../components/ui/icons"
import { ClaudeCodeIcon } from "../../../components/ui/canvas-icons"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "../../../components/ui/tooltip"
import { cn } from "../../../lib/utils"
import { selectedSidebarTabAtom, sidebarContentCollapsedAtom, selectedSettingsCategoryAtom, type SidebarTab } from "../../agents/atoms"
import { selectedWorkflowCategoryAtom } from "../../workflows/atoms"
import { selectedMcpCategoryAtom } from "../../mcp/atoms"

interface TabItem {
  id: SidebarTab
  label: string
  icon: React.ComponentType<{ className?: string }>
}

const tabs: TabItem[] = [
  { id: "history", label: "History", icon: History },
  { id: "chats", label: "Workspaces", icon: FolderOpen },
  { id: "settings", label: "CC Settings", icon: ClaudeCodeIcon },
  { id: "er-diagram", label: "ER Diagram", icon: Database },
  { id: "openui", label: "Extend Claw with AI", icon: Sparkles },
]

interface SidebarTabBarProps {
  isCollapsed?: boolean
  className?: string
}

export function SidebarTabBar({ isCollapsed = false, className }: SidebarTabBarProps) {
  const [selectedTab, setSelectedTab] = useAtom(selectedSidebarTabAtom)
  const [isContentCollapsed, setIsContentCollapsed] = useAtom(sidebarContentCollapsedAtom)
  const [isIconBarExpanded, setIsIconBarExpanded] = React.useState(false)

  // Category atoms that control main content view - need to clear when switching tabs
  const setWorkflowCategory = useSetAtom(selectedWorkflowCategoryAtom)
  const setMcpCategory = useSetAtom(selectedMcpCategoryAtom)
  const setSettingsCategory = useSetAtom(selectedSettingsCategoryAtom)

  const handleTabClick = (tabId: SidebarTab) => {
    if (selectedTab === tabId) {
      setIsContentCollapsed(!isContentCollapsed)
    } else {
      // Clicking different tab switches and expands
      setSelectedTab(tabId)

      // Clear all category atoms to ensure correct main content view renders
      // These atoms control which view is shown in AgentsContent
      setWorkflowCategory(null)
      setMcpCategory(null)

      if (tabId === "er-diagram") {
        setIsContentCollapsed(true) // Full-width view — no sidebar panel needed
      } else if (tabId === "settings") {
        setSettingsCategory("overview") // Default to overview category
        setIsContentCollapsed(false) // Settings has tree pane
      } else if (tabId === "openui") {
        setIsContentCollapsed(false) // OpenUI has left panel with component library
      } else {
        setIsContentCollapsed(false)
      }
    }
  }

  return (
    <div
      className={cn(
        "flex items-center gap-0.5 px-2 py-1.5 border-b border-border/50 transition-all duration-200 ease-out",
        isCollapsed && "flex-col py-2",
        isCollapsed && isIconBarExpanded && "w-48",
        isCollapsed && !isIconBarExpanded && "w-14",
        className,
      )}
    >
      {/* Expand/Collapse toggle at top (only shown when in collapsed/vertical mode) */}
      {isCollapsed && (
        <Tooltip delayDuration={300}>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={() => setIsIconBarExpanded(!isIconBarExpanded)}
              className="mb-2 flex items-center justify-center rounded-md transition-all duration-150 ease-out h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-foreground/10"
              aria-label={isIconBarExpanded ? "Collapse icon bar" : "Expand icon bar"}
            >
              {isIconBarExpanded ? (
                <ChevronsLeft className="h-4 w-4 flex-shrink-0" />
              ) : (
                <ChevronsRight className="h-4 w-4 flex-shrink-0" />
              )}
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">
            {isIconBarExpanded ? "Collapse" : "Expand"}
          </TooltipContent>
        </Tooltip>
      )}

      {tabs.map((tab) => {
        const Icon = tab.icon
        const isActive = selectedTab === tab.id

        return (
          <Tooltip key={tab.id} delayDuration={300}>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => handleTabClick(tab.id)}
                className={cn(
                  "flex items-center rounded-md transition-all duration-150 ease-out",
                  isCollapsed ? "h-8" : "h-7 w-7",
                  isCollapsed && isIconBarExpanded ? "w-full justify-start px-3 gap-3" : "justify-center",
                  isCollapsed && !isIconBarExpanded && "w-8",
                  isActive
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:text-foreground hover:bg-foreground/10",
                )}
                aria-label={tab.label}
                aria-pressed={isActive}
              >
                <Icon className={cn("flex-shrink-0", isCollapsed ? "h-4 w-4" : "h-3.5 w-3.5")} />
                {isCollapsed && isIconBarExpanded && (
                  <span className="text-sm font-medium truncate">{tab.label}</span>
                )}
              </button>
            </TooltipTrigger>
            {(!isCollapsed || !isIconBarExpanded) && (
              <TooltipContent side={isCollapsed ? "right" : "bottom"}>
                {tab.label}
              </TooltipContent>
            )}
          </Tooltip>
        )
      })}

    </div>
  )
}
