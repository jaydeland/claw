"use client"

import React, { useMemo, useState } from "react"
import { Sparkles, ChevronRight } from "lucide-react"
import { cn } from "../../../lib/utils"
import { trpc } from "../../../lib/trpc"
import { Input } from "../../../components/ui/input"
import { selectedProjectAtom } from "../../agents/atoms"
import { selectWorkflowItemAtom } from "../../workflows/atoms"
import { useAtom, useAtomValue, useSetAtom } from "jotai"
import { groupWorkflowsByNamespace } from "../../workflows/lib/parse-workflow-name"
import { CollapsibleWorkflowGroup } from "./collapsible-workflow-group"
import { skillsExpansionAtom } from "../atoms/workflow-expansion-atoms"

interface SkillsTabContentProps {
  className?: string
  isMobileFullscreen?: boolean
}


export function SkillsTabContent({ className, isMobileFullscreen }: SkillsTabContentProps) {
  const [searchQuery, setSearchQuery] = useState("")
  const selectedProject = useAtomValue(selectedProjectAtom)
  const selectWorkflowItem = useSetAtom(selectWorkflowItemAtom)
  const [expandedGroups, setExpandedGroups] = useAtom(skillsExpansionAtom)

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

  // Group skills by namespace
  const groupedSkills = useMemo(() => {
    return groupWorkflowsByNamespace(filteredSkills)
  }, [filteredSkills])

  // Toggle group expansion
  const toggleGroup = (namespace: string) => {
    setExpandedGroups((prev) => {
      const newSet = new Set(prev)
      if (newSet.has(namespace)) {
        newSet.delete(namespace)
      } else {
        newSet.add(namespace)
      }
      return newSet
    })
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
          <div className="space-y-1">
            {Object.entries(groupedSkills).map(([namespace, skills]) => (
              <CollapsibleWorkflowGroup
                key={namespace}
                title={namespace}
                count={skills.length}
                expanded={expandedGroups.has(namespace)}
                onToggle={() => toggleGroup(namespace)}
              >
                {skills.map((skill) => (
                  <button
                    key={skill.path}
                    onClick={() => {
                      // Use combined action to set both category and node atomically
                      selectWorkflowItem({
                        node: {
                          id: skill.name,
                          name: skill.name,
                          type: "skill",
                          sourcePath: skill.path,
                        },
                        category: "skills",
                      })
                    }}
                    className="group flex items-start gap-2 px-2 py-1 rounded-md hover:bg-foreground/5 cursor-pointer w-full text-left"
                  >
                    <Sparkles className="h-3.5 w-3.5 flex-shrink-0 mt-0.5 text-muted-foreground" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-medium text-foreground truncate flex-1">
                          {skill.name}
                        </span>
                        {skill.source === "project" && (
                          <div className="h-1.5 w-1.5 rounded-full bg-blue-500 flex-shrink-0" title="Project-specific" />
                        )}
                      </div>
                    </div>
                    <ChevronRight className="h-3 w-3 text-muted-foreground/50 flex-shrink-0 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </button>
                ))}
              </CollapsibleWorkflowGroup>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
