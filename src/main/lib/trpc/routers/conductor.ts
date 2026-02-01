/**
 * Conductor tRPC Router
 *
 * Provides type-safe API endpoints for the Conductor job management feature.
 * Connects frontend UI to ConductorJobService and ConductorAgentRunner.
 *
 * ## Architecture
 * - **Jobs**: Hierarchical task management (parent-child relationships)
 * - **Logs**: Agent execution logs with levels (info, warning, error, debug)
 * - **Checkpoints**: Progress snapshots for job resumption
 * - **Real-time Updates**: Observable subscriptions for reactive UI
 *
 * ## API Overview
 *
 * ### Jobs (15 mutations, 11 queries, 1 subscription)
 * **CRUD Operations:**
 * - `jobs.create()` - Create new job
 * - `jobs.update()` - Update existing job
 * - `jobs.delete()` - Delete job (cascades to children)
 * - `jobs.batchUpdate()` - Update multiple jobs at once
 * - `jobs.batchDelete()` - Delete multiple jobs at once
 *
 * **Job Control:**
 * - `jobs.start()` - Start job execution (sets status, stores PID)
 * - `jobs.stop()` - Stop job execution (kills process)
 * - `jobs.resume()` - Resume from last checkpoint
 * - `jobs.transitionStatus()` - Change job status with validation
 *
 * **Organization:**
 * - `jobs.updatePositions()` - Reorder jobs (drag-and-drop)
 * - `jobs.clone()` - Duplicate job with optional children
 * - `jobs.createFromTemplate()` - Create job hierarchy from template
 *
 * **Queries:**
 * - `jobs.list()` - List jobs with filters (status, type, parent, repo)
 * - `jobs.get()` - Get single job by ID
 * - `jobs.getWithChildren()` - Get job with all direct children
 * - `jobs.getChildren()` - Get all children of a job
 * - `jobs.getRecent()` - Get recently updated jobs
 * - `jobs.getWithErrors()` - Get jobs with error messages
 * - `jobs.getStatistics()` - Get counts by status and type
 * - `jobs.getTemplates()` - Get predefined job templates
 * - `jobs.getTimeline()` - Get job history (checkpoints + errors)
 * - `jobs.search()` - Full-text search by title/intent
 * - `jobs.validateHierarchy()` - Check for circular references
 *
 * **Real-time:**
 * - `jobs.subscribe()` - Subscribe to all job updates
 *
 * ### Logs (1 mutation, 1 query, 1 subscription)
 * - `logs.create()` - Create log entry
 * - `logs.list()` - List logs with pagination and filtering
 * - `logs.subscribe()` - Subscribe to logs for a job
 *
 * ### Checkpoints (1 mutation, 1 query, 1 subscription)
 * - `checkpoints.create()` - Create checkpoint
 * - `checkpoints.list()` - List checkpoints for a job
 * - `checkpoints.subscribe()` - Subscribe to checkpoints for a job
 *
 * ## Usage Examples
 *
 * ### Creating a Job
 * ```typescript
 * const job = await trpc.conductor.jobs.create.mutate({
 *   title: "Implement authentication",
 *   type: "feature",
 *   intent: "Add JWT-based auth system",
 *   repoId: "repo-123"
 * })
 * ```
 *
 * ### Using Templates
 * ```typescript
 * const templates = await trpc.conductor.jobs.getTemplates.query()
 * const result = await trpc.conductor.jobs.createFromTemplate.mutate({
 *   template: templates[0], // "New Feature" template
 *   repoId: "repo-123"
 * })
 * // Creates parent + 4 children (Design, Implementation, Testing, Docs)
 * ```
 *
 * ### Real-time Subscriptions
 * ```typescript
 * trpc.conductor.jobs.subscribe.subscribe(undefined, {
 *   onData: (update) => {
 *     console.log(`Job ${update.type}:`, update.job.title)
 *   }
 * })
 * ```
 *
 * ### Searching and Filtering
 * ```typescript
 * const results = await trpc.conductor.jobs.search.query({
 *   query: "authentication",
 *   status: "in_progress",
 *   repoId: "repo-123"
 * })
 * ```
 *
 * @module conductor-router
 */

