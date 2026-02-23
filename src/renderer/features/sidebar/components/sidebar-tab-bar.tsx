"use client"

import React from "react"
import { useAtom, useSetAtom } from "jotai"
import {
  Terminal,
  TerminalSquare,
  Bot,
  BookOpen,
  Server,
  History,
  ChevronsLeft,
  ChevronsRight,
  FolderOpen,
  Rocket,
  Github,
  Network,
} from "lucide-react"
import { OriginalMCPIcon } from "../../../components/ui/icons"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "../../../components/ui/tooltip"
import { cn } from "../../../lib/utils"
import { selectedSidebarTabAtom, sidebarContentCollapsedAtom, type SidebarTab } from "../../agents/atoms"
import { selectedWorkflowCategoryAtom } from "../../workflows/atoms"
import { selectedClustersCategoryAtom } from "../../clusters/atoms"
import { selectedMcpCategoryAtom } from "../../mcp/atoms"
import { selectedGsdCategoryAtom } from "../../gsd/atoms"

interface TabItem {
  id: SidebarTab
  label: string
  icon: React.ComponentType<{ className?: string }>
}

const tabs: TabItem[] = [
  { id: "history", label: "History", icon: History },
  { id: "chats", label: "Workspaces", icon: FolderOpen },
  { id: "clusters", label: "Clusters", icon: Server },
  { id: "gsd", label: "Get-Sh!t-Done", icon: Rocket },
  { id: "github", label: "GitHub", icon: Github },
  { id: "gitnexus", label: "GitNexus", icon: Network },
  { id: "agents", label: "Agents", icon: Bot },
  { id: "skills", label: "Skills", icon: BookOpen },
  { id: "mcps", label: "MCPs", icon: OriginalMCPIcon },
  { id: "terminal", label: "Terminal", icon: TerminalSquare },
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
  const setClustersCategory = useSetAtom(selectedClustersCategoryAtom)
  const setMcpCategory = useSetAtom(selectedMcpCategoryAtom)
  const setGsdCategory = useSetAtom(selectedGsdCategoryAtom)

  const handleTabClick = (tabId: SidebarTab) => {
    if (selectedTab === tabId) {
      // Clicking same tab toggles collapse
      setIsContentCollapsed(!isContentCollapsed)
    } else {
      // Clicking different tab switches and expands
      setSelectedTab(tabId)

      // Clear all category atoms to ensure correct main content view renders
      // These atoms control which view is shown in AgentsContent
      setWorkflowCategory(null)
      setClustersCategory(null)
      setMcpCategory(null)

      // GSD tab directly opens the doc view (no intermediate panel)
      if (tabId === "gsd") {
        setGsdCategory("gsd")
        setIsContentCollapsed(true) // Collapse sidebar since GSD has its own file tree
      } else if (tabId === "github" || tabId === "gitnexus") {
        setGsdCategory(null)
        setIsContentCollapsed(true) // Full-width views — no sidebar panel needed
      } else {
        setGsdCategory(null)
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
