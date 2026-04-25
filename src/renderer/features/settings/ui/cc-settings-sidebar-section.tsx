"use client"

import React from "react"
import { Network, Cpu, Server, Settings2 } from "lucide-react"
import { useAtom, useSetAtom } from "jotai"
import { cn } from "../../../lib/utils"
import { selectedSettingsCategoryAtom, type SettingsCategory, selectedAgentChatIdAtom } from "../../agents/atoms"

interface CcSettingsSidebarSectionProps {
  className?: string
}

export function CcSettingsSidebarSection({
  className,
}: CcSettingsSidebarSectionProps) {
  const [selectedCategory, setSelectedCategory] = useAtom(selectedSettingsCategoryAtom)
  const setSelectedChatId = useSetAtom(selectedAgentChatIdAtom)

  const handleCategoryClick = (category: SettingsCategory) => {
    // Toggle: if clicking the active category, deselect it
    if (selectedCategory === category) {
      setSelectedCategory(null)
    } else {
      setSelectedCategory(category)
      // Clear chat selection to switch to settings view
      setSelectedChatId(null)
    }
  }

  return (
    <div className={cn("border-t border-border/50 py-2 space-y-1", className)}>
      {/* Debug indicator */}
      {selectedCategory && (
        <div className="px-3 py-1 mx-2 mb-2 text-xs bg-purple-500 text-white rounded">
          Selected: {selectedCategory}
        </div>
      )}

      {/* Agents Button */}
      <button
        type="button"
        onClick={() => handleCategoryClick("agents-overview")}
        className={cn(
          "flex w-full items-center gap-3 px-3 py-2 text-sm transition-colors rounded-md mx-2",
          selectedCategory?.startsWith("agents")
            ? "bg-accent text-accent-foreground font-medium"
            : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
        )}
      >
        <Network className="h-4 w-4 flex-shrink-0" />
        <span className="flex-1 text-left">Agents</span>
      </button>

      {/* Skills Button */}
      <button
        type="button"
        onClick={() => handleCategoryClick("skills-overview")}
        className={cn(
          "flex w-full items-center gap-3 px-3 py-2 text-sm transition-colors rounded-md mx-2",
          selectedCategory?.startsWith("skills")
            ? "bg-accent text-accent-foreground font-medium"
            : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
        )}
      >
        <Cpu className="h-4 w-4 flex-shrink-0" />
        <span className="flex-1 text-left">Skills</span>
      </button>

      {/* MCPs Button */}
      <button
        type="button"
        onClick={() => handleCategoryClick("mcps-overview")}
        className={cn(
          "flex w-full items-center gap-3 px-3 py-2 text-sm transition-colors rounded-md mx-2",
          selectedCategory?.startsWith("mcps")
            ? "bg-accent text-accent-foreground font-medium"
            : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
        )}
      >
        <Server className="h-4 w-4 flex-shrink-0" />
        <span className="flex-1 text-left">MCPs</span>
      </button>

      {/* Settings Button */}
      <button
        type="button"
        onClick={() => handleCategoryClick("overview")}
        className={cn(
          "flex w-full items-center gap-3 px-3 py-2 text-sm transition-colors rounded-md mx-2",
          selectedCategory === "overview" ||
          selectedCategory === "permissions" ||
          selectedCategory === "hooks" ||
          selectedCategory === "status-line"
            ? "bg-accent text-accent-foreground font-medium"
            : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
        )}
      >
        <Settings2 className="h-4 w-4 flex-shrink-0" />
        <span className="flex-1 text-left">Settings</span>
      </button>
    </div>
  )
}