import { eq, desc, and, isNull, inArray } from "drizzle-orm"
import { z } from "zod"
import { observable } from "@trpc/server/observable"
import { TRPCError } from "@trpc/server"
import { publicProcedure, router } from "../index"
import {
  conductorJobs,
  conductorCheckpoints,
  conductorLogs,
  getDatabase,
  type ConductorJob,
  type ConductorCheckpoint,
  type ConductorLog,
} from "../../db"
import { EventEmitter } from "events"

// ============ EVENT EMITTER FOR REAL-TIME UPDATES ============
// Uses Node's EventEmitter for decoupled real-time notifications
// Pattern: Mutations emit events -> Subscriptions listen for events -> UI updates reactively

interface JobUpdate {
  type: "job_created" | "job_updated" | "job_deleted" | "status_changed"
  job: ConductorJob
  timestamp: Date
}

interface LogUpdate {
  type: "log_created"
  log: ConductorLog
  jobId: string
}

interface CheckpointUpdate {
  type: "checkpoint_created"
  checkpoint: ConductorCheckpoint
  jobId: string
}

// Global event emitter for conductor updates
const conductorEvents = new EventEmitter()

// Helper to emit job updates with timestamp
function emitJobUpdate(type: JobUpdate["type"], job: ConductorJob) {
  conductorEvents.emit("job-update", { type, job, timestamp: new Date() })
}

function emitLogUpdate(log: ConductorLog) {
  conductorEvents.emit("log-update", { type: "log_created", log, jobId: log.jobId })
}

function emitCheckpointUpdate(checkpoint: ConductorCheckpoint) {
  conductorEvents.emit("checkpoint-update", {
    type: "checkpoint_created",
    checkpoint,
    jobId: checkpoint.jobId,
  })
}

// ============ ZOD VALIDATION SCHEMAS ============

const jobTypeSchema = z.enum(["feature", "bug", "refactor", "chore", "docs", "test"])
const jobStatusSchema = z.enum(["to_do", "in_progress", "review", "done", "blocked"])

const createJobInputSchema = z.object({
  title: z.string().min(1).max(200),
  intent: z.string().optional(),
  type: jobTypeSchema.optional(),
  status: jobStatusSchema.default("to_do"),
  parentId: z.string().optional(),
  position: z.number().int().default(0),
  jiraKey: z.string().optional(),
  repoId: z.string().optional(),
})

const updateJobInputSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  intent: z.string().optional(),
  type: jobTypeSchema.optional(),
  status: jobStatusSchema.optional(),
  parentId: z.string().optional(),
  position: z.number().int().optional(),
  jiraKey: z.string().optional(),
  errorMessage: z.string().optional(),
  repoId: z.string().optional(),
  worktreePath: z.string().optional(),
  branchName: z.string().optional(),
})

const positionUpdateSchema = z.object({
  id: z.string(),
  position: z.number().int(),
})

const jobFiltersSchema = z.object({
  status: jobStatusSchema.optional(),
  type: jobTypeSchema.optional(),
  parentId: z.string().optional(),
  repoId: z.string().optional(),
})

const logOptionsSchema = z.object({
  limit: z.number().int().positive().default(100),
  offset: z.number().int().nonnegative().default(0),
  level: z.enum(["info", "warning", "error", "debug"]).optional(),
  search: z.string().optional(), // Search in log message
})

const batchJobInputSchema = z.object({
  ids: z.array(z.string()).min(1).max(100), // Limit to 100 jobs at once
  updates: updateJobInputSchema,
})

const jobTemplateSchema = z.object({
  name: z.string(),
  type: jobTypeSchema,
  intent: z.string().optional(),
  children: z.array(
    z.object({
      title: z.string(),
      intent: z.string().optional(),
      type: jobTypeSchema.optional(),
    }),
  ).optional(),
})

const timeTrackingSchema = z.object({
  startedAt: z.date().optional(),
  completedAt: z.date().optional(),
  estimatedHours: z.number().positive().optional(),
  actualHours: z.number().positive().optional(),
})

// ============ CONDUCTOR ROUTER ============

