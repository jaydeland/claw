"use client"

import { Zap } from "lucide-react"
import { trpc } from "../../../lib/trpc"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "../../../components/ui/dropdown-menu"
import { IconChevronDown, IconSpinner, SkillIcon } from "../../../components/ui/icons"

interface SkillsDropdownProps {
  onSkillSelect: (skillName: string) => void
  disabled?: boolean
}

export function SkillsDropdown({
  onSkillSelect,
  disabled = false,
}: SkillsDropdownProps) {
  // Fetch skills from filesystem (includes GSD commands with gsd: prefix)
  const { data: skills = [], isLoading } = trpc.skills.listEnabled.useQuery(undefined, {
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
    refetchOnWindowFocus: false,
  })

  // Filter out GSD commands - only show non-GSD skills
  const userSkills = skills.filter((skill) => !skill.name.startsWith("gsd:"))

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="flex items-center gap-1.5 px-2 py-1 text-sm text-muted-foreground hover:text-foreground transition-[background-color,color] duration-150 ease-out rounded-md hover:bg-muted/50 outline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring/70 disabled:opacity-50 disabled:cursor-not-allowed"
          disabled={disabled}
        >
          <Zap className="h-3.5 w-3.5" />
          <span>Skills</span>
          <IconChevronDown className="h-3 w-3 shrink-0 opacity-50" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-[240px] max-h-[400px] overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center py-4">
            <IconSpinner className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : userSkills.length === 0 ? (
          <div className="px-2 py-4 text-sm text-muted-foreground text-center">
            No skills found
          </div>
        ) : (
          <>
            {userSkills.map((skill) => (
              <DropdownMenuItem
                key={skill.name}
                onClick={() => onSkillSelect(skill.name)}
                className="flex items-center gap-1.5 px-2"
              >
                <SkillIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <div className="flex flex-col min-w-0">
                  <span className="truncate">{skill.name}</span>
                  {skill.description && (
                    <span className="text-xs text-muted-foreground truncate">
                      {skill.description}
                    </span>
                  )}
                </div>
              </DropdownMenuItem>
            ))}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
