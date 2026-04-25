"use client"

import React from "react"
import { Network, Workflow, Cpu } from "lucide-react"
import { useAtom, useSetAtom } from "jotai"
import { cn } from "../../../lib/utils"
import { selectedWorkflowCategoryAtom } from "../atoms"
import { selectedAgentChatIdAtom } from "../../agents/atoms"

interface WorkflowsSidebarSectionProps {
  className?: string
}

export function WorkflowsSidebarSection({
  className,
}: WorkflowsSidebarSectionProps) {
  const [selectedCategory, setSelectedCategory] = useAtom(
    selectedWorkflowCategoryAtom
  )
  const setSelectedChatId = useSetAtom(selectedAgentChatIdAtom)

  const handleCategoryClick = (
    category: "agents" | "commands" | "skills"
  ) => {
    console.log("[workflow-category] Button clicked:", category)
    console.log("[workflow-category] Current category:", selectedCategory)

    // Toggle: if clicking the active category, deselect it
    if (selectedCategory === category) {
      console.log("[workflow-category] Deselecting category")
      setSelectedCategory(null)
    } else {
      console.log("[workflow-category] Setting category to:", category)
      setSelectedCategory(category)
      // Clear chat selection to switch to workflow view
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
        onClick={() => handleCategoryClick("agents")}
        className={cn(
          "flex w-full items-center gap-3 px-3 py-2 text-sm transition-colors rounded-md mx-2",
          selectedCategory === "agents"
            ? "bg-accent text-accent-foreground font-medium"
            : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
        )}
      >
        <Network className="h-4 w-4 flex-shrink-0" />
        <span className="flex-1 text-left">Agents</span>
      </button>

      {/* Commands Button */}
      <button
        type="button"
        onClick={() => handleCategoryClick("commands")}
        className={cn(
          "flex w-full items-center gap-3 px-3 py-2 text-sm transition-colors rounded-md mx-2",
          selectedCategory === "commands"
            ? "bg-accent text-accent-foreground font-medium"
            : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
        )}
      >
        <Workflow className="h-4 w-4 flex-shrink-0" />
        <span className="flex-1 text-left">Commands</span>
      </button>

      {/* Skills Button */}
      <button
        type="button"
        onClick={() => handleCategoryClick("skills")}
        className={cn(
          "flex w-full items-center gap-3 px-3 py-2 text-sm transition-colors rounded-md mx-2",
          selectedCategory === "skills"
            ? "bg-accent text-accent-foreground font-medium"
            : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
        )}
      >
        <Cpu className="h-4 w-4 flex-shrink-0" />
        <span className="flex-1 text-left">Skills</span>
      </button>
    </div>
  )
}