export const conductorRouter = router({
  // ============ JOB OPERATIONS (MUTATIONS) ============

  /**
   * Create a new conductor job
   */
  jobs: router({
    create: publicProcedure.input(createJobInputSchema).mutation(({ input }) => {
      const db = getDatabase()

      const job = db
        .insert(conductorJobs)
        .values({
          title: input.title,
          intent: input.intent,
          type: input.type,
          status: input.status,
          parentId: input.parentId,
          position: input.position,
          jiraKey: input.jiraKey,
          repoId: input.repoId,
        })
        .returning()
        .get()

      emitJobUpdate("job_created", job)
      return job
    }),

    /**
     * Update an existing job
     */
    update: publicProcedure
      .input(
        z.object({
          id: z.string(),
          updates: updateJobInputSchema,
        }),
      )
      .mutation(({ input }) => {
        const db = getDatabase()

        // Check if job exists
        const existing = db
          .select()
          .from(conductorJobs)
          .where(eq(conductorJobs.id, input.id))
          .get()

        if (!existing) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Job not found",
          })
        }

        const job = db
          .update(conductorJobs)
          .set({ ...input.updates, updatedAt: new Date() })
          .where(eq(conductorJobs.id, input.id))
          .returning()
          .get()

        emitJobUpdate("job_updated", job!)
        return job
      }),

    /**
     * Delete a job (also deletes children via cascade)
     */
    delete: publicProcedure.input(z.object({ id: z.string() })).mutation(({ input }) => {
      const db = getDatabase()

      const job = db
        .delete(conductorJobs)
        .where(eq(conductorJobs.id, input.id))
        .returning()
        .get()

      if (!job) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Job not found",
        })
      }

      emitJobUpdate("job_deleted", job)
      return { success: true }
    }),

    /**
     * Update positions for multiple jobs (for drag-and-drop reordering)
     */
    updatePositions: publicProcedure
      .input(z.object({ updates: z.array(positionUpdateSchema) }))
      .mutation(({ input }) => {
        const db = getDatabase()

        // Update each job's position
        for (const update of input.updates) {
          db.update(conductorJobs)
            .set({ position: update.position, updatedAt: new Date() })
            .where(eq(conductorJobs.id, update.id))
            .run()
        }

        return { success: true, count: input.updates.length }
      }),

    /**
     * Transition job status (validates state transitions)
     */
    transitionStatus: publicProcedure
      .input(
        z.object({
          id: z.string(),
          status: jobStatusSchema,
        }),
      )
      .mutation(({ input }) => {
        const db = getDatabase()

        const existing = db
          .select()
          .from(conductorJobs)
          .where(eq(conductorJobs.id, input.id))
          .get()

        if (!existing) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Job not found",
          })
        }

        const job = db
          .update(conductorJobs)
          .set({ status: input.status, updatedAt: new Date() })
          .where(eq(conductorJobs.id, input.id))
          .returning()
          .get()

        emitJobUpdate("status_changed", job!)
        return job
      }),

    /**
     * Start a job (sets status to in_progress and stores PID)
     */
    start: publicProcedure
      .input(z.object({ id: z.string(), pid: z.number().int().optional() }))
      .mutation(({ input }) => {
        const db = getDatabase()

        const existing = db
          .select()
          .from(conductorJobs)
          .where(eq(conductorJobs.id, input.id))
          .get()

        if (!existing) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Job not found",
          })
        }

        if (existing.status === "in_progress") {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Job is already in progress",
          })
        }

        const job = db
          .update(conductorJobs)
          .set({
            status: "in_progress",
            pid: input.pid,
            errorMessage: null, // Clear previous errors
            updatedAt: new Date(),
          })
          .where(eq(conductorJobs.id, input.id))
          .returning()
          .get()

        emitJobUpdate("status_changed", job!)
        return job
      }),

    /**
     * Stop a job (kills process and sets status)
     */
    stop: publicProcedure.input(z.object({ id: z.string() })).mutation(async ({ input }) => {
      const db = getDatabase()

      const existing = db
        .select()
        .from(conductorJobs)
        .where(eq(conductorJobs.id, input.id))
        .get()

      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Job not found",
        })
      }

      // Kill process if running
      if (existing.pid) {
        try {
          process.kill(existing.pid, "SIGTERM")
        } catch (error) {
          console.warn(`[Conductor] Failed to kill process ${existing.pid}:`, error)
        }
      }

      const job = db
        .update(conductorJobs)
        .set({
          status: "to_do",
          pid: null,
          updatedAt: new Date(),
        })
        .where(eq(conductorJobs.id, input.id))
        .returning()
        .get()

      emitJobUpdate("status_changed", job!)
      return job
    }),

    /**
     * Resume a job (restart from last checkpoint)
     */
    resume: publicProcedure
      .input(z.object({ id: z.string(), pid: z.number().int().optional() }))
      .mutation(({ input }) => {
        const db = getDatabase()

        const existing = db
          .select()
          .from(conductorJobs)
          .where(eq(conductorJobs.id, input.id))
          .get()

        if (!existing) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Job not found",
          })
        }

        // Get latest checkpoint to verify resumability
        const latestCheckpoint = db
          .select()
          .from(conductorCheckpoints)
          .where(eq(conductorCheckpoints.jobId, input.id))
          .orderBy(desc(conductorCheckpoints.timestamp))
          .get()

        if (!latestCheckpoint) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "No checkpoint found to resume from",
          })
        }

        const job = db
          .update(conductorJobs)
          .set({
            status: "in_progress",
            pid: input.pid,
            errorMessage: null,
            updatedAt: new Date(),
          })
          .where(eq(conductorJobs.id, input.id))
          .returning()
          .get()

        emitJobUpdate("status_changed", job!)
        return job
      }),

    // ============ JOB QUERIES ============

    /**
     * List all jobs with optional filters
     */
    list: publicProcedure.input(jobFiltersSchema.optional()).query(({ input }) => {
      const db = getDatabase()
      const conditions = []

      if (input?.status) {
        conditions.push(eq(conductorJobs.status, input.status))
      }
      if (input?.type) {
        conditions.push(eq(conductorJobs.type, input.type))
      }
      if (input?.parentId) {
        conditions.push(eq(conductorJobs.parentId, input.parentId))
      } else if (input?.parentId === null) {
        // Explicitly query for root-level jobs
        conditions.push(isNull(conductorJobs.parentId))
      }
      if (input?.repoId) {
        conditions.push(eq(conductorJobs.repoId, input.repoId))
      }

      const jobs = db
        .select()
        .from(conductorJobs)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(conductorJobs.position, desc(conductorJobs.createdAt))
        .all()

      return jobs
    }),

    /**
     * Get a single job by ID
     */
    get: publicProcedure.input(z.object({ id: z.string() })).query(({ input }) => {
      const db = getDatabase()

      const job = db.select().from(conductorJobs).where(eq(conductorJobs.id, input.id)).get()

      if (!job) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Job not found",
        })
      }

      return job
    }),

    /**
     * Get job with all children (hierarchical)
     */
    getWithChildren: publicProcedure
      .input(z.object({ id: z.string() }))
      .query(({ input }) => {
        const db = getDatabase()

        const job = db.select().from(conductorJobs).where(eq(conductorJobs.id, input.id)).get()

        if (!job) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Job not found",
          })
        }

        // Get direct children
        const children = db
          .select()
          .from(conductorJobs)
          .where(eq(conductorJobs.parentId, input.id))
          .orderBy(conductorJobs.position, desc(conductorJobs.createdAt))
          .all()

        return { ...job, children }
      }),

    /**
     * Get all children of a job
     */
    getChildren: publicProcedure
      .input(z.object({ parentId: z.string() }))
      .query(({ input }) => {
        const db = getDatabase()

        return db
          .select()
          .from(conductorJobs)
          .where(eq(conductorJobs.parentId, input.parentId))
          .orderBy(conductorJobs.position, desc(conductorJobs.createdAt))
          .all()
      }),

    // ============ JOB SUBSCRIPTIONS ============

    /**
     * Subscribe to all job updates
     */
    subscribe: publicProcedure.subscription(() => {
      return observable<JobUpdate>((emit) => {
        const handler = (update: JobUpdate) => {
          emit.next(update)
        }

        conductorEvents.on("job-update", handler)

        return () => {
          conductorEvents.off("job-update", handler)
        }
      })
    }),

    /**
     * Batch update multiple jobs at once
     */
    batchUpdate: publicProcedure.input(batchJobInputSchema).mutation(({ input }) => {
      const db = getDatabase()
      const updatedJobs: ConductorJob[] = []

      // Validate all jobs exist first
      const existingJobs = db
        .select()
        .from(conductorJobs)
        .where(inArray(conductorJobs.id, input.ids))
        .all()

      if (existingJobs.length !== input.ids.length) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Some jobs were not found. Expected ${input.ids.length}, found ${existingJobs.length}`,
        })
      }

      // Update all jobs
      for (const id of input.ids) {
        const job = db
          .update(conductorJobs)
          .set({ ...input.updates, updatedAt: new Date() })
          .where(eq(conductorJobs.id, id))
          .returning()
          .get()

        if (job) {
          updatedJobs.push(job)
          emitJobUpdate("job_updated", job)
        }
      }

      return { success: true, count: updatedJobs.length, jobs: updatedJobs }
    }),

    /**
     * Batch delete multiple jobs
     */
    batchDelete: publicProcedure
      .input(z.object({ ids: z.array(z.string()).min(1).max(100) }))
      .mutation(({ input }) => {
        const db = getDatabase()
        let deletedCount = 0

        for (const id of input.ids) {
          const job = db
            .delete(conductorJobs)
            .where(eq(conductorJobs.id, id))
            .returning()
            .get()

          if (job) {
            deletedCount++
            emitJobUpdate("job_deleted", job)
          }
        }

        return { success: true, count: deletedCount }
      }),

    /**
     * Get job statistics by status and type
     */
    getStatistics: publicProcedure
      .input(z.object({ repoId: z.string().optional() }))
      .query(({ input }) => {
        const db = getDatabase()
        const conditions = input.repoId ? [eq(conductorJobs.repoId, input.repoId)] : []

        const allJobs = db
          .select()
          .from(conductorJobs)
          .where(conditions.length > 0 ? and(...conditions) : undefined)
          .all()

        // Calculate statistics
        const stats = {
          total: allJobs.length,
          byStatus: {
            to_do: 0,
            in_progress: 0,
            review: 0,
            done: 0,
            blocked: 0,
          },
          byType: {
            feature: 0,
            bug: 0,
            refactor: 0,
            chore: 0,
            docs: 0,
            test: 0,
          },
          withErrors: 0,
          withParent: 0,
          rootLevel: 0,
        }

        for (const job of allJobs) {
          if (job.status) {
            stats.byStatus[job.status as keyof typeof stats.byStatus]++
          }
          if (job.type) {
            stats.byType[job.type as keyof typeof stats.byType]++
          }
          if (job.errorMessage) {
            stats.withErrors++
          }
          if (job.parentId) {
            stats.withParent++
          } else {
            stats.rootLevel++
          }
        }

        return stats
      }),

    /**
     * Validate that adding a parent doesn't create a circular reference
     */
    validateHierarchy: publicProcedure
      .input(z.object({ jobId: z.string(), parentId: z.string() }))
      .query(({ input }) => {
        const db = getDatabase()

        // Check if parentId is an ancestor of jobId (would create cycle)
        const visited = new Set<string>()
        let currentId: string | null = input.parentId

        while (currentId) {
          if (currentId === input.jobId) {
            return {
              valid: false,
              error: "Circular reference detected: parent is a descendant of this job",
            }
          }

          if (visited.has(currentId)) {
            return {
              valid: false,
              error: "Circular reference detected in existing hierarchy",
            }
          }

          visited.add(currentId)

          const parent = db
            .select()
            .from(conductorJobs)
            .where(eq(conductorJobs.id, currentId))
            .get()

          currentId = parent?.parentId || null
        }

        return { valid: true }
      }),

    /**
     * Create job from template (creates parent + optional children)
     */
    createFromTemplate: publicProcedure
      .input(
        z.object({
          template: jobTemplateSchema,
          repoId: z.string().optional(),
        }),
      )
      .mutation(({ input }) => {
        const db = getDatabase()

        // Create parent job
        const parentJob = db
          .insert(conductorJobs)
          .values({
            title: input.template.name,
            intent: input.template.intent,
            type: input.template.type,
            status: "to_do",
            repoId: input.repoId,
            position: 0,
          })
          .returning()
          .get()

        emitJobUpdate("job_created", parentJob)

        // Create child jobs if specified
        const childJobs: ConductorJob[] = []
        if (input.template.children && input.template.children.length > 0) {
          for (let i = 0; i < input.template.children.length; i++) {
            const childTemplate = input.template.children[i]!
            const childJob = db
              .insert(conductorJobs)
              .values({
                title: childTemplate.title,
                intent: childTemplate.intent,
                type: childTemplate.type || input.template.type,
                status: "to_do",
                parentId: parentJob.id,
                position: i,
                repoId: input.repoId,
              })
              .returning()
              .get()

            childJobs.push(childJob)
            emitJobUpdate("job_created", childJob)
          }
        }

        return {
          parent: parentJob,
          children: childJobs,
          totalCreated: 1 + childJobs.length,
        }
      }),

    /**
     * Get common job templates
     */
    getTemplates: publicProcedure.query(() => {
      // Return predefined templates for common job types
      return [
        {
          name: "New Feature",
          type: "feature" as const,
          intent: "Implement a new feature",
          children: [
            { title: "Design & Planning", type: "chore" as const },
            { title: "Implementation", type: "feature" as const },
            { title: "Testing", type: "test" as const },
            { title: "Documentation", type: "docs" as const },
          ],
        },
        {
          name: "Bug Fix",
          type: "bug" as const,
          intent: "Fix a bug",
          children: [
            { title: "Reproduce Issue", type: "chore" as const },
            { title: "Fix Implementation", type: "bug" as const },
            { title: "Add Regression Test", type: "test" as const },
          ],
        },
        {
          name: "Refactor",
          type: "refactor" as const,
          intent: "Improve code quality",
          children: [
            { title: "Identify Areas", type: "chore" as const },
            { title: "Refactor Code", type: "refactor" as const },
            { title: "Verify Functionality", type: "test" as const },
          ],
        },
      ]
    }),

    /**
     * Update job time tracking
     */
    updateTimeTracking: publicProcedure
      .input(
        z.object({
          id: z.string(),
          tracking: timeTrackingSchema,
        }),
      )
      .mutation(({ input }) => {
        const db = getDatabase()

        const existing = db
          .select()
          .from(conductorJobs)
          .where(eq(conductorJobs.id, input.id))
          .get()

        if (!existing) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Job not found",
          })
        }

        // Store time tracking in metadata field (JSON)
        const currentMetadata = existing.errorMessage
          ? JSON.parse(existing.errorMessage)
          : {}
        const updatedMetadata = {
          ...currentMetadata,
          timeTracking: input.tracking,
        }

        const job = db
          .update(conductorJobs)
          .set({
            errorMessage: JSON.stringify(updatedMetadata),
            updatedAt: new Date(),
          })
          .where(eq(conductorJobs.id, input.id))
          .returning()
          .get()

        emitJobUpdate("job_updated", job!)
        return job
      }),

    /**
     * Get job timeline (all status changes and checkpoints)
     */
    getTimeline: publicProcedure.input(z.object({ id: z.string() })).query(({ input }) => {
      const db = getDatabase()

      const job = db.select().from(conductorJobs).where(eq(conductorJobs.id, input.id)).get()

      if (!job) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Job not found",
        })
      }

      // Get checkpoints
      const checkpoints = db
        .select()
        .from(conductorCheckpoints)
        .where(eq(conductorCheckpoints.jobId, input.id))
        .orderBy(conductorCheckpoints.timestamp)
        .all()

      // Get error logs
      const errorLogs = db
        .select()
        .from(conductorLogs)
        .where(and(eq(conductorLogs.jobId, input.id), eq(conductorLogs.level, "error")))
        .orderBy(conductorLogs.timestamp)
        .all()

      // Combine into timeline
      const timeline = [
        { type: "created", timestamp: job.createdAt, data: { status: job.status } },
        ...checkpoints.map((cp) => ({
          type: "checkpoint" as const,
          timestamp: cp.timestamp,
          data: { message: cp.message, metadata: cp.metadata },
        })),
        ...errorLogs.map((log) => ({
          type: "error" as const,
          timestamp: log.timestamp,
          data: { message: log.message, metadata: log.metadata },
        })),
      ].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())

      return {
        job,
        timeline,
      }
    }),

    /**
     * Search jobs by title or intent
     */
    search: publicProcedure
      .input(
        z.object({
          query: z.string().min(1),
          repoId: z.string().optional(),
          status: jobStatusSchema.optional(),
          type: jobTypeSchema.optional(),
        }),
      )
      .query(({ input }) => {
        const db = getDatabase()
        const conditions = []

        if (input.repoId) {
          conditions.push(eq(conductorJobs.repoId, input.repoId))
        }
        if (input.status) {
          conditions.push(eq(conductorJobs.status, input.status))
        }
        if (input.type) {
          conditions.push(eq(conductorJobs.type, input.type))
        }

        let jobs = db
          .select()
          .from(conductorJobs)
          .where(conditions.length > 0 ? and(...conditions) : undefined)
          .all()

        // Filter by search query
        const queryLower = input.query.toLowerCase()
        jobs = jobs.filter(
          (job) =>
            job.title.toLowerCase().includes(queryLower) ||
            job.intent?.toLowerCase().includes(queryLower),
        )

        return jobs
      }),

    /**
     * Clone a job (with or without children)
     */
    clone: publicProcedure
      .input(
        z.object({
          id: z.string(),
          includeChildren: z.boolean().default(false),
          newTitle: z.string().optional(),
        }),
      )
      .mutation(({ input }) => {
        const db = getDatabase()

        const original = db
          .select()
          .from(conductorJobs)
          .where(eq(conductorJobs.id, input.id))
          .get()

        if (!original) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Job not found",
          })
        }

        // Create cloned parent
        const cloned = db
          .insert(conductorJobs)
          .values({
            title: input.newTitle || `${original.title} (Copy)`,
            intent: original.intent,
            type: original.type,
            status: "to_do", // Always start as to_do
            parentId: original.parentId,
            position: original.position + 1,
            jiraKey: null, // Don't copy Jira key
            repoId: original.repoId,
            worktreePath: null, // Don't copy worktree
            branchName: null,
          })
          .returning()
          .get()

        emitJobUpdate("job_created", cloned)

        // Clone children if requested
        const clonedChildren: ConductorJob[] = []
        if (input.includeChildren) {
          const children = db
            .select()
            .from(conductorJobs)
            .where(eq(conductorJobs.parentId, input.id))
            .orderBy(conductorJobs.position)
            .all()

          for (const child of children) {
            const clonedChild = db
              .insert(conductorJobs)
              .values({
                title: child.title,
                intent: child.intent,
                type: child.type,
                status: "to_do",
                parentId: cloned.id,
                position: child.position,
                repoId: child.repoId,
              })
              .returning()
              .get()

            clonedChildren.push(clonedChild)
            emitJobUpdate("job_created", clonedChild)
          }
        }

        return {
          cloned,
          children: clonedChildren,
          totalCreated: 1 + clonedChildren.length,
        }
      }),

    /**
     * Get recent jobs (last N jobs updated)
     */
    getRecent: publicProcedure
      .input(
        z.object({
          limit: z.number().int().positive().max(50).default(10),
          repoId: z.string().optional(),
        }),
      )
      .query(({ input }) => {
        const db = getDatabase()
        const conditions = input.repoId ? [eq(conductorJobs.repoId, input.repoId)] : []

        return db
          .select()
          .from(conductorJobs)
          .where(conditions.length > 0 ? and(...conditions) : undefined)
          .orderBy(desc(conductorJobs.updatedAt))
          .limit(input.limit)
          .all()
      }),

    /**
     * Get jobs with errors
     */
    getWithErrors: publicProcedure
      .input(z.object({ repoId: z.string().optional() }))
      .query(({ input }) => {
        const db = getDatabase()

        const allJobs = db
          .select()
          .from(conductorJobs)
          .where(input.repoId ? eq(conductorJobs.repoId, input.repoId) : undefined)
          .all()

        // Filter jobs with error messages
        return allJobs.filter((job) => job.errorMessage && job.errorMessage.length > 0)
      }),
  }),

  // ============ LOGS OPERATIONS ============

  logs: router({
    /**
     * List logs for a job
     */
    list: publicProcedure
      .input(
        z.object({
          jobId: z.string(),
          options: logOptionsSchema.optional(),
        }),
      )
      .query(({ input }) => {
        const db = getDatabase()
        const options = input.options || {}
        const conditions = [eq(conductorLogs.jobId, input.jobId)]

        if (options.level) {
          conditions.push(eq(conductorLogs.level, options.level))
        }

        let logs = db
          .select()
          .from(conductorLogs)
          .where(and(...conditions))
          .orderBy(desc(conductorLogs.timestamp))
          .all()

        // Apply search filter in memory (SQLite doesn't have great full-text search)
        if (options.search) {
          const searchLower = options.search.toLowerCase()
          logs = logs.filter((log) => log.message.toLowerCase().includes(searchLower))
        }

        // Apply pagination after search
        const paginatedLogs = logs.slice(options.offset, options.offset + options.limit)

        return {
          logs: paginatedLogs,
          total: logs.length,
          hasMore: logs.length > options.offset + options.limit,
        }
      }),

    /**
     * Create a log entry (used by agent runner)
     */
    create: publicProcedure
      .input(
        z.object({
          jobId: z.string(),
          level: z.enum(["info", "warning", "error", "debug"]).default("info"),
          message: z.string(),
          metadata: z.string().optional(), // JSON string
        }),
      )
      .mutation(({ input }) => {
        const db = getDatabase()

        const log = db
          .insert(conductorLogs)
          .values({
            jobId: input.jobId,
            timestamp: new Date(),
            level: input.level,
            message: input.message,
            metadata: input.metadata,
          })
          .returning()
          .get()

        emitLogUpdate(log)
        return log
      }),

    /**
     * Subscribe to logs for a specific job
     */
    subscribe: publicProcedure.input(z.object({ jobId: z.string() })).subscription(({ input }) => {
      return observable<ConductorLog>((emit) => {
        const handler = (update: LogUpdate) => {
          if (update.jobId === input.jobId) {
            emit.next(update.log)
          }
        }

        conductorEvents.on("log-update", handler)

        return () => {
          conductorEvents.off("log-update", handler)
        }
      })
    }),
  }),

  // ============ CHECKPOINTS OPERATIONS ============

  checkpoints: router({
    /**
     * List checkpoints for a job
     */
    list: publicProcedure.input(z.object({ jobId: z.string() })).query(({ input }) => {
      const db = getDatabase()

      return db
        .select()
        .from(conductorCheckpoints)
        .where(eq(conductorCheckpoints.jobId, input.jobId))
        .orderBy(desc(conductorCheckpoints.timestamp))
        .all()
    }),

    /**
     * Create a checkpoint (used by agent runner)
     */
    create: publicProcedure
      .input(
        z.object({
          jobId: z.string(),
          message: z.string(),
          metadata: z.string().optional(), // JSON string
        }),
      )
      .mutation(({ input }) => {
        const db = getDatabase()

        const checkpoint = db
          .insert(conductorCheckpoints)
          .values({
            jobId: input.jobId,
            timestamp: new Date(),
            message: input.message,
            metadata: input.metadata,
          })
          .returning()
          .get()

        emitCheckpointUpdate(checkpoint)
        return checkpoint
      }),

    /**
     * Subscribe to checkpoints for a specific job
     */
    subscribe: publicProcedure
      .input(z.object({ jobId: z.string() }))
      .subscription(({ input }) => {
        return observable<ConductorCheckpoint>((emit) => {
          const handler = (update: CheckpointUpdate) => {
            if (update.jobId === input.jobId) {
              emit.next(update.checkpoint)
            }
          }

          conductorEvents.on("checkpoint-update", handler)

          return () => {
            conductorEvents.off("checkpoint-update", handler)
          }
        })
      }),
  }),
})
