import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core"
import { relations } from "drizzle-orm"
import { createId } from "../utils"

// ============ CONDUCTOR JOBS ============
// Represents a unit of work in the conductor system (feature, bug fix, refactor, etc.)
// Supports hierarchical organization with parent-child relationships
export const conductorJobs = sqliteTable("conductor_jobs", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => createId()),
  title: text("title").notNull(),
  intent: text("intent"), // User's goal description or requirement
  type: text("type"), // Job type: "feature", "bug", "refactor", "chore", etc.
  status: text("status").notNull().default("to_do"), // "to_do" | "in_progress" | "review" | "done" | "blocked"
  parentId: text("parent_id"), // FK to parent job for hierarchical tasks
  position: integer("position").default(0), // For manual ordering within the same level
  jiraKey: text("jira_key"), // Optional Jira issue key for external tracking
  errorMessage: text("error_message"), // Error details if job failed
  pid: integer("pid"), // Process ID when agent is actively running
  repoId: text("repo_id"), // FK to repositories table (if applicable)
  worktreePath: text("worktree_path"), // Git worktree path for isolated work
  branchName: text("branch_name"), // Git branch name for this job
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(
    () => new Date(),
  ),
  updatedAt: integer("updated_at", { mode: "timestamp" }).$defaultFn(
    () => new Date(),
  ),
}, (table) => ({
  // Indexes for common query patterns
  parentIdIdx: index("conductor_jobs_parent_id_idx").on(table.parentId),
  statusIdx: index("conductor_jobs_status_idx").on(table.status),
  statusPositionIdx: index("conductor_jobs_status_position_idx").on(table.status, table.position), // For ordered job lists by status
  repoIdIdx: index("conductor_jobs_repo_id_idx").on(table.repoId),
}))

export const conductorJobsRelations = relations(conductorJobs, ({ one, many }) => ({
  parent: one(conductorJobs, {
    fields: [conductorJobs.parentId],
    references: [conductorJobs.id],
    relationName: "job_hierarchy",
  }),
  children: many(conductorJobs, {
    relationName: "job_hierarchy",
  }),
  checkpoints: many(conductorCheckpoints),
  logs: many(conductorLogs),
}))

// ============ CONDUCTOR CHECKPOINTS ============
// Tracks progress milestones and state snapshots during job execution
// Allows resuming work from specific points and tracking agent progress
export const conductorCheckpoints = sqliteTable("conductor_checkpoints", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => createId()),
  jobId: text("job_id")
    .notNull()
    .references(() => conductorJobs.id, { onDelete: "cascade" }),
  timestamp: integer("timestamp", { mode: "timestamp" }).notNull(), // Must be explicitly set when creating checkpoint
  message: text("message").notNull(), // Human-readable checkpoint description
  metadata: text("metadata"), // JSON string for additional structured data (e.g., file paths, state info)
}, (table) => ({
  // Index for retrieving checkpoints by job in chronological order
  jobIdTimestampIdx: index("conductor_checkpoints_job_id_timestamp_idx").on(table.jobId, table.timestamp),
}))

export const conductorCheckpointsRelations = relations(conductorCheckpoints, ({ one }) => ({
  job: one(conductorJobs, {
    fields: [conductorCheckpoints.jobId],
    references: [conductorJobs.id],
  }),
}))

// ============ CONDUCTOR LOGS ============
// Stores agent execution logs (output, errors, warnings, debugging info)
// Provides audit trail and debugging capability for conductor jobs
export const conductorLogs = sqliteTable("conductor_logs", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => createId()),
  jobId: text("job_id")
    .notNull()
    .references(() => conductorJobs.id, { onDelete: "cascade" }),
  timestamp: integer("timestamp", { mode: "timestamp" }).notNull(), // Must be explicitly set when creating log entry
  level: text("level").notNull().default("info"), // "info" | "warning" | "error" | "debug"
  message: text("message").notNull(), // Log message content
  metadata: text("metadata"), // JSON string for structured data (e.g., stack traces, context)
}, (table) => ({
  // Index for filtering logs by job and level, ordered by time
  jobIdLevelTimestampIdx: index("conductor_logs_job_id_level_timestamp_idx").on(table.jobId, table.level, table.timestamp),
  // Index for querying all logs by job chronologically
  jobIdTimestampIdx: index("conductor_logs_job_id_timestamp_idx").on(table.jobId, table.timestamp),
}))

export const conductorLogsRelations = relations(conductorLogs, ({ one }) => ({
  job: one(conductorJobs, {
    fields: [conductorLogs.jobId],
    references: [conductorJobs.id],
  }),
}))

// ============ TYPE EXPORTS ============
export type ConductorJob = typeof conductorJobs.$inferSelect
export type NewConductorJob = typeof conductorJobs.$inferInsert
export type ConductorCheckpoint = typeof conductorCheckpoints.$inferSelect
export type NewConductorCheckpoint = typeof conductorCheckpoints.$inferInsert
export type ConductorLog = typeof conductorLogs.$inferSelect
export type NewConductorLog = typeof conductorLogs.$inferInsert
