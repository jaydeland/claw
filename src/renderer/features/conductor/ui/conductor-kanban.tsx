/**
 * Conductor Kanban Board - Iteration 5 (Final)
 *
 * Complete Kanban board with drag-and-drop, optimistic updates, real-time subscriptions,
 * and job selection for detailed view.
 *
 * Features:
 * - 5 status columns (To Do, In Progress, Review, Done, Blocked)
 * - Drag-and-drop between columns and within columns
 * - Optimistic UI updates for instant feedback
 * - Real-time subscriptions for collaborative editing
 * - Click to select job (placeholder for Task 4.3 integration)
 * - Animations for new jobs and status transitions
 * - Empty states with helpful messaging
 * - Color-coded columns with status indicators
 */

import React, { useMemo, useState, useEffect, useCallback } from 'react'
import {
  DndContext,
  DragOverlay,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
  type DragOverEvent
} from '@dnd-kit/core'
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { trpc } from '../../../lib/trpc'

// ============ TYPES ============

type JobStatus = 'to_do' | 'in_progress' | 'review' | 'done' | 'blocked'

interface Column {
  id: JobStatus
  title: string
  description: string
  color: string
}

interface Job {
  id: string
  title: string
  type?: string
  status: JobStatus
  parentId?: string | null
  position: number
}

// ============ CONSTANTS ============

const COLUMNS: Column[] = [
  {
    id: 'to_do',
    title: 'To Do',
    description: 'Jobs ready to start',
    color: 'bg-slate-500'
  },
  {
    id: 'in_progress',
    title: 'In Progress',
    description: 'Currently working on',
    color: 'bg-blue-500'
  },
  {
    id: 'review',
    title: 'Review',
    description: 'Ready for review',
    color: 'bg-amber-500'
  },
  {
    id: 'done',
    title: 'Done',
    description: 'Completed jobs',
    color: 'bg-green-500'
  },
  {
    id: 'blocked',
    title: 'Blocked',
    description: 'Waiting on dependencies',
    color: 'bg-red-500'
  }
]

// ============ UTILITY FUNCTIONS ============

/**
 * Find the column a job is currently in
 */
function findColumnByJobId(
  jobsByStatus: Record<JobStatus, Job[]>,
  jobId: string
): JobStatus | null {
  for (const [status, jobs] of Object.entries(jobsByStatus)) {
    if (jobs.some(j => j.id === jobId)) {
      return status as JobStatus
    }
  }
  return null
}

// ============ COMPONENTS ============

/**
 * Empty state for columns with no jobs
 */
function EmptyColumnState({ status }: { status: JobStatus }) {
  const messages: Record<JobStatus, string> = {
    to_do: 'No jobs to do. Create a new job to get started.',
    in_progress: 'No jobs in progress. Drag jobs here to start working.',
    review: 'No jobs in review. Move completed jobs here for review.',
    done: 'No completed jobs yet. Keep working!',
    blocked: 'No blocked jobs. Great!'
  }

  return (
    <div className="flex flex-col items-center justify-center py-8 px-4 text-center">
      <p className="text-sm text-muted-foreground">{messages[status]}</p>
    </div>
  )
}

/**
 * Draggable job card component with click selection
 */
function DraggableJobCard({
  job,
  isOverlay = false,
  isNew = false,
  isSelected = false,
  onSelect
}: {
  job: Job
  isOverlay?: boolean
  isNew?: boolean
  isSelected?: boolean
  onSelect?: (jobId: string) => void
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: job.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.3 : 1
  }

  const handleClick = useCallback((e: React.MouseEvent) => {
    // Don't trigger selection during drag
    if (isDragging) return

    e.stopPropagation()
    onSelect?.(job.id)
  }, [isDragging, job.id, onSelect])

  const className = isOverlay
    ? "bg-card border-2 border-primary rounded-lg p-3 shadow-2xl"
    : `bg-card border rounded-lg p-3 mb-2 transition-all cursor-grab active:cursor-grabbing ${
        isSelected
          ? 'border-primary ring-2 ring-primary/20 shadow-md'
          : 'border-border hover:border-accent hover:shadow-md'
      } ${isNew ? 'animate-in slide-in-from-top-2 duration-300' : ''}`

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={handleClick}
      className={className}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <h4 className="text-sm font-medium text-foreground line-clamp-2">
          {job.title}
        </h4>
        {job.type && (
          <span className="text-xs px-2 py-0.5 rounded-full bg-accent text-accent-foreground whitespace-nowrap">
            {job.type}
          </span>
        )}
      </div>
      {job.parentId && (
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <span>↳</span>
          <span>Has parent</span>
        </div>
      )}
    </div>
  )
}

/**
 * Droppable column in the Kanban board
 */
