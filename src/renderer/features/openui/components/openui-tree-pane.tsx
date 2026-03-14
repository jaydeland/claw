"use client"

import { memo, useCallback, useState } from "react"
import { useAtom, useAtomValue, useSetAtom } from "jotai"
import {
  ChevronRight,
  ChevronDown,
  Search,
  Package,
  Sparkles,
  Lightbulb,
  Check,
  Folder,
  Code2,
  Plus,
  Wand2,
} from "lucide-react"
import { cn } from "../../../lib/utils"
import { Button } from "../../../components/ui/button"
import { Input } from "../../../components/ui/input"
import { trpc } from "../../../lib/trpc"
import {
  openUIGeneratedComponentsAtom,
  openUISelectedComponentIdAtom,
  selectedOpenUIProjectIdAtom,
  openUIExpandedProjectsAtom,
  openUIExpandedSectionsAtom,
  openUITemplatesAtom,
  type GeneratedComponent,
  type OpenUITemplate,
} from "../atoms"
import { selectedProjectAtom } from "../../agents/atoms"

/**
 * OpenUI Tree Pane - Workspace-like tree for managing app addons
 * Shows projects with their generated components, installed addons, and templates
 */
export const OpenUITreePane = memo(function OpenUITreePane() {
  const [searchQuery, setSearchQuery] = useState("")
  const [expandedProjects, setExpandedProjects] = useAtom(openUIExpandedProjectsAtom)
  const [expandedSections, setExpandedSections] = useAtom(openUIExpandedSectionsAtom)
  const selectedProjectId = useAtomValue(selectedOpenUIProjectIdAtom)
  const currentProject = useAtomValue(selectedProjectAtom)
  const generatedComponents = useAtomValue(openUIGeneratedComponentsAtom)
  const templates = useAtomValue(openUITemplatesAtom)
  const setSelectedComponentId = useSetAtom(openUISelectedComponentIdAtom)

  // Get all projects that have OpenUI components
  const { data: projectsWithComponents } = trpc.openui.getProjectsWithComponents.useQuery()

  // Filter components by search
  const filteredComponents = searchQuery
    ? generatedComponents.filter(
        (c) =>
          c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          c.description?.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : generatedComponents

  // Group components by project
  const componentsByProject = filteredComponents.reduce((acc, component) => {
    if (!acc[component.projectId]) {
      acc[component.projectId] = []
    }
    acc[component.projectId].push(component)
    return acc
  }, {} as Record<string, GeneratedComponent[]>)

  // Toggle project expansion
  const toggleProject = useCallback((projectId: string) => {
    setExpandedProjects((prev) => {
      const next = new Set(prev)
      if (next.has(projectId)) {
        next.delete(projectId)
      } else {
        next.add(projectId)
      }
      return next
    })
  }, [setExpandedProjects])

  // Toggle section expansion
  const toggleSection = useCallback((sectionKey: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev)
      if (next.has(sectionKey)) {
        next.delete(sectionKey)
      } else {
        next.add(sectionKey)
      }
      return next
    })
  }, [setExpandedSections])

  // Handle component selection
  const handleSelectComponent = useCallback((componentId: string) => {
    setSelectedComponentId(componentId)
  }, [setSelectedComponentId])

  // Handle template selection - sets the prompt and switches to builder
  const handleSelectTemplate = useCallback((template: OpenUITemplate) => {
    // This would be handled by the parent component
    // For now, just log it
    console.log("Selected template:", template)
  }, [])

  return (
    <div className="h-full flex flex-col bg-muted/30">
      {/* Header */}
      <div className="p-2 border-b border-border flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          AI Extensions
        </span>
        <Button variant="ghost" size="icon" className="h-6 w-6">
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      {/* Search */}
      <div className="p-2 border-b border-border">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search components..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8 h-8"
          />
        </div>
      </div>

      {/* Tree */}
      <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
        {/* Current Project Section */}
        {currentProject && (
          <ProjectTreeSection
            project={currentProject}
            components={componentsByProject[currentProject.id] || []}
            templates={templates}
            isExpanded={expandedProjects.has(currentProject.id)}
            expandedSections={expandedSections}
            onToggleProject={() => toggleProject(currentProject.id)}
            onToggleSection={toggleSection}
            onSelectComponent={handleSelectComponent}
            onSelectTemplate={handleSelectTemplate}
            isCurrentProject
          />
        )}

        {/* Other Projects with Components */}
        {projectsWithComponents?.map((project) => {
          if (project.id === currentProject?.id) return null
          return (
            <ProjectTreeSection
              key={project.id}
              project={project}
              components={componentsByProject[project.id] || []}
              templates={[]}
              isExpanded={expandedProjects.has(project.id)}
              expandedSections={expandedSections}
              onToggleProject={() => toggleProject(project.id)}
              onToggleSection={toggleSection}
              onSelectComponent={handleSelectComponent}
              onSelectTemplate={handleSelectTemplate}
            />
          )
        })}

        {/* Global Templates Section (when no project selected) */}
        {!currentProject && (
          <TemplatesSection
            templates={templates}
            isExpanded={expandedSections.has("global-templates")}
            onToggle={() => toggleSection("global-templates")}
            onSelectTemplate={handleSelectTemplate}
          />
        )}
      </div>
    </div>
  )
})

