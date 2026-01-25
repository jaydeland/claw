"use client"

import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { IconDoubleChevronRight } from "@/components/ui/icons"

interface WorkflowSidebarHeaderProps {
  title: string
  onClose: () => void
}

export function WorkflowSidebarHeader({ title, onClose }: WorkflowSidebarHeaderProps) {
  return (
    <div className="flex items-center gap-1 px-2 py-1.5 flex-shrink-0 border-b border-border/50">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="h-6 w-6 p-0 hover:bg-foreground/10 transition-[background-color,transform] duration-150 ease-out active:scale-[0.97] text-foreground flex-shrink-0 rounded-md"
            aria-label={`Close ${title.toLowerCase()}`}
          >
            <IconDoubleChevronRight className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">Close {title.toLowerCase()}</TooltipContent>
      </Tooltip>
      <span className="text-sm font-medium ml-1">{title}</span>
    </div>
  )
}
