"use client"

import React, { useMemo, useState } from "react"
import { Sparkles, ChevronRight } from "lucide-react"
import { cn } from "../../../lib/utils"
import { trpc } from "../../../lib/trpc"
import { Input } from "../../../components/ui/input"
import { selectedProjectAtom } from "../../agents/atoms"
import { useAtomValue } from "jotai"

interface SkillsTabContentProps {
  className?: string
  isMobileFullscreen?: boolean
}

/**
 * Badge component to show the source of a skill
 */
function SourceBadge({ source }: { source: "user" | "project" | "custom" }) {
  const colors = {
    project: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
    user: "bg-green-500/10 text-green-600 dark:text-green-400",
    custom: "bg-purple-500/10 text-purple-600 dark:text-purple-400",
  }

  return (
    <span
      className={cn(
        "text-[10px] px-1.5 py-0.5 rounded-sm font-medium uppercase tracking-wide",
        colors[source],
      )}
    >
      {source}
    </span>
  )
}

export function SkillsTabContent({ className, isMobileFullscreen }: SkillsTabContentProps) {
  const [searchQuery, setSearchQuery] = useState("")
  const selectedProject = useAtomValue(selectedProjectAtom)

  // Fetch skills using tRPC
  const { data: skills, isLoading } = trpc.skills.list.useQuery({
    cwd: selectedProject?.path,
  })

  // Filter skills by search query
  const filteredSkills = useMemo(() => {
    if (!skills) return []
    if (!searchQuery.trim()) return skills

    const query = searchQuery.toLowerCase()
    return skills.filter(
      (skill) =>
        skill.name.toLowerCase().includes(query) ||
        skill.description?.toLowerCase().includes(query),
    )
  }, [skills, searchQuery])

  // Group skills by source
  const groupedSkills = useMemo(() => {
    const groups: Record<string, typeof filteredSkills> = {
      project: [],
      user: [],
      custom: [],
    }

    for (const skill of filteredSkills) {
      groups[skill.source].push(skill)
    }

    return groups
  }, [filteredSkills])

  const sourceLabels: Record<string, string> = {
    project: "Project Skills",
    user: "User Skills",
    custom: "Custom Skills",
  }

  return (
    <div className={cn("flex flex-col h-full", className)}>
      {/* Search input */}
      <div className="px-2 pb-2 flex-shrink-0">
        <Input
          placeholder="Search skills..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className={cn(
            "w-full rounded-lg text-sm bg-muted border border-input placeholder:text-muted-foreground/40",
            isMobileFullscreen ? "h-10" : "h-7",
          )}
        />
      </div>

      {/* Skills list */}
      <div className="flex-1 overflow-y-auto px-2 scrollbar-thin scrollbar-thumb-muted-foreground/20 scrollbar-track-transparent">
        {isLoading ? (
          <div className="flex items-center justify-center h-20">
            <span className="text-sm text-muted-foreground">Loading skills...</span>
          </div>
        ) : filteredSkills.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-20 gap-2">
            <Sparkles className="h-6 w-6 text-muted-foreground/50" />
            <span className="text-sm text-muted-foreground">
              {searchQuery ? "No skills found" : "No skills available"}
            </span>
          </div>
        ) : (
          Object.entries(groupedSkills)
            .filter(([_, skillList]) => skillList.length > 0)
            .map(([source, skillList]) => (
              <div key={source} className="mb-3">
                <div className="flex items-center h-4 mb-1 px-1">
                  <h3 className="text-xs font-medium text-muted-foreground whitespace-nowrap">
                    {sourceLabels[source]}
                  </h3>
                </div>
                <div className="space-y-0.5">
                  {skillList.map((skill) => (
                    <div
                      key={skill.path}
                      className="group flex items-start gap-2 px-2 py-1.5 rounded-md hover:bg-foreground/5 cursor-default"
                    >
                      <Sparkles className="h-4 w-4 flex-shrink-0 mt-0.5 text-muted-foreground" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-foreground truncate">
                            {skill.name}
                          </span>
                          <SourceBadge source={skill.source} />
                        </div>
                        {skill.description && (
                          <p className="text-xs text-muted-foreground truncate mt-0.5">
                            {skill.description}
                          </p>
                        )}
                      </div>
                      <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/50 flex-shrink-0 mt-1 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  ))}
                </div>
              </div>
            ))
        )}
      </div>
    </div>
  )
}