interface ProjectTreeSectionProps {
  project: { id: string; name: string; path: string }
  components: GeneratedComponent[]
  templates: OpenUITemplate[]
  isExpanded: boolean
  expandedSections: Set<string>
  onToggleProject: () => void
  onToggleSection: (key: string) => void
  onSelectComponent: (componentId: string) => void
  onSelectTemplate: (template: OpenUITemplate) => void
  isCurrentProject?: boolean
}

const ProjectTreeSection = memo(function ProjectTreeSection({
  project,
  components,
  templates,
  isExpanded,
  expandedSections,
  onToggleProject,
  onToggleSection,
  onSelectComponent,
  onSelectTemplate,
  isCurrentProject,
}: ProjectTreeSectionProps) {
  const sectionKey = (section: string) => `${project.id}-${section}`
  const installedComponents = components.filter((c) => c.isInstalled)
  const generatedComponents = components.filter((c) => !c.isInstalled)

  return (
    <div className="space-y-0.5">
      {/* Project Header */}
      <button
        type="button"
        onClick={onToggleProject}
        className={cn(
          "w-full flex items-center gap-1.5 px-2 py-1.5 rounded-md text-sm",
          "border border-border/30",
          "hover:bg-accent hover:text-accent-foreground",
          "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1",
          isCurrentProject && "bg-primary/5 border-primary/20"
        )}
      >
        {isExpanded ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        )}
        <Folder className="h-4 w-4 text-muted-foreground" />
        <span className="font-medium truncate">{project.name}</span>
        {isCurrentProject && (
          <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary">
            Current
          </span>
        )}
      </button>

      {/* Project Contents */}
      {isExpanded && (
        <div className="ml-2 space-y-0.5">
          {/* Installed Components Section */}
          <TreeSection
            id={sectionKey("installed")}
            label="Installed"
            icon={Check}
            count={installedComponents.length}
            isExpanded={expandedSections.has(sectionKey("installed"))}
            onToggle={() => onToggleSection(sectionKey("installed"))}
            colorVariant="green"
          >
            {installedComponents.length > 0 ? (
              installedComponents.map((component) => (
                <ComponentTreeItem
                  key={component.id}
                  component={component}
                  isInstalled
                  onSelect={() => onSelectComponent(component.id)}
                />
              ))
            ) : (
              <EmptyState message="No installed components" />
            )}
          </TreeSection>

          {/* Generated Components Section */}
          <TreeSection
            id={sectionKey("generated")}
            label="Generated"
            icon={Code2}
            count={generatedComponents.length}
            isExpanded={expandedSections.has(sectionKey("generated"))}
            onToggle={() => onToggleSection(sectionKey("generated"))}
            colorVariant="blue"
          >
            {generatedComponents.length > 0 ? (
              generatedComponents.map((component) => (
                <ComponentTreeItem
                  key={component.id}
                  component={component}
                  onSelect={() => onSelectComponent(component.id)}
                />
              ))
            ) : (
              <EmptyState message="No generated components" />
            )}
          </TreeSection>

          {/* Templates Section */}
          {templates.length > 0 && (
            <TreeSection
              id={sectionKey("templates")}
              label="Templates"
              icon={Lightbulb}
              count={templates.length}
              isExpanded={expandedSections.has(sectionKey("templates"))}
              onToggle={() => onToggleSection(sectionKey("templates"))}
              colorVariant="orange"
            >
              {templates.map((template) => (
                <TemplateTreeItem
                  key={template.id}
                  template={template}
                  onSelect={() => onSelectTemplate(template)}
                />
              ))}
            </TreeSection>
          )}
        </div>
      )}
    </div>
  )
})

interface TemplatesSectionProps {
  templates: OpenUITemplate[]
  isExpanded: boolean
  onToggle: () => void
  onSelectTemplate: (template: OpenUITemplate) => void
}

