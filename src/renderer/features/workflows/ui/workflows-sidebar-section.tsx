"use client"

import React from "react"
import { motion, AnimatePresence } from "motion/react"
import { ChevronDown, Workflow } from "lucide-react"
import { useAtom, useAtomValue, useSetAtom } from "jotai"
import { cn } from "../../../lib/utils"
import { workflowsSidebarOpenAtom, workflowsRefreshTriggerAtom } from "../atoms"
import { WorkflowTree } from "./workflow-tree"

interface WorkflowsSidebarSectionProps {
  className?: string
}

export function WorkflowsSidebarSection({ className }: WorkflowsSidebarSectionProps) {
  const [isOpen, setIsOpen] = useAtom(workflowsSidebarOpenAtom)
  const refreshTrigger = useAtomValue(workflowsRefreshTriggerAtom)

  return (
    <div className={cn("border-t border-border/50", className)}>
      {/* Section Header */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "flex w-full items-center gap-2 px-3 py-2 text-sm font-medium transition-colors hover:bg-muted/50",
        )}
      >
        <motion.div
          animate={{ rotate: isOpen ? 0 : -90 }}
          transition={{ duration: 0.15 }}
          className="flex-shrink-0"
        >
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        </motion.div>
        <Workflow className="h-4 w-4 text-muted-foreground flex-shrink-0" />
        <span className="flex-1 text-left">Workflows</span>
      </button>

      {/* Section Content */}
      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <div className="px-2 pb-2">
              <WorkflowTree key={`workflows-tree-${refreshTrigger}`} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
