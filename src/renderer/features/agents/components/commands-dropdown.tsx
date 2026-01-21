"use client"

import { Terminal } from "lucide-react"
import { trpc } from "../../../lib/trpc"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "../../../components/ui/dropdown-menu"
import { IconChevronDown, IconSpinner } from "../../../components/ui/icons"
import { useState, useRef } from "react"
import { createPortal } from "react-dom"

interface CommandsDropdownProps {
  onCommandSelect: (command: string) => void
  disabled?: boolean
}

export function CommandsDropdown({
  onCommandSelect,
  disabled = false,
}: CommandsDropdownProps) {
  // Fetch repository commands from workflows router
  const { data: workflowCommands = [], isLoading } =
    trpc.workflows.listCommands.useQuery(undefined, {
      staleTime: 30_000, // Cache for 30 seconds
      refetchOnWindowFocus: false,
    })

  // Note: workflowCommands returns repository commands only (no builtin commands)
  const repositoryCommands = workflowCommands

  // Tooltip state for showing command descriptions on hover
  const [tooltip, setTooltip] = useState<{
    visible: boolean
    position: { top: number; left: number }
    description: string
  } | null>(null)
  const tooltipTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hasShownTooltipRef = useRef(false)

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="flex items-center gap-1.5 px-2 py-1 text-sm text-muted-foreground hover:text-foreground transition-[background-color,color] duration-150 ease-out rounded-md hover:bg-muted/50 outline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring/70 disabled:opacity-50 disabled:cursor-not-allowed"
          disabled={disabled}
        >
          <Terminal className="h-3.5 w-3.5" />
          <span>Commands</span>
          <IconChevronDown className="h-3 w-3 shrink-0 opacity-50" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-[220px]">
        {isLoading ? (
          <div className="flex items-center justify-center py-4">
            <IconSpinner className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : repositoryCommands.length === 0 ? (
          <div className="px-2 py-4 text-sm text-muted-foreground text-center">
            No repository commands found
          </div>
        ) : (
          repositoryCommands.map((command) => (
            <DropdownMenuItem
              key={command.id}
              onClick={() => {
                // Clear tooltip before closing dropdown
                if (tooltipTimeoutRef.current) {
                  clearTimeout(tooltipTimeoutRef.current)
                  tooltipTimeoutRef.current = null
                }
                setTooltip(null)
                onCommandSelect(`/${command.name}`)
              }}
              className="flex items-center gap-1.5"
              onMouseEnter={(e) => {
                if (!command.description) return

                // Clear any existing timeout
                if (tooltipTimeoutRef.current) {
                  clearTimeout(tooltipTimeoutRef.current)
                  tooltipTimeoutRef.current = null
                }

                const rect = e.currentTarget.getBoundingClientRect()
                const showTooltip = () => {
                  setTooltip({
                    visible: true,
                    position: {
                      top: rect.top,
                      left: rect.right + 8,
                    },
                    description: command.description,
                  })
                  hasShownTooltipRef.current = true
                  tooltipTimeoutRef.current = null
                }

                // Show immediately if user has already seen one tooltip
                if (hasShownTooltipRef.current) {
                  showTooltip()
                } else {
                  // Otherwise delay 1 second
                  tooltipTimeoutRef.current = setTimeout(showTooltip, 1000)
                }
              }}
              onMouseLeave={() => {
                if (tooltipTimeoutRef.current) {
                  clearTimeout(tooltipTimeoutRef.current)
                  tooltipTimeoutRef.current = null
                }
                setTooltip(null)
              }}
            >
              <Terminal className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <span>/{command.name}</span>
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>

      {/* Tooltip portal for command descriptions */}
      {tooltip?.visible &&
        createPortal(
          <div
            className="fixed z-[100000]"
            style={{
              top: tooltip.position.top + 14,
              left: tooltip.position.left,
              transform: "translateY(-50%)",
            }}
          >
            <div
              data-tooltip="true"
              className="relative rounded-[12px] bg-popover px-2.5 py-1.5 text-xs text-popover-foreground dark max-w-[250px]"
            >
              <span>{tooltip.description}</span>
            </div>
          </div>,
          document.body,
        )}
    </DropdownMenu>
  )
}
