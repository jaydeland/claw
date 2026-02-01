import { ConductorJobRepository } from "../db/repositories/ConductorJobRepository"
import { ConductorCheckpointRepository } from "../db/repositories/ConductorCheckpointRepository"
import { ConductorLogRepository } from "../db/repositories/ConductorLogRepository"
import type { ConductorJob, NewConductorJob } from "../db/schema/conductor"

/**
 * Valid job status values for state machine transitions
 */
export type JobStatus = "to_do" | "in_progress" | "review" | "done" | "blocked"

/**
 * Input data for creating a new job
 */
export interface CreateJobInput {
  title: string
  intent?: string
  type?: string
  parentId?: string
  jiraKey?: string
  repoId?: string
  branchName?: string
}

/**
 * Input data for updating an existing job
 */
export interface UpdateJobInput {
  title?: string
  intent?: string
  type?: string
  status?: JobStatus
  jiraKey?: string
  errorMessage?: string
  pid?: number | null
  repoId?: string
  worktreePath?: string
  branchName?: string
}

/**
 * Filters for querying jobs
 */
export interface JobFilters {
  status?: JobStatus
  parentId?: string | null // null means jobs without parents
  repoId?: string
  type?: string
}

/**
 * Position update for batch reordering
 */
export interface PositionUpdate {
  id: string
  position: number
}

/**
 * Custom error classes for job service operations
 */
export class ValidationError extends Error {
  constructor(message: string, public details?: Record<string, any>) {
    super(message)
    this.name = "ValidationError"
  }
}

export class NotFoundError extends Error {
  constructor(entityType: string, id: string) {
    super(`${entityType} with id ${id} not found`)
    this.name = "NotFoundError"
  }
}

export class StateTransitionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "StateTransitionError"
  }
}

export class HierarchyError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "HierarchyError"
  }
}

/**
 * ConductorJobService implements business logic for conductor jobs
 * including state machine validation, job lifecycle management,
 * and git worktree integration.
 *
 * @example
 * ```typescript
 * const service = new ConductorJobService(
 *   new ConductorJobRepository(),
 *   ConductorCheckpointRepository.getInstance(),
 *   new ConductorLogRepository()
 * )
 *
 * // Create a new job
 * const job = service.createJob({
 *   title: "Implement user authentication",
 *   intent: "Add OAuth2 login flow",
 *   type: "feature"
 * })
 *
 * // Transition job status
 * const updated = service.transitionStatus(job.id, "in_progress")
 * ```
 */
export class ConductorJobService {
  /**
   * Valid state transitions map
   * Defines which status changes are allowed from each state
   */
  private static readonly VALID_TRANSITIONS: Record<JobStatus, JobStatus[]> = {
    to_do: ["in_progress", "blocked", "done"],
    in_progress: ["review", "blocked", "done"],
    review: ["done", "in_progress"],
    blocked: ["to_do", "in_progress", "done"],
    done: ["in_progress"], // Allow reopening completed jobs
  }

  /**
   * Last log timestamp to ensure uniqueness
   */
  private lastLogTimestamp = 0

  constructor(
    private jobRepo: ConductorJobRepository,
    private checkpointRepo: ConductorCheckpointRepository,
    private logRepo: ConductorLogRepository,
  ) {}

  /**
   * Get unique timestamp for log entries
   * Prevents UNIQUE constraint violations on timestamp field
   * @private
   */
  private getUniqueTimestamp(): Date {
    const now = Date.now()
    if (now <= this.lastLogTimestamp) {
      this.lastLogTimestamp++
      return new Date(this.lastLogTimestamp)
    }
    this.lastLogTimestamp = now
    return new Date(now)
  }

  /**
   * Create a new job with validation
   *
   * @param data - Job creation data
   * @returns The created job
   * @throws {ValidationError} If input data is invalid
   * @throws {HierarchyError} If parent hierarchy constraints are violated
   */
  createJob(data: CreateJobInput): ConductorJob {
    // Validate input
    this.validateCreateJobData(data)

    // Validate hierarchy if parent specified
    if (data.parentId) {
      this.validateHierarchy(data.parentId)
    }

    // Get next position in to_do column
    const todoJobs = this.jobRepo.findByStatus("to_do")
    const maxPosition = todoJobs.length > 0
      ? Math.max(...todoJobs.map((j) => j.position || 0))
      : -1

    // Create job record
    const newJob: NewConductorJob = {
      title: data.title,
      intent: data.intent || null,
      type: data.type || null,
      status: "to_do",
      position: maxPosition + 1,
      parentId: data.parentId || null,
      jiraKey: data.jiraKey || null,
      repoId: data.repoId || null,
      branchName: data.branchName || null,
      errorMessage: null,
      pid: null,
      worktreePath: null,
    }

    const job = this.jobRepo.create(newJob)

    // Log creation
    this.logRepo.create({
      jobId: job.id,
      timestamp: this.getUniqueTimestamp(),
      level: "info",
      message: `Job created: ${job.title}`,
      metadata: null,
    })

    return job
  }