const TemplatesSection = memo(function TemplatesSection({
  templates,
  isExpanded,
  onToggle,
  onSelectTemplate,
}: TemplatesSectionProps) {
  return (
    <div className="space-y-0.5">
      <button
        type="button"
        onClick={onToggle}
        className={cn(
          "w-full flex items-center gap-1.5 px-2 py-1.5 rounded-md text-sm",
          "border border-border/30",
          "hover:bg-accent hover:text-accent-foreground"
        )}
      >
        {isExpanded ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        )}
        <Lightbulb className="h-4 w-4 text-orange-500" />
        <span className="font-medium">Templates</span>
        <span className="ml-auto text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">
          {templates.length}
        </span>
      </button>

      {isExpanded && (
        <div className="ml-2 space-y-0.5">
          {templates.map((template) => (
            <TemplateTreeItem
              key={template.id}
              template={template}
              onSelect={() => onSelectTemplate(template)}
            />
          ))}
        </div>
      )}
    </div>
  )
})

interface TreeSectionProps {
  id: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  count?: number
  isExpanded: boolean
  onToggle: () => void
  children: React.ReactNode
  colorVariant?: "default" | "blue" | "green" | "orange" | "purple"
}

const TreeSection = memo(function TreeSection({
  label,
  icon: Icon,
  count,
  isExpanded,
  onToggle,
  children,
  colorVariant = "default",
}: TreeSectionProps) {
  const colorClasses = {
    default: {
      icon: "text-muted-foreground",
      text: "text-foreground",
      bg: "",
    },
    blue: {
      icon: "text-blue-600 dark:text-blue-400",
      text: "text-blue-700 dark:text-blue-300",
      bg: "bg-blue-50/50 dark:bg-blue-900/10",
    },
    green: {
      icon: "text-green-600 dark:text-green-400",
      text: "text-green-700 dark:text-green-300",
      bg: "bg-green-50/50 dark:bg-green-900/10",
    },
    orange: {
      icon: "text-orange-600 dark:text-orange-400",
      text: "text-orange-700 dark:text-orange-300",
      bg: "bg-orange-50/50 dark:bg-orange-900/10",
    },
    purple: {
      icon: "text-purple-600 dark:text-purple-400",
      text: "text-purple-700 dark:text-purple-300",
      bg: "bg-purple-50/50 dark:bg-purple-900/10",
    },
  }[colorVariant]

  return (
    <div
      className={cn(
        "rounded-md border border-border/30",
        isExpanded && colorClasses.bg
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        className={cn(
          "w-full flex items-center gap-1.5 px-2 py-1 rounded-md text-sm",
          "hover:bg-accent",
          "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1"
        )}
      >
        {isExpanded ? (
          <ChevronDown className={cn("h-4 w-4", colorClasses.icon)} />
        ) : (
          <ChevronRight className={cn("h-4 w-4", colorClasses.icon)} />
        )}
        <Icon className={cn("h-4 w-4", colorClasses.icon)} />
        <span className={cn("font-medium", colorClasses.text)}>{label}</span>
        {count !== undefined && count > 0 && (
          <span className="ml-auto text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">
            {count}
          </span>
        )}
      </button>
      {isExpanded && <div className="px-2 pb-1 space-y-0.5">{children}</div>}
    </div>
  )
})

interface ComponentTreeItemProps {
  component: GeneratedComponent
  isInstalled?: boolean
  onSelect: () => void
}

const ComponentTreeItem = memo(function ComponentTreeItem({
  component,
  isInstalled,
  onSelect,
}: ComponentTreeItemProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "w-full flex items-center gap-2 pl-[2ch] pr-2 py-1 rounded-md text-sm",
        "hover:bg-accent hover:text-accent-foreground",
        "text-left"
      )}
    >
      {isInstalled ? (
        <Check className="h-3.5 w-3.5 text-green-500" />
      ) : (
        <Wand2 className="h-3.5 w-3.5 text-blue-500" />
      )}
      <span className="truncate">{component.name}</span>
    </button>
  )
})

interface TemplateTreeItemProps {
  template: OpenUITemplate
  onSelect: () => void
}

const TemplateTreeItem = memo(function TemplateTreeItem({
  template,
  onSelect,
}: TemplateTreeItemProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "w-full flex items-center gap-2 pl-[2ch] pr-2 py-1 rounded-md text-sm",
        "hover:bg-accent hover:text-accent-foreground",
        "text-left"
      )}
    >
      <Lightbulb className="h-3.5 w-3.5 text-orange-500" />
      <span className="truncate">{template.name}</span>
    </button>
  )
})

function EmptyState({ message }: { message: string }) {
  return (
    <div className="pl-[2ch] py-2 text-sm text-muted-foreground italic">
      {message}
    </div>
  )
}