function DroppableColumn({
  column,
  jobs,
  isOver,
  newJobIds,
  selectedJobId,
  onSelectJob
}: {
  column: Column
  jobs: Job[]
  isOver: boolean
  newJobIds: Set<string>
  selectedJobId: string | null
  onSelectJob: (jobId: string) => void
}) {
  const jobIds = useMemo(() => jobs.map(job => job.id), [jobs])

  return (
    <div
      className={`flex flex-col h-full rounded-lg transition-all ${
        isOver ? 'bg-muted/50 ring-2 ring-accent shadow-lg' : 'bg-muted/30'
      }`}
    >
      {/* Column Header */}
      <div className="flex-none px-4 py-3 border-b border-border bg-card/50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${column.color} shadow-sm`} />
            <div>
              <h3 className="text-sm font-semibold text-foreground">
                {column.title}
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                {column.description}
              </p>
            </div>
          </div>
          <div className="flex items-center justify-center min-w-6 h-6 px-2 rounded-full bg-accent text-accent-foreground text-xs font-medium shadow-sm">
            {jobs.length}
          </div>
        </div>
      </div>

      {/* Column Content - Droppable Area */}
      <div className="flex-1 overflow-y-auto p-3 scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent">
        <SortableContext items={jobIds} strategy={verticalListSortingStrategy}>
          {jobs.length === 0 ? (
            <EmptyColumnState status={column.id} />
          ) : (
            <div className="space-y-2">
              {jobs.map((job) => (
                <DraggableJobCard
                  key={job.id}
                  job={job}
                  isNew={newJobIds.has(job.id)}
                  isSelected={selectedJobId === job.id}
                  onSelect={onSelectJob}
                />
              ))}
            </div>
          )}
        </SortableContext>
      </div>
    </div>
  )
}

/**
 * Main Kanban Board Component
 */
