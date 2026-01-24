"use client"

import React from "react"
import { useAtom } from "jotai"
import {
  MessageSquare,
  Terminal,
  Bot,
  Sparkles,
  Plug,
} from "lucide-react"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "../../../components/ui/tooltip"
import { cn } from "../../../lib/utils"
import { selectedSidebarTabAtom, type SidebarTab } from "../../agents/atoms"

interface TabItem {
  id: SidebarTab
  label: string
  icon: React.ComponentType<{ className?: string }>
}

const tabs: TabItem[] = [
  { id: "chats", label: "Workspaces", icon: MessageSquare },
  { id: "commands", label: "Commands", icon: Terminal },
  { id: "agents", label: "Agents", icon: Bot },
  { id: "skills", label: "Skills", icon: Sparkles },
  { id: "mcps", label: "MCPs", icon: Plug },
]

interface SidebarTabBarProps {
  isCollapsed?: boolean
  className?: string
}

export function SidebarTabBar({ isCollapsed = false, className }: SidebarTabBarProps) {
  const [selectedTab, setSelectedTab] = useAtom(selectedSidebarTabAtom)

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
                onClick={() => setSelectedTab(tab.id)}
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
    </div>
  )
}
