"use client"

import React, { useMemo, useState } from "react"
import { Sparkles, ChevronRight } from "lucide-react"
import { cn } from "../../../lib/utils"
import { trpc } from "../../../lib/trpc"
import { Input } from "../../../components/ui/input"
import { selectedProjectAtom } from "../../agents/atoms"
import { selectWorkflowItemAtom } from "../../workflows/atoms"
import { useAtom, useAtomValue, useSetAtom } from "jotai"
import { groupWorkflowsHierarchically } from "../../workflows/lib/parse-workflow-name"
import { CollapsibleWorkflowGroup } from "./collapsible-workflow-group"
import { skillsExpansionAtom } from "../atoms/workflow-expansion-atoms"

interface SkillsTabContentProps {
  className?: string
  isMobileFullscreen?: boolean
}

type SkillItem = {
  id: string // Directory name (matches workflow graph)
  name: string // Display name (from frontmatter)
  path: string
  source: "user" | "project" | "custom"
  description?: string
  type: "skill" | "command"
}

export function SkillsTabContent({ className, isMobileFullscreen }: SkillsTabContentProps) {
  const [searchQuery, setSearchQuery] = useState("")
  const selectedProject = useAtomValue(selectedProjectAtom)
  const selectWorkflowItem = useSetAtom(selectWorkflowItemAtom)
  const [expandedGroups, setExpandedGroups] = useAtom(skillsExpansionAtom)

  // Fetch combined skills and commands using tRPC
  const { data: items = [], isLoading } = trpc.skills.listCombined.useQuery({
    cwd: selectedProject?.path,
  })

  // Filter items by search query
  const filteredItems = useMemo(() => {
    if (!searchQuery.trim()) return items

    const query = searchQuery.toLowerCase()
    return items.filter(
      (item) =>
        item.name.toLowerCase().includes(query) ||
        item.description?.toLowerCase().includes(query),
    )
  }, [items, searchQuery])

  // Group items hierarchically with sub-groups
  const hierarchicalGroups = useMemo(() => {
    return groupWorkflowsHierarchically(filteredItems)
  }, [filteredItems])

  // Toggle group expansion (supports both namespaces and sub-groups)
  const toggleGroup = (key: string) => {
    setExpandedGroups((prev) => {
      const newSet = new Set(prev)
      if (newSet.has(key)) {
        newSet.delete(key)
      } else {
        newSet.add(key)
      }
      return newSet
    })
  }

  // Render a single item
  const renderItem = (item: SkillItem & { displayName: string }) => (
    <button
      key={item.path}
      onClick={() => {
        // Use combined action to set both category and node atomically
        selectWorkflowItem({
          node: {
            id: item.id, // Use id (directory name) for matching with workflow graph
            name: item.name, // Use name (display name from frontmatter)
            type: item.type,
            sourcePath: item.path,
          },
          category: "skills",
        })
      }}
      className="group flex items-start gap-2 px-2 py-1 rounded-md hover:bg-foreground/10 cursor-pointer w-full text-left"
    >
      <Sparkles className="h-3.5 w-3.5 flex-shrink-0 mt-0.5 text-muted-foreground" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-medium text-foreground truncate flex-1">
            {item.displayName}
          </span>
          {item.source === "project" && (
            <div className="h-1.5 w-1.5 rounded-full bg-blue-500 flex-shrink-0" title="Project-specific" />
          )}
        </div>
      </div>
      <ChevronRight className="h-3 w-3 text-muted-foreground/50 flex-shrink-0 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity" />
    </button>
  )

  return (
    <div className={cn("flex flex-col h-full", className)}>
      {/* Search */}
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
            <span className="text-sm text-muted-foreground">Loading...</span>
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-20 gap-2">
            <Sparkles className="h-6 w-6 text-muted-foreground/50" />
            <span className="text-sm text-muted-foreground">
              {searchQuery ? "No skills found" : "No skills available"}
            </span>
          </div>
        ) : (
          <div className="space-y-1">
            {hierarchicalGroups.map((nsGroup) => (
              <CollapsibleWorkflowGroup
                key={nsGroup.namespace}
                title={nsGroup.namespace}
                count={nsGroup.totalCount}
                expanded={expandedGroups.has(nsGroup.namespace)}
                onToggle={() => toggleGroup(nsGroup.namespace)}
              >
                {/* Sub-groups (if any) */}
                {nsGroup.subGroups.map((subGroup) => {
                  const subGroupKey = `${nsGroup.namespace}:${subGroup.name}`
                  return (
                    <CollapsibleWorkflowGroup
                      key={subGroupKey}
                      title={subGroup.name}
                      count={subGroup.items.length}
                      expanded={expandedGroups.has(subGroupKey)}
                      onToggle={() => toggleGroup(subGroupKey)}
                      nested
                    >
                      {subGroup.items.map(renderItem)}
                    </CollapsibleWorkflowGroup>
                  )
                })}

                {/* Flat items (no sub-group) */}
                {nsGroup.flatItems.map(renderItem)}
              </CollapsibleWorkflowGroup>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
