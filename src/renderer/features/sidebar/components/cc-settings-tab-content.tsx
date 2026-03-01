"use client"

import React, { useState } from "react"
import { Network, Cpu, Server, Settings2, ChevronDown, ChevronRight, LayoutDashboard, ShieldCheck, Webhook, TerminalSquare } from "lucide-react"
import { useAtom } from "jotai"
import { cn } from "../../../lib/utils"
import { selectedSettingsCategoryAtom, type SettingsCategory } from "../../agents/atoms"

interface SubCategory {
  id: string
  label: string
  icon: React.ComponentType<{ className?: string }>
}

interface SettingsSection {
  id: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  subCategories: SubCategory[]
}

const SETTINGS_SECTIONS: SettingsSection[] = [
  {
    id: "agents",
    label: "Agents",
    icon: Network,
    subCategories: [
      { id: "agents-overview", label: "Overview", icon: LayoutDashboard },
      { id: "agents-permissions", label: "Permissions", icon: ShieldCheck },
    ],
  },
  {
    id: "skills",
    label: "Skills",
    icon: Cpu,
    subCategories: [
      { id: "skills-overview", label: "Overview", icon: LayoutDashboard },
      { id: "skills-hooks", label: "Hooks", icon: Webhook },
    ],
  },
  {
    id: "mcps",
    label: "MCPs",
    icon: Server,
    subCategories: [
      { id: "mcps-overview", label: "Overview", icon: LayoutDashboard },
      { id: "mcps-permissions", label: "Permissions", icon: ShieldCheck },
    ],
  },
  {
    id: "settings",
    label: "Settings",
    icon: Settings2,
    subCategories: [
      { id: "overview", label: "Overview", icon: LayoutDashboard },
      { id: "permissions", label: "Permissions", icon: ShieldCheck },
      { id: "hooks", label: "Hooks", icon: Webhook },
      { id: "status-line", label: "Status Line", icon: TerminalSquare },
    ],
  },
]

interface CcSettingsTabContentProps {
  className?: string
  isMobileFullscreen?: boolean
}

export function CcSettingsTabContent({ className }: CcSettingsTabContentProps) {
  const [selectedCategory, setSelectedCategory] = useAtom(selectedSettingsCategoryAtom)
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(["settings"]))

  const toggleSection = (sectionId: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev)
      if (next.has(sectionId)) {
        next.delete(sectionId)
      } else {
        next.add(sectionId)
      }
      return next
    })
  }

  return (
    <div className={cn("flex flex-col h-full", className)}>
      {/* Header */}
      <div className="px-3 py-2 border-b border-border/50 flex-shrink-0">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
          Claude Code
        </p>
      </div>

      {/* Category tree */}
      <div className="flex-1 overflow-y-auto p-1.5 scrollbar-thin scrollbar-thumb-muted-foreground/20 scrollbar-track-transparent">
        <div className="space-y-0.5">
          {SETTINGS_SECTIONS.map((section) => {
            const SectionIcon = section.icon
            const isExpanded = expandedSections.has(section.id)
            const subCount = section.subCategories.length

            return (
              <div key={section.id} className="space-y-0.5">
                {/* Section header */}
                <button
                  type="button"
                  onClick={() => toggleSection(section.id)}
                  className="w-full flex items-center gap-1.5 pl-2 pr-2 py-1 rounded-md text-left hover:bg-foreground/5 transition-colors"
                >
                  {isExpanded ? (
                    <ChevronDown className="h-3 w-3 flex-shrink-0 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="h-3 w-3 flex-shrink-0 text-muted-foreground" />
                  )}
                  <SectionIcon className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
                  <span className="text-xs font-medium text-muted-foreground flex-1 truncate">{section.label}</span>
                  <span className="text-[10px] text-muted-foreground">{subCount}</span>
                </button>

                {/* Sub-categories */}
                {isExpanded && (
                  <div className="ml-[18px] pl-3 space-y-0.5 relative">
                    {/* Tree line connectors */}
                    <div className="absolute -left-3 top-0 bottom-0 w-px bg-muted-foreground/20" />

                    {section.subCategories.map((sub, idx) => {
                      const SubIcon = sub.icon
                      const isActive = selectedCategory === (sub.id as SettingsCategory)
                      const isLast = idx === section.subCategories.length - 1

                      return (
                        <div key={sub.id} className="relative">
                          {/* Tree line connector */}
                          <div
                            className={cn(
                              "absolute -left-3 w-px bg-muted-foreground/20",
                              isLast ? "top-0 h-1/2" : "top-0 bottom-0"
                            )}
                          />
                          <div className="absolute -left-3 top-1/2 w-2.5 h-px bg-muted-foreground/20" />

                          <button
                            type="button"
                            onClick={() => setSelectedCategory(sub.id as SettingsCategory)}
                            className={cn(
                              "flex items-center gap-2.5 w-full px-2.5 py-2 rounded-md text-left transition-colors",
                              isActive
                                ? "bg-primary/10 text-primary"
                                : "text-muted-foreground hover:text-foreground hover:bg-foreground/8"
                            )}
                          >
                            <SubIcon className="h-3.5 w-3.5 flex-shrink-0" />
                            <span className="text-xs font-medium truncate">{sub.label}</span>
                          </button>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
