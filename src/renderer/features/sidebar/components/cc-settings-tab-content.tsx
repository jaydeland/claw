"use client"

import React from "react"
import { LayoutDashboard, ShieldCheck, Webhook, TerminalSquare } from "lucide-react"
import { useAtom } from "jotai"
import { cn } from "../../../lib/utils"
import { selectedSettingsCategoryAtom, type SettingsCategory } from "../../agents/atoms"

interface Category {
  id: SettingsCategory
  label: string
  icon: React.ComponentType<{ className?: string }>
  description: string
}

const CATEGORIES: Category[] = [
  {
    id: "overview",
    label: "Overview",
    icon: LayoutDashboard,
    description: "Settings summary",
  },
  {
    id: "permissions",
    label: "Permissions",
    icon: ShieldCheck,
    description: "Allow / deny tool access",
  },
  {
    id: "hooks",
    label: "Hooks",
    icon: Webhook,
    description: "Lifecycle event hooks",
  },
  {
    id: "status-line",
    label: "Status Line",
    icon: TerminalSquare,
    description: "Terminal status line",
  },
]

interface CcSettingsTabContentProps {
  className?: string
  isMobileFullscreen?: boolean
}

export function CcSettingsTabContent({ className }: CcSettingsTabContentProps) {
  const [selectedCategory, setSelectedCategory] = useAtom(selectedSettingsCategoryAtom)

  return (
    <div className={cn("flex flex-col flex-1 overflow-hidden", className)}>
      {/* Header */}
      <div className="px-3 py-2 border-b border-border/50">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
          Claude Code
        </p>
      </div>

      {/* Category list */}
      <div className="flex flex-col gap-0.5 p-1.5 overflow-y-auto">
        {CATEGORIES.map((cat) => {
          const Icon = cat.icon
          const isActive = selectedCategory === cat.id
          return (
            <button
              key={cat.id}
              type="button"
              onClick={() => setSelectedCategory(cat.id)}
              className={cn(
                "flex items-center gap-2.5 w-full px-2.5 py-2 rounded-md text-left transition-colors",
                isActive
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:text-foreground hover:bg-foreground/8"
              )}
            >
              <Icon className="h-3.5 w-3.5 flex-shrink-0" />
              <span className="text-xs font-medium truncate">{cat.label}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
