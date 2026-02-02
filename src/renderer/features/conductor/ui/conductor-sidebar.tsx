/**
 * Conductor Sidebar Content - Iteration 5 (Final)
 *
 * Complete sidebar with all features, polish, and keyboard shortcuts
 */

"use client"

import { useState, useMemo, useEffect } from "react"
import { useAtom, useSetAtom } from "jotai"
import { Plus, Circle, CheckCircle2, AlertCircle, Search, Filter, ChevronRight, ChevronDown } from "lucide-react"
import { cn } from "../../../lib/utils"
import { trpc } from "../../../lib/trpc"
import { Input } from "../../../components/ui/input"
import { Button } from "../../../components/ui/button"
import { Checkbox } from "../../../components/ui/checkbox"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../../components/ui/select"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "../../../components/ui/popover"
import {
  selectedConductorJobIdAtom,
  newJobFormOpenAtom,
  conductorSearchQueryAtom,
  conductorStatusFilterAtom,
  conductorTypeFilterAtom,
  newJobParentIdAtom,
} from "../atoms"
import type { ConductorJob } from "../../../../main/lib/db/schema/conductor"
import { WorkspaceSelector } from "./components/workspace-selector"
import { GsdImportDialog } from "./components/gsd-import-dialog"

interface ConductorSidebarProps {
  className?: string
}

const STATUS_ICONS = {
  to_do: Circle,
  in_progress: AlertCircle,
  review: AlertCircle,
  done: CheckCircle2,
  blocked: AlertCircle,
}

const STATUS_COLORS = {
  to_do: "text-muted-foreground",
  in_progress: "text-blue-500",
  review: "text-amber-500",
  done: "text-green-500",
  blocked: "text-red-500",
}

const TYPE_BADGES = {
  feature: { label: "Feature", color: "bg-blue-500/10 text-blue-500" },
  bug: { label: "Bug", color: "bg-red-500/10 text-red-500" },
  refactor: { label: "Refactor", color: "bg-purple-500/10 text-purple-500" },
  chore: { label: "Chore", color: "bg-gray-500/10 text-gray-500" },
  docs: { label: "Docs", color: "bg-green-500/10 text-green-500" },
  test: { label: "Test", color: "bg-amber-500/10 text-amber-500" },
}

const STATUS_OPTIONS = [
  { value: "to_do", label: "To Do" },
  { value: "in_progress", label: "In Progress" },
  { value: "review", label: "Review" },
  { value: "done", label: "Done" },
  { value: "blocked", label: "Blocked" },
] as const

const TYPE_OPTIONS = [
  { value: "feature", label: "Feature" },
  { value: "bug", label: "Bug" },
  { value: "refactor", label: "Refactor" },
  { value: "chore", label: "Chore" },
  { value: "docs", label: "Docs" },
  { value: "test", label: "Test" },
] as const

interface JobTreeNode extends ConductorJob {
  children?: JobTreeNode[]
}

function JobListItem({
  job,
  isSelected,
  onClick,
  level = 0,
  hasChildren = false,
  isExpanded = false,
  onToggleExpand,
}: {
  job: ConductorJob
  isSelected: boolean
  onClick: () => void
  level?: number
  hasChildren?: boolean
  isExpanded?: boolean
  onToggleExpand?: () => void
}) {
  const StatusIcon = STATUS_ICONS[job.status as keyof typeof STATUS_ICONS] || Circle
  const statusColor = STATUS_COLORS[job.status as keyof typeof STATUS_COLORS] || "text-muted-foreground"
  const typeBadge = TYPE_BADGES[job.type as keyof typeof TYPE_BADGES]
  const paddingLeft = 8 + level * 16

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full text-left px-2 py-2 rounded-md transition-colors",
        isSelected
          ? "bg-primary/10 text-foreground"
          : "hover:bg-foreground/5 text-foreground"
      )}
      style={{ paddingLeft: paddingLeft }}
    >
      <div className="flex items-start gap-2">
        {hasChildren && onToggleExpand ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onToggleExpand()
            }}
            className="flex-shrink-0 mt-0.5"
          >
            {isExpanded ? (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            )}
          </button>
        ) : (
          <div className="w-4 flex-shrink-0" />
        )}
        <StatusIcon className={cn("h-4 w-4 flex-shrink-0 mt-0.5", statusColor)} />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium truncate">{job.title}</div>
          {typeBadge && (
            <div className="mt-1">
              <span className={cn("text-[10px] px-1.5 py-0.5 rounded", typeBadge.color)}>
                {typeBadge.label}
              </span>
            </div>
          )}
        </div>
      </div>
    </button>
  )
}

