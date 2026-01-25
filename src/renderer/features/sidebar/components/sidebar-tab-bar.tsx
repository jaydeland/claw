"use client"

import React from "react"
import { useAtom } from "jotai"
import {
  MessageSquare,
  Terminal,
  TerminalSquare,
  Bot,
  Sparkles,
  Plug,
  Server,
  History,
  PanelLeftClose,
  PanelLeft,
  FolderOpen,
} from "lucide-react"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "../../../components/ui/tooltip"
import { cn } from "../../../lib/utils"
import { selectedSidebarTabAtom, sidebarContentCollapsedAtom, type SidebarTab } from "../../agents/atoms"

interface TabItem {
  id: SidebarTab
  label: string
  icon: React.ComponentType<{ className?: string }>
}

const tabs: TabItem[] = [
  { id: "history", label: "History", icon: History },
  { id: "chats", label: "Workspaces", icon: FolderOpen },
  { id: "terminal", label: "Terminal", icon: TerminalSquare },
  { id: "commands", label: "Commands", icon: Terminal },
  { id: "agents", label: "Subagents", icon: Bot },
  { id: "skills", label: "Skills", icon: Sparkles },
  { id: "mcps", label: "MCPs", icon: Plug },
  { id: "clusters", label: "Clusters", icon: Server },
]

interface SidebarTabBarProps {
  isCollapsed?: boolean
  className?: string
}

export function SidebarTabBar({ isCollapsed = false, className }: SidebarTabBarProps) {
  const [selectedTab, setSelectedTab] = useAtom(selectedSidebarTabAtom)
  const [isContentCollapsed, setIsContentCollapsed] = useAtom(sidebarContentCollapsedAtom)

  const handleTabClick = (tabId: SidebarTab) => {
    if (selectedTab === tabId) {
      // Clicking same tab toggles collapse
      setIsContentCollapsed(!isContentCollapsed)
    } else {
      // Clicking different tab switches and expands
      setSelectedTab(tabId)
      setIsContentCollapsed(false)
    }
  }

  return (
    <div
      className={cn(
        "flex items-center gap-0.5 px-2 py-1.5 border-b border-border/50",
        isCollapsed && "flex-col py-2",
        className,
      )}
    >
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
                  "flex items-center justify-center rounded-md transition-all duration-150 ease-out",
                  isCollapsed ? "h-8 w-8" : "h-7 w-7",
                  isActive
                    ? "bg-foreground/10 text-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-foreground/5",
                )}
                aria-label={tab.label}
                aria-pressed={isActive}
              >
                <Icon className={cn("flex-shrink-0", isCollapsed ? "h-4 w-4" : "h-3.5 w-3.5")} />
              </button>
            </TooltipTrigger>
            <TooltipContent side={isCollapsed ? "right" : "bottom"}>
              {tab.label}
            </TooltipContent>
          </Tooltip>
        )
      })}

      {/* Spacer and collapse toggle */}
      <div className="flex-1" />
      <Tooltip delayDuration={300}>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={() => setIsContentCollapsed(!isContentCollapsed)}
            className={cn(
              "flex items-center justify-center rounded-md transition-all duration-150 ease-out",
              isCollapsed ? "h-8 w-8" : "h-7 w-7",
              "text-muted-foreground hover:text-foreground hover:bg-foreground/5",
            )}
            aria-label={isContentCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {isContentCollapsed ? (
              <PanelLeft className={cn("flex-shrink-0", isCollapsed ? "h-4 w-4" : "h-3.5 w-3.5")} />
            ) : (
              <PanelLeftClose className={cn("flex-shrink-0", isCollapsed ? "h-4 w-4" : "h-3.5 w-3.5")} />
            )}
          </button>
        </TooltipTrigger>
        <TooltipContent side={isCollapsed ? "right" : "bottom"}>
          {isContentCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        </TooltipContent>
      </Tooltip>
    </div>
  )
}
