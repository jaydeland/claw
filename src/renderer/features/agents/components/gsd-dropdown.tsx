"use client"

import { Rocket } from "lucide-react"
import { useMemo } from "react"
import { trpc } from "../../../lib/trpc"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "../../../components/ui/dropdown-menu"
import { IconChevronDown, IconSpinner } from "../../../components/ui/icons"

interface GsdDropdownProps {
  onGsdSelect: (gsdName: string) => void
  disabled?: boolean
}

interface GsdItem {
  name: string
  description: string
  source: "skill" | "bundled"
}

export function GsdDropdown({
  onGsdSelect,
  disabled = false,
}: GsdDropdownProps) {
  // Fetch skills from filesystem (includes GSD skills with gsd: prefix)
  const { data: skills = [], isLoading: skillsLoading } = trpc.skills.listEnabled.useQuery(undefined, {
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
    refetchOnWindowFocus: false,
  })

  // Fetch bundled GSD commands
  const { data: bundledCommands = [], isLoading: commandsLoading } = trpc.gsd.listCommands.useQuery(undefined, {
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
    refetchOnWindowFocus: false,
  })

  const isLoading = skillsLoading || commandsLoading

  // Combine GSD items: skills with gsd: prefix + bundled GSD commands
  const gsdItems = useMemo(() => {
    const items: GsdItem[] = []
    const seenNames = new Set<string>()

    // Add skills with gsd: prefix
    for (const skill of skills) {
      if (skill.name.startsWith("gsd:")) {
        if (!seenNames.has(skill.name)) {
          seenNames.add(skill.name)
          items.push({
            name: skill.name,
            description: skill.description || "",
            source: "skill",
          })
        }
      }
    }

    // Add bundled GSD commands (only if not already present from skills)
    for (const cmd of bundledCommands) {
      if (!seenNames.has(cmd.name)) {
        seenNames.add(cmd.name)
        items.push({
          name: cmd.name,
          description: cmd.description || "",
          source: "bundled",
        })
      }
    }

    // Sort by name (removing gsd: prefix for sorting)
    return items.sort((a, b) => {
      const nameA = a.name.replace(/^gsd:/, "")
      const nameB = b.name.replace(/^gsd:/, "")
      return nameA.localeCompare(nameB)
    })
  }, [skills, bundledCommands])

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="flex items-center gap-1.5 px-2 py-1 text-sm text-muted-foreground hover:text-foreground transition-[background-color,color] duration-150 ease-out rounded-md hover:bg-muted/50 outline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring/70 disabled:opacity-50 disabled:cursor-not-allowed"
          disabled={disabled}
        >
          <Rocket className="h-3.5 w-3.5" />
          <IconChevronDown className="h-3 w-3 shrink-0 opacity-50" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-[280px] max-h-[400px] overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center py-4">
            <IconSpinner className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : gsdItems.length === 0 ? (
          <div className="px-2 py-4 text-sm text-muted-foreground text-center">
            No GSD commands found
          </div>
        ) : (
          <>
            {gsdItems.map((item) => {
              // Remove "gsd:" prefix for display
              const displayName = item.name.replace(/^gsd:/, "")
              return (
                <DropdownMenuItem
                  key={item.name}
                  onClick={() => onGsdSelect(item.name)}
                  className="flex items-center gap-1.5 px-2"
                >
                  <Rocket className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <div className="flex flex-col min-w-0">
                    <span className="truncate">{displayName}</span>
                    {item.description && (
                      <span className="text-xs text-muted-foreground truncate">
                        {item.description}
                      </span>
                    )}
                  </div>
                </DropdownMenuItem>
              )
            })}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
