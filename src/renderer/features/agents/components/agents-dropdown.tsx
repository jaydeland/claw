"use client"

import { Bot } from "lucide-react"
import { trpc } from "../../../lib/trpc"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "../../../components/ui/dropdown-menu"
import { IconChevronDown, IconSpinner } from "../../../components/ui/icons"

interface AgentsDropdownProps {
  onAgentSelect: (agentId: string) => void
  disabled?: boolean
}

export function AgentsDropdown({
  onAgentSelect,
  disabled = false,
}: AgentsDropdownProps) {
  // Fetch enabled agents from filesystem (same as sidebar/mentions)
  const { data: agents = [], isLoading } = trpc.agents.listEnabled.useQuery(undefined, {
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
    refetchOnWindowFocus: false,
  })

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="flex items-center gap-1.5 px-2 py-1 text-sm text-muted-foreground hover:text-foreground transition-[background-color,color] duration-150 ease-out rounded-md hover:bg-muted/50 outline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring/70 disabled:opacity-50 disabled:cursor-not-allowed"
          disabled={disabled}
        >
          <Bot className="h-3.5 w-3.5" />
          <span>Agents</span>
          <IconChevronDown className="h-3 w-3 shrink-0 opacity-50" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-[200px]">
        {isLoading ? (
          <div className="flex items-center justify-center py-4">
            <IconSpinner className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : agents.length === 0 ? (
          <div className="px-2 py-4 text-sm text-muted-foreground text-center">
            No agents found
          </div>
        ) : (
          agents.map((agent) => (
            <DropdownMenuItem
              key={agent.name}
              onClick={() => onAgentSelect(agent.name)}
              className="flex items-center gap-1.5"
            >
              <Bot className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <span>{agent.name}</span>
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