export function ConductorKanban() {
  const [activeJob, setActiveJob] = useState<Job | null>(null)
  const [localJobs, setLocalJobs] = useState<Job[]>([])
  const [isDraggingOver, setIsDraggingOver] = useState<JobStatus | null>(null)
  const [newJobIds, setNewJobIds] = useState<Set<string>>(new Set())
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null)

  // Fetch jobs from tRPC
  const { data: jobs = [], isLoading } = trpc.conductor.jobs.list.useQuery()
  const utils = trpc.useUtils()

  // Subscribe to job updates (real-time)
  trpc.conductor.jobs.subscribe.useSubscription(undefined, {
    onData: (update) => {
      console.log('[Kanban] Job update received:', update.type, update.job.title)

      // Invalidate and refetch jobs list
      utils.conductor.jobs.list.invalidate()

      // Mark new jobs for animation
      if (update.type === 'job_created') {
        setNewJobIds(prev => new Set(prev).add(update.job.id))
        // Remove animation flag after animation completes
        setTimeout(() => {
          setNewJobIds(prev => {
            const next = new Set(prev)
            next.delete(update.job.id)
            return next
          })
        }, 500)
      }

      // Clear selection if job was deleted
      if (update.type === 'job_deleted' && selectedJobId === update.job.id) {
        setSelectedJobId(null)
      }

      // Handle GSD command creation
      if (update.type === 'gsd_command_created') {
        const data = update as any
        toast.success(
          <div className="flex items-center gap-2">
            <span>GSD command created</span>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                // TODO: Navigate to chat
                // window.desktopApi.openChat(data.chatId, data.subChatId)
                console.log('Navigate to chat:', data.chatId, data.subChatId)
              }}
            >
              Open Chat
            </Button>
          </div>,
          { duration: 5000 }
        )
      }
    },
    onError: (error) => {
      console.error('[Kanban] Subscription error:', error)
    }
  })

  // Sync server data to local state
  useEffect(() => {
    setLocalJobs(jobs.map(j => ({
      id: j.id,
      title: j.title,
      type: j.type || undefined,
      status: j.status as JobStatus,
      parentId: j.parentId,
      position: j.position || 0
    })))
  }, [jobs])

  // Mutations with optimistic updates
  const transitionStatus = trpc.conductor.jobs.transitionStatus.useMutation({
    onMutate: async ({ id, status }) => {
      // Cancel outgoing refetches
      await utils.conductor.jobs.list.cancel()

      // Snapshot previous value
      const previousJobs = utils.conductor.jobs.list.getData()

      // Optimistically update local state
      setLocalJobs(prev =>
        prev.map(job =>
          job.id === id
            ? { ...job, status, position: 0 }
            : job
        )
      )

      return { previousJobs }
    },
    onError: (err, variables, context) => {
      // Rollback on error
      if (context?.previousJobs) {
        setLocalJobs(context.previousJobs.map(j => ({
          id: j.id,
          title: j.title,
          type: j.type || undefined,
          status: j.status as JobStatus,
          parentId: j.parentId,
          position: j.position || 0
        })))
      }
    },
    onSettled: () => {
      utils.conductor.jobs.list.invalidate()
    }
  })

  const updatePositions = trpc.conductor.jobs.updatePositions.useMutation({
    onSettled: () => {
      utils.conductor.jobs.list.invalidate()
    }
  })

  // Configure drag sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8
      }
    })
  )

  // Group jobs by status (using local state for optimistic updates)
  const jobsByStatus = useMemo(() => {
    const grouped: Record<JobStatus, Job[]> = {
      to_do: [],
      in_progress: [],
      review: [],
      done: [],
      blocked: []
    }

    localJobs.forEach((job) => {
      if (grouped[job.status]) {
        grouped[job.status].push(job)
      }
    })

    // Sort by position within each column
    Object.keys(grouped).forEach((status) => {
      grouped[status as JobStatus].sort((a, b) => a.position - b.position)
    })

    return grouped
  }, [localJobs])

  // Handle job selection
  const handleSelectJob = useCallback((jobId: string) => {
    setSelectedJobId(prev => prev === jobId ? null : jobId)
    console.log('[Kanban] Job selected:', jobId)
    // TODO: Integrate with Task 4.3 - open job details panel
  }, [])

  // Handle drag start
  const handleDragStart = useCallback((event: DragStartEvent) => {
    const { active } = event
    const job = localJobs.find(j => j.id === active.id)
    if (job) {
      setActiveJob(job)
    }
  }, [localJobs])

  // Handle drag over (for visual feedback)
  const handleDragOver = useCallback((event: DragOverEvent) => {
    const { over } = event
    if (!over) {
      setIsDraggingOver(null)
      return
    }

    // Find which column we're over
    for (const [status, statusJobs] of Object.entries(jobsByStatus)) {
      if (statusJobs.some(j => j.id === over.id)) {
        setIsDraggingOver(status as JobStatus)
        return
      }
    }

    setIsDraggingOver(null)
  }, [jobsByStatus])

  // Handle drag end
  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event
    setActiveJob(null)
    setIsDraggingOver(null)

    if (!over) return

    const activeJobId = active.id as string
    const activeJob = localJobs.find(j => j.id === activeJobId)
    if (!activeJob) return

    const currentStatus = activeJob.status

    // Find target column and position
    let targetStatus: JobStatus | null = null
    let targetIndex = -1

    for (const [status, statusJobs] of Object.entries(jobsByStatus)) {
      const overIndex = statusJobs.findIndex(j => j.id === over.id)
      if (overIndex !== -1) {
        targetStatus = status as JobStatus
        targetIndex = overIndex
        break
      }
    }

    if (!targetStatus) {
      targetStatus = findColumnByJobId(jobsByStatus, over.id as string)
    }

    if (!targetStatus) return

    // Case 1: Moving to a different column (status change)
    if (currentStatus !== targetStatus) {
      console.log('[Kanban] Moving job to', targetStatus)
      transitionStatus.mutate({
        id: activeJobId,
        status: targetStatus
      })
    }
    // Case 2: Reordering within the same column
    else if (targetIndex !== -1) {
      const statusJobs = jobsByStatus[currentStatus]
      const oldIndex = statusJobs.findIndex(j => j.id === activeJobId)

      if (oldIndex !== targetIndex) {
        console.log('[Kanban] Reordering job from', oldIndex, 'to', targetIndex)

        // Optimistically reorder
        const reordered = arrayMove(statusJobs, oldIndex, targetIndex)
        const updates = reordered.map((job, index) => ({
          id: job.id,
          position: index
        }))

        // Update local state immediately
        setLocalJobs(prev => {
          const newJobs = [...prev]
          updates.forEach(({ id, position }) => {
            const job = newJobs.find(j => j.id === id)
            if (job) {
              job.position = position
            }
          })
          return newJobs
        })

        // Send to server
        updatePositions.mutate({ updates })
      }
    }
  }, [localJobs, jobsByStatus, transitionStatus, updatePositions])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="flex flex-col items-center gap-2">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          <p className="text-sm text-muted-foreground">Loading jobs...</p>
        </div>
      </div>
    )
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <div className="h-full w-full overflow-hidden bg-background">
        {/* Kanban Board Grid */}
        <div className="grid grid-cols-5 gap-4 h-full p-4">
          {COLUMNS.map((column) => (
            <DroppableColumn
              key={column.id}
              column={column}
              jobs={jobsByStatus[column.id]}
              isOver={isDraggingOver === column.id}
              newJobIds={newJobIds}
              selectedJobId={selectedJobId}
              onSelectJob={handleSelectJob}
            />
          ))}
        </div>
      </div>

      {/* Drag Overlay */}
      <DragOverlay>
        {activeJob ? (
          <DraggableJobCard job={activeJob} isOverlay />
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}