  /**
   * Update an existing job with validation
   *
   * @param id - Job ID to update
   * @param updates - Partial job data to update
   * @returns The updated job
   * @throws {NotFoundError} If job doesn't exist
   * @throws {StateTransitionError} If status transition is invalid
   */
  updateJob(id: string, updates: UpdateJobInput): ConductorJob {
    // Check job exists
    const existing = this.jobRepo.findById(id)
    if (!existing) {
      throw new NotFoundError("Job", id)
    }

    // Validate status transition if status is being changed
    if (updates.status && updates.status !== existing.status) {
      this.validateStatusTransition(existing.status as JobStatus, updates.status)
    }

    // Perform update
    const updated = this.jobRepo.update(id, updates)

    // Log status change if status was updated
    if (updates.status && updates.status !== existing.status) {
      this.logRepo.create({
        jobId: id,
        timestamp: this.getUniqueTimestamp(),
        level: "info",
        message: `Status changed: ${existing.status} → ${updates.status}`,
        metadata: null,
      })
    }

    return updated
  }

  /**
   * Delete a job
   *
   * @param id - Job ID to delete
   * @throws {NotFoundError} If job doesn't exist
   * @throws {ValidationError} If job has running children
   */
  deleteJob(id: string): void {
    // Check job exists
    const job = this.jobRepo.findById(id)
    if (!job) {
      throw new NotFoundError("Job", id)
    }

    // Check for running children
    const children = this.jobRepo.findChildren(id)
    const runningChildren = children.filter((c) => c.status === "in_progress")
    if (runningChildren.length > 0) {
      throw new ValidationError(
        "Cannot delete job with running children. Stop child jobs first.",
        { runningChildren: runningChildren.map((c) => c.id) },
      )
    }

    // Delete job (logs and checkpoints cascade delete via DB constraints)
    this.jobRepo.delete(id)
  }

  /**
   * Get a job by ID
   *
   * @param id - Job ID
   * @returns The job or null if not found
   */
  getJob(id: string): ConductorJob | null {
    return this.jobRepo.findById(id)
  }

  /**
   * List jobs with optional filters
   *
   * @param filters - Optional filters to apply
   * @returns Array of matching jobs
   */
  listJobs(filters?: JobFilters): ConductorJob[] {
    if (!filters) {
      return this.jobRepo.findAll()
    }

    // Optimize: Use repository method for status filter when available
    let jobs: ConductorJob[]
    if (filters.status) {
      jobs = this.jobRepo.findByStatus(filters.status)
    } else {
      jobs = this.jobRepo.findAll()
    }

    // Apply remaining filters in memory
    if (filters.parentId !== undefined) {
      jobs = jobs.filter((j) => j.parentId === filters.parentId)
    }
    if (filters.repoId) {
      jobs = jobs.filter((j) => j.repoId === filters.repoId)
    }
    if (filters.type) {
      jobs = jobs.filter((j) => j.type === filters.type)
    }

    return jobs
  }

  /**
   * Check if a status transition is valid
   *
   * @param job - Job to check
   * @param newStatus - Target status
   * @returns True if transition is valid, false otherwise
   */
  canTransition(job: ConductorJob, newStatus: JobStatus): boolean {
    const currentStatus = job.status as JobStatus
    return ConductorJobService.VALID_TRANSITIONS[currentStatus].includes(newStatus)
  }

  /**
   * Transition a job to a new status with validation
   *
   * @param jobId - Job ID to transition
   * @param newStatus - Target status
   * @returns The updated job
   * @throws {NotFoundError} If job doesn't exist
   * @throws {StateTransitionError} If transition is invalid
   */
  transitionStatus(jobId: string, newStatus: JobStatus): ConductorJob {
    const job = this.jobRepo.findById(jobId)
    if (!job) {
      throw new NotFoundError("Job", jobId)
    }

    // Validate transition
    this.validateStatusTransition(job.status as JobStatus, newStatus)

    // Perform transition
    const updated = this.jobRepo.update(jobId, { status: newStatus })

    // Log transition
    this.logRepo.create({
      jobId,
      timestamp: this.getUniqueTimestamp(),
      level: "info",
      message: `Status transition: ${job.status} → ${newStatus}`,
      metadata: null,
    })

    return updated
  }

