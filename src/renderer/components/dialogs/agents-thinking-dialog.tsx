"use client"

import { useAtom } from "jotai"
import { useState } from "react"
import { ChevronDown, Zap } from "lucide-react"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../../ui/dropdown-menu"
import { Switch } from "../../ui/switch"
import { ThinkingIcon } from "../../ui/icons"
import { cn } from "../../lib/utils"
import {
  extendedThinkingEnabledAtom,
  thinkingEffortAtom,
} from "../../lib/atoms"

interface AgentsThinkingDialogProps {
  disabled?: boolean
}

export function AgentsThinkingDialog({ disabled }: AgentsThinkingDialogProps) {
  const [thinkingEnabled, setThinkingEnabled] = useAtom(extendedThinkingEnabledAtom)
  const [thinkingEffort, setThinkingEffort] = useAtom(thinkingEffortAtom)
  const [isOpen, setIsOpen] = useState(false)

  return (
    <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
      <DropdownMenuTrigger asChild>
        <button
          disabled={disabled}
          className={cn(
            "flex items-center gap-1 px-1.5 py-1 text-xs text-muted-foreground transition-colors rounded-md outline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring/70",
            disabled
              ? "opacity-70 cursor-not-allowed"
              : "hover:text-foreground hover:bg-muted/50",
          )}
          title={thinkingEnabled ? `Thinking: ${thinkingEffort}` : "Extended Thinking"}
          aria-label={thinkingEnabled ? "Extended Thinking Enabled" : "Extended Thinking"}
        >
          <ThinkingIcon className="h-3.5 w-3.5 shrink-0" />
          <span className="hidden sm:inline">
            {thinkingEnabled ? thinkingEffort.charAt(0).toUpperCase() + thinkingEffort.slice(1) : "Thinking"}
          </span>
          <ChevronDown className="h-3 w-3 shrink-0 opacity-50" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-[200px]">
        {/* Thinking Toggle */}
        <div
          className="flex items-center justify-between px-1.5 py-1.5 mx-1"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center gap-1.5">
            <Zap className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <span className="text-sm">Extended Thinking</span>
          </div>
          <Switch
            checked={thinkingEnabled}
            onCheckedChange={setThinkingEnabled}
            className="scale-75"
          />
        </div>

        {/* Effort Level Selector - Only shown when thinking is enabled */}
        {thinkingEnabled && (
          <>
            <DropdownMenuSeparator />
            <div
              className="px-1.5 py-1.5 mx-1 border-t border-border/50"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center gap-1 mb-1.5">
                <span className="text-[11px] text-muted-foreground">Effort</span>
              </div>
              <div className="flex gap-1">
                {(["low", "medium", "high", "max"] as const).map((level) => (
                  <button
                    key={level}
                    className={cn(
                      "px-2 py-0.5 text-[11px] rounded transition-colors",
                      thinkingEffort === level
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted/50 hover:bg-muted text-muted-foreground hover:text-foreground"
                    )}
                    onClick={() => setThinkingEffort(level)}
                  >
                    {level.charAt(0).toUpperCase() + level.slice(1)}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