export function ConductorSidebar({ className }: ConductorSidebarProps) {
  const [showForm, setShowForm] = useAtom(newJobFormOpenAtom)
  const [selectedJobId, setSelectedJobId] = useAtom(selectedConductorJobIdAtom)
  const [searchQuery, setSearchQuery] = useAtom(conductorSearchQueryAtom)
  const [statusFilter, setStatusFilter] = useAtom(conductorStatusFilterAtom)
  const [typeFilter, setTypeFilter] = useAtom(conductorTypeFilterAtom)
  const [parentId, setParentId] = useAtom(newJobParentIdAtom)

  const [title, setTitle] = useState("")
  const [intent, setIntent] = useState("")
  const [type, setType] = useState<"feature" | "bug" | "refactor" | "chore">("feature")
  const [expandedJobIds, setExpandedJobIds] = useState<Set<string>>(new Set())

  const utils = trpc.useUtils()

  // Fetch all jobs
  const { data: jobs, isLoading } = trpc.conductor.jobs.list.useQuery({})

  // Subscribe to real-time job updates
  trpc.conductor.jobs.subscribe.useSubscription(undefined, {
    onData: (update) => {
      console.log("[Conductor] Job update:", update)
      utils.conductor.jobs.list.invalidate()
    },
  })

  // Build job tree structure
  const jobTree = useMemo(() => {
    if (!jobs) return []

    const jobMap = new Map<string, JobTreeNode>()
    const rootJobs: JobTreeNode[] = []

    // First pass: create map of all jobs
    jobs.forEach((job) => {
      jobMap.set(job.id, { ...job, children: [] })
    })

    // Second pass: build tree structure
    jobs.forEach((job) => {
      const node = jobMap.get(job.id)!
      if (job.parentId) {
        const parent = jobMap.get(job.parentId)
        if (parent) {
          parent.children = parent.children || []
          parent.children.push(node)
        } else {
          // Parent not found, treat as root
          rootJobs.push(node)
        }
      } else {
        rootJobs.push(node)
      }
    })

    return rootJobs
  }, [jobs])

  // Filter jobs based on search and filters
  const filteredJobs = useMemo(() => {
    const filterNode = (node: JobTreeNode): JobTreeNode | null => {
      // Search filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase()
        const matchesTitle = node.title.toLowerCase().includes(query)
        const matchesIntent = node.intent?.toLowerCase().includes(query)
        if (!matchesTitle && !matchesIntent) {
          // Check if any children match
          const matchingChildren = node.children?.map(filterNode).filter(Boolean) || []
          if (matchingChildren.length === 0) return null
          return { ...node, children: matchingChildren as JobTreeNode[] }
        }
      }

      // Status filter
      if (statusFilter.length > 0 && !statusFilter.includes(node.status as any)) {
        // Check if any children match
        const matchingChildren = node.children?.map(filterNode).filter(Boolean) || []
        if (matchingChildren.length === 0) return null
        return { ...node, children: matchingChildren as JobTreeNode[] }
      }

      // Type filter
      if (typeFilter.length > 0 && !typeFilter.includes(node.type as any)) {
        // Check if any children match
        const matchingChildren = node.children?.map(filterNode).filter(Boolean) || []
        if (matchingChildren.length === 0) return null
        return { ...node, children: matchingChildren as JobTreeNode[] }
      }

      // Node matches, include with filtered children
      const filteredChildren = node.children?.map(filterNode).filter(Boolean) || []
      return { ...node, children: filteredChildren as JobTreeNode[] }
    }

    return jobTree.map(filterNode).filter(Boolean) as JobTreeNode[]
  }, [jobTree, searchQuery, statusFilter, typeFilter])

  const createJobMutation = trpc.conductor.jobs.create.useMutation({
    onSuccess: (job) => {
      utils.conductor.jobs.list.invalidate()
      setTitle("")
      setIntent("")
      setType("feature")
      setParentId(null)
      setShowForm(false)
      setSelectedJobId(job.id)
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return

    createJobMutation.mutate({
      title: title.trim(),
      intent: intent.trim() || undefined,
      type,
      status: "to_do",
      parentId: parentId || undefined,
    })
  }

  const toggleStatusFilter = (status: typeof STATUS_OPTIONS[number]["value"]) => {
    setStatusFilter((prev) =>
      prev.includes(status) ? prev.filter((s) => s !== status) : [...prev, status]
    )
  }

  const toggleTypeFilter = (t: typeof TYPE_OPTIONS[number]["value"]) => {
    setTypeFilter((prev) =>
      prev.includes(t) ? prev.filter((type) => type !== t) : [...prev, t]
    )
  }

  const toggleExpanded = (jobId: string) => {
    setExpandedJobIds((prev) => {
      const next = new Set(prev)
      if (next.has(jobId)) {
        next.delete(jobId)
      } else {
        next.add(jobId)
      }
      return next
    })
  }

  const renderJobTree = (nodes: JobTreeNode[], level = 0): React.ReactNode[] => {
    const result: React.ReactNode[] = []

    nodes.forEach((node) => {
      const hasChildren = (node.children?.length || 0) > 0
      const isExpanded = expandedJobIds.has(node.id)

      result.push(
        <JobListItem
          key={node.id}
          job={node}
          isSelected={selectedJobId === node.id}
          onClick={() => setSelectedJobId(node.id)}
          level={level}
          hasChildren={hasChildren}
          isExpanded={isExpanded}
          onToggleExpand={() => toggleExpanded(node.id)}
        />
      )

      if (hasChildren && isExpanded && node.children) {
        result.push(...renderJobTree(node.children, level + 1))
      }
    })

    return result
  }

  const hasActiveFilters = statusFilter.length > 0 || typeFilter.length > 0

  // Get potential parent jobs for dropdown (exclude current job and its descendants)
  const parentJobOptions = useMemo(() => {
    if (!jobs) return []
    return jobs.filter((job) => !job.parentId) // Only show root-level jobs as parent options
  }, [jobs])

  // Count total jobs recursively
  const totalJobCount = useMemo(() => {
    const countJobs = (nodes: JobTreeNode[]): number => {
      return nodes.reduce((acc, node) => {
        return acc + 1 + (node.children ? countJobs(node.children) : 0)
      }, 0)
    }
    return countJobs(filteredJobs)
  }, [filteredJobs])

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd/Ctrl + K to focus search
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        const searchInput = document.querySelector('input[placeholder="Search jobs..."]') as HTMLInputElement
        searchInput?.focus()
      }
      // Cmd/Ctrl + N to open new job form
      if ((e.metaKey || e.ctrlKey) && e.key === 'n') {
        e.preventDefault()
        setShowForm(true)
      }
      // Escape to close form
      if (e.key === 'Escape' && showForm) {
        e.preventDefault()
        setShowForm(false)
        setParentId(null)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [showForm, setShowForm, setParentId])

  return (
    <div className={cn("flex flex-col h-full bg-background", className)}>
      {/* Header */}
      <div className="px-3 py-2 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold">Conductor Jobs</h2>
          {!isLoading && jobs && jobs.length > 0 && (
            <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
              {totalJobCount}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <WorkspaceSelector />
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className={cn("h-6 w-6 p-0", hasActiveFilters && "text-primary")}
              >
                <Filter className="h-4 w-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-64" align="end">
              <div className="space-y-4">
                <div>
                  <h4 className="text-sm font-medium mb-2">Status</h4>
                  <div className="space-y-2">
                    {STATUS_OPTIONS.map((option) => (
                      <div key={option.value} className="flex items-center space-x-2">
                        <Checkbox
                          id={`status-${option.value}`}
                          checked={statusFilter.includes(option.value)}
                          onCheckedChange={() => toggleStatusFilter(option.value)}
                        />
                        <label
                          htmlFor={`status-${option.value}`}
                          className="text-sm cursor-pointer"
                        >
                          {option.label}
                        </label>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <h4 className="text-sm font-medium mb-2">Type</h4>
                  <div className="space-y-2">
                    {TYPE_OPTIONS.map((option) => (
                      <div key={option.value} className="flex items-center space-x-2">
                        <Checkbox
                          id={`type-${option.value}`}
                          checked={typeFilter.includes(option.value)}
                          onCheckedChange={() => toggleTypeFilter(option.value)}
                        />
                        <label
                          htmlFor={`type-${option.value}`}
                          className="text-sm cursor-pointer"
                        >
                          {option.label}
                        </label>
                      </div>
                    ))}
                  </div>
                </div>
                {hasActiveFilters && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full h-7 text-xs"
                    onClick={() => {
                      setStatusFilter([])
                      setTypeFilter([])
                    }}
                  >
                    Clear Filters
                  </Button>
                )}
              </div>
            </PopoverContent>
          </Popover>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0"
            onClick={() => setShowForm(!showForm)}
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Search */}
      <div className="px-3 py-2 border-b border-border">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/50" />
          <Input
            placeholder="Search jobs..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-lg text-sm bg-muted border border-input placeholder:text-muted-foreground/40 pl-7 h-7"
          />
        </div>
      </div>

      {/* Job Creation Form */}
      {showForm && (
        <div className="px-3 py-3 border-b border-border bg-muted/30">
          <form onSubmit={handleSubmit} className="space-y-2">
            <div>
              <Input
                placeholder="Job title *"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="h-8 text-sm"
                autoFocus
              />
            </div>
            <div>
              <Input
                placeholder="Intent (optional)"
                value={intent}
                onChange={(e) => setIntent(e.target.value)}
                className="h-8 text-sm"
              />
            </div>
            <div>
              <Select value={type} onValueChange={(v: any) => setType(v)}>
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="feature">Feature</SelectItem>
                  <SelectItem value="bug">Bug</SelectItem>
                  <SelectItem value="refactor">Refactor</SelectItem>
                  <SelectItem value="chore">Chore</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Select
                value={parentId || "none"}
                onValueChange={(v) => setParentId(v === "none" ? null : v)}
              >
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue placeholder="Parent job (optional)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None (root level)</SelectItem>
                  {parentJobOptions.map((job) => (
                    <SelectItem key={job.id} value={job.id}>
                      {job.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2">
              <Button
                type="submit"
                size="sm"
                className="h-7 text-xs flex-1"
                disabled={!title.trim() || createJobMutation.isPending}
              >
                {createJobMutation.isPending ? "Creating..." : "Create Job"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={() => {
                  setShowForm(false)
                  setParentId(null)
                }}
              >
                Cancel
              </Button>
            </div>
          </form>
        </div>
      )}

      {/* Job List */}
      <div className="flex-1 overflow-y-auto px-2 py-2 scrollbar-thin scrollbar-thumb-muted-foreground/20 scrollbar-track-transparent">
        {isLoading ? (
          <div className="flex items-center justify-center h-20">
            <span className="text-sm text-muted-foreground">Loading jobs...</span>
          </div>
        ) : filteredJobs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-20 gap-2">
            <span className="text-sm text-muted-foreground text-center">
              {searchQuery || hasActiveFilters ? "No matching jobs" : "No jobs yet"}
            </span>
            {!searchQuery && !hasActiveFilters && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={() => setShowForm(true)}
              >
                <Plus className="h-3 w-3 mr-1" />
                Create First Job
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-1">
            {renderJobTree(filteredJobs)}
          </div>
        )}
      </div>

      {/* GSD Import Dialog */}
      <GsdImportDialog />
    </div>
  )
}