  /**
   * Create a child job under a parent job
   *
   * @param parentId - Parent job ID
   * @param data - Job creation data
   * @returns The created child job
   * @throws {NotFoundError} If parent doesn't exist
   * @throws {HierarchyError} If parent already has a parent (nesting too deep)
   */
  createChildJob(parentId: string, data: CreateJobInput): ConductorJob {
    // Validate parent exists and hierarchy
    this.validateHierarchy(parentId)

    // Create job with parentId
    return this.createJob({
      ...data,
      parentId,
    })
  }

  /**
   * Get all child jobs of a parent
   *
   * @param parentId - Parent job ID
   * @returns Array of child jobs
   */
  getChildren(parentId: string): ConductorJob[] {
    return this.jobRepo.findChildren(parentId)
  }

  /**
   * Validate hierarchy constraints
   * Ensures maximum nesting depth of 1 (parent -> child only, no grandchildren)
   *
   * @param parentId - Parent job ID to validate
   * @throws {NotFoundError} If parent doesn't exist
   * @throws {HierarchyError} If parent already has a parent
   */
  validateHierarchy(parentId?: string): void {
    if (!parentId) {
      return
    }

    const parent = this.jobRepo.findById(parentId)
    if (!parent) {
      throw new NotFoundError("Parent job", parentId)
    }

    // Parent must not have a parent (max depth = 1)
    if (parent.parentId !== null) {
      throw new HierarchyError(
        "Cannot create grandchild jobs. Maximum nesting depth is 1 (parent -> child only).",
      )
    }
  }

  /**
   * Update job position within its status column
   *
   * @param jobId - Job ID to reposition
   * @param newPosition - New position value
   * @param newStatus - Optional new status (for moving between columns)
   * @returns The updated job
   * @throws {NotFoundError} If job doesn't exist
   * @throws {StateTransitionError} If status transition is invalid
   */
  updatePosition(jobId: string, newPosition: number, newStatus?: JobStatus): ConductorJob {
    const job = this.jobRepo.findById(jobId)
    if (!job) {
      throw new NotFoundError("Job", jobId)
    }

    // Validate status transition if provided
    if (newStatus && newStatus !== job.status) {
      this.validateStatusTransition(job.status as JobStatus, newStatus)
    }

    // Build minimal update object
    const updates: Partial<ConductorJob> = { position: newPosition }
    if (newStatus) {
      updates.status = newStatus
    }

    return this.jobRepo.update(jobId, updates)
  }

  /**
   * Reorder multiple jobs in batch
   * Useful for drag-and-drop reordering in Kanban view
   *
   * @param updates - Array of job updates with IDs and new positions
   * @throws {NotFoundError} If any job doesn't exist
   */
  reorderJobs(updates: Array<PositionUpdate>): void {
    // Validate all jobs exist first
    for (const update of updates) {
      const job = this.jobRepo.findById(update.id)
      if (!job) {
        throw new NotFoundError("Job", update.id)
      }
    }

    // Apply all position updates
    for (const update of updates) {
      this.jobRepo.updatePosition(update.id, update.position)
    }
  }

  /**
   * Assign a git worktree to a job
   *
   * @param jobId - Job ID
   * @param worktreePath - Path to the worktree directory
   * @param branchName - Git branch name
   * @returns The updated job
   * @throws {NotFoundError} If job doesn't exist
   */
  assignWorktree(jobId: string, worktreePath: string, branchName: string): ConductorJob {
    const job = this.jobRepo.findById(jobId)
    if (!job) {
      throw new NotFoundError("Job", jobId)
    }

    const updated = this.jobRepo.update(jobId, {
      worktreePath,
      branchName,
    })

    // Log worktree assignment
    this.logRepo.create({
      jobId,
      timestamp: this.getUniqueTimestamp(),
      level: "info",
      message: `Worktree assigned: ${worktreePath} (branch: ${branchName})`,
      metadata: JSON.stringify({ worktreePath, branchName }),
    })

    return updated
  }

  /**
   * Release (clear) a git worktree from a job
   *
   * @param jobId - Job ID
   * @returns The updated job
   * @throws {NotFoundError} If job doesn't exist
   */
  releaseWorktree(jobId: string): ConductorJob {
    const job = this.jobRepo.findById(jobId)
    if (!job) {
      throw new NotFoundError("Job", jobId)
    }

    const updated = this.jobRepo.update(jobId, {
      worktreePath: null,
      branchName: null,
    })

    // Log worktree release
    this.logRepo.create({
      jobId,
      timestamp: this.getUniqueTimestamp(),
      level: "info",
      message: "Worktree released",
      metadata: null,
    })

    return updated
  }

  /**
   * Mark a job as failed and set error message
   *
   * @param jobId - Job ID
   * @param errorMessage - Error message describing the failure
   * @returns The updated job
   * @throws {NotFoundError} If job doesn't exist
   */
  markJobFailed(jobId: string, errorMessage: string): ConductorJob {
    const job = this.jobRepo.findById(jobId)
    if (!job) {
      throw new NotFoundError("Job", jobId)
    }

    // Transition to blocked status with error message
    const updated = this.jobRepo.update(jobId, {
      status: "blocked",
      errorMessage,
    })

    // Log error
    this.logRepo.create({
      jobId,
      timestamp: this.getUniqueTimestamp(),
      level: "error",
      message: `Job failed: ${errorMessage}`,
      metadata: JSON.stringify({ error: errorMessage }),
    })

    return updated
  }

  /**
   * Clear error message from a job
   *
   * @param jobId - Job ID
   * @returns The updated job
   * @throws {NotFoundError} If job doesn't exist
   */
  clearError(jobId: string): ConductorJob {
    const job = this.jobRepo.findById(jobId)
    if (!job) {
      throw new NotFoundError("Job", jobId)
    }

    return this.jobRepo.update(jobId, {
      errorMessage: null,
    })
  }

  /**
   * Get all top-level jobs (jobs without a parent)
   *
   * @returns Array of parent jobs
   */
  getParentJobs(): ConductorJob[] {
    return this.jobRepo.findAll().filter((j) => j.parentId === null)
  }

  /**
   * Get job hierarchy (job with its children)
   *
   * @param jobId - Job ID
   * @returns Object with job and its children
   * @throws {NotFoundError} If job doesn't exist
   */
  getJobWithChildren(jobId: string): { job: ConductorJob; children: ConductorJob[] } {
    const job = this.jobRepo.findById(jobId)
    if (!job) {
      throw new NotFoundError("Job", jobId)
    }

    const children = this.jobRepo.findChildren(jobId)

    return { job, children }
  }

  /**
   * Check if a job is currently running
   *
   * @param jobId - Job ID
   * @returns True if job is in_progress, false otherwise
   * @throws {NotFoundError} If job doesn't exist
   */
  isJobRunning(jobId: string): boolean {
    const job = this.jobRepo.findById(jobId)
    if (!job) {
      throw new NotFoundError("Job", jobId)
    }

    return job.status === "in_progress"
  }

  /**
   * Get count of jobs by status
   *
   * @param status - Status to count (optional, if not provided counts all)
   * @returns Count of jobs
   */
  getJobCount(status?: JobStatus): number {
    if (status) {
      return this.jobRepo.findByStatus(status).length
    }
    return this.jobRepo.findAll().length
  }

  /**
   * Get all active jobs (not done)
   *
   * @returns Array of active jobs
   */
  getActiveJobs(): ConductorJob[] {
    return this.jobRepo.findAll().filter((j) => j.status !== "done")
  }

  // Private validation methods

  /**
   * Validate job creation data
   * @private
   */
  private validateCreateJobData(data: CreateJobInput): void {
    if (!data.title || data.title.trim() === "") {
      throw new ValidationError("Title is required and cannot be empty")
    }

    if (data.title.length > 500) {
      throw new ValidationError("Title must be 500 characters or less")
    }

    // Optional: Validate job type if provided
    const validTypes = ["feature", "bug", "refactor", "chore", "investigation", "documentation"]
    if (data.type && !validTypes.includes(data.type)) {
      throw new ValidationError(
        `Invalid job type: ${data.type}. Valid types: ${validTypes.join(", ")}`,
      )
    }
  }

  /**
   * Validate status transition
   * @private
   */
  private validateStatusTransition(current: JobStatus, next: JobStatus): void {
    if (!ConductorJobService.VALID_TRANSITIONS[current].includes(next)) {
      const validTransitions = ConductorJobService.VALID_TRANSITIONS[current].join(", ")
      throw new StateTransitionError(
        `Invalid state transition: ${current} → ${next}. Valid transitions from ${current}: ${validTransitions}`,
      )
    }
  }
}
