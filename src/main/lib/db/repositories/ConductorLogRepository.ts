import { eq, and, desc, asc, sql, inArray } from "drizzle-orm"
import { getDatabase } from "../index"
import { conductorLogs, type ConductorLog, type NewConductorLog } from "../schema/conductor"

/**
 * Repository for managing conductor agent execution logs
 * Provides CRUD operations, filtering capabilities, and batch operations for log entries
 */
export class ConductorLogRepository {
  /**
   * Create a new log entry
   * @param log - The log data to insert
   * @returns The created log entry with generated ID and timestamp
   * @throws Error if database operation fails
   */
  create(log: NewConductorLog): ConductorLog {
    const db = getDatabase()
    const result = db.insert(conductorLogs).values(log).returning().get()
    if (!result) {
      throw new Error("Failed to create log entry")
    }
    return result
  }

  /**
   * Create multiple log entries in a single transaction
   * @param logs - Array of log data to insert
   * @returns Array of created log entries
   * @throws Error if database operation fails
   */
  createMany(logs: NewConductorLog[]): ConductorLog[] {
    if (logs.length === 0) {
      return []
    }
    const db = getDatabase()
    const results = db.insert(conductorLogs).values(logs).returning().all()
    if (!results || results.length !== logs.length) {
      throw new Error("Failed to create all log entries")
    }
    return results
  }

  /**
   * Find a log entry by ID
   * @param id - The log entry ID
   * @returns The log entry or null if not found
   */
  findById(id: string): ConductorLog | null {
    const db = getDatabase()
    return db.select().from(conductorLogs).where(eq(conductorLogs.id, id)).get() ?? null
  }

  /**
   * Find multiple log entries by their IDs
   * @param ids - Array of log entry IDs
   * @returns Array of log entries found
   */
  findByIds(ids: string[]): ConductorLog[] {
    if (ids.length === 0) {
      return []
    }
    const db = getDatabase()
    return db
      .select()
      .from(conductorLogs)
      .where(inArray(conductorLogs.id, ids))
      .orderBy(desc(conductorLogs.timestamp))
      .all()
  }

  /**
   * Find all logs for a specific job with optional pagination
   * Results are ordered by timestamp in descending order (newest first)
   * @param jobId - The job ID to filter by
   * @param options - Optional pagination parameters
   * @param options.limit - Maximum number of results to return
   * @param options.offset - Number of results to skip
   * @returns Array of log entries
   */
  findByJobId(
    jobId: string,
    options?: { limit?: number; offset?: number },
  ): ConductorLog[] {
    const db = getDatabase()
    let query = db
      .select()
      .from(conductorLogs)
      .where(eq(conductorLogs.jobId, jobId))
      .orderBy(desc(conductorLogs.timestamp))

    if (options?.limit !== undefined) {
      query = query.limit(options.limit)
    }

    if (options?.offset !== undefined) {
      query = query.offset(options.offset)
    }

    return query.all()
  }

  /**
   * Find all logs for multiple jobs
   * @param jobIds - Array of job IDs to filter by
   * @returns Array of log entries
   */
  findByJobIds(jobIds: string[]): ConductorLog[] {
    if (jobIds.length === 0) {
      return []
    }
    const db = getDatabase()
    return db
      .select()
      .from(conductorLogs)
      .where(inArray(conductorLogs.jobId, jobIds))
      .orderBy(desc(conductorLogs.timestamp))
      .all()
  }

  /**
   * Delete a log entry by ID
   * @param id - The log entry ID to delete
   */
  delete(id: string): void {
    const db = getDatabase()
    db.delete(conductorLogs).where(eq(conductorLogs.id, id)).run()
  }

  /**
   * Delete multiple log entries by their IDs
   * @param ids - Array of log entry IDs to delete
   */
  deleteMany(ids: string[]): void {
    if (ids.length === 0) {
      return
    }
    const db = getDatabase()
    db.delete(conductorLogs).where(inArray(conductorLogs.id, ids)).run()
  }

  /**
   * Delete all logs for a specific job
   * This is a cascade operation that removes all log entries associated with the job
   * @param jobId - The job ID whose logs should be deleted
   */
  deleteByJobId(jobId: string): void {
    const db = getDatabase()
    db.delete(conductorLogs).where(eq(conductorLogs.jobId, jobId)).run()
  }

  /**
   * Delete all logs for multiple jobs
   * @param jobIds - Array of job IDs whose logs should be deleted
   */
  deleteByJobIds(jobIds: string[]): void {
    if (jobIds.length === 0) {
      return
    }
    const db = getDatabase()
    db.delete(conductorLogs).where(inArray(conductorLogs.jobId, jobIds)).run()
  }

  /**
   * Find all logs for a specific job filtered by level
   * Results are ordered by timestamp in descending order (newest first)
   * @param jobId - The job ID to filter by
   * @param level - The log level to filter by (e.g., "info", "warning", "error")
   * @returns Array of log entries matching the criteria
   */
  findByLevel(jobId: string, level: string): ConductorLog[] {
    const db = getDatabase()
    return db
      .select()
      .from(conductorLogs)
      .where(and(eq(conductorLogs.jobId, jobId), eq(conductorLogs.level, level)))
      .orderBy(desc(conductorLogs.timestamp))
      .all()
  }

  /**
   * Find all logs for a job filtered by multiple levels
   * @param jobId - The job ID to filter by
   * @param levels - Array of log levels to filter by
   * @returns Array of log entries matching any of the levels
   */
  findByLevels(jobId: string, levels: string[]): ConductorLog[] {
    if (levels.length === 0) {
      return []
    }
    const db = getDatabase()
    return db
      .select()
      .from(conductorLogs)
      .where(and(eq(conductorLogs.jobId, jobId), inArray(conductorLogs.level, levels)))
      .orderBy(desc(conductorLogs.timestamp))
      .all()
  }

  /**
   * Get the total count of logs for a specific job
   * @param jobId - The job ID to count logs for
   * @returns The total number of logs
   */
  countByJobId(jobId: string): number {
    const db = getDatabase()
    const result = db
      .select({ count: sql<number>`count(*)` })
      .from(conductorLogs)
      .where(eq(conductorLogs.jobId, jobId))
      .get()
    return result?.count ?? 0
  }

  /**
   * Get the count of logs for a specific job by level
   * @param jobId - The job ID to count logs for
   * @param level - The log level to filter by
   * @returns The total number of logs at the specified level
   */
  countByLevel(jobId: string, level: string): number {
    const db = getDatabase()
    const result = db
      .select({ count: sql<number>`count(*)` })
      .from(conductorLogs)
      .where(and(eq(conductorLogs.jobId, jobId), eq(conductorLogs.level, level)))
      .get()
    return result?.count ?? 0
  }

  /**
   * Find all logs for a job within a specific time range
   * @param jobId - The job ID to filter by
   * @param startTime - Start of the time range
   * @param endTime - End of the time range
   * @returns Array of log entries within the time range
   */
  findByTimeRange(jobId: string, startTime: Date, endTime: Date): ConductorLog[] {
    const db = getDatabase()
    return db
      .select()
      .from(conductorLogs)
      .where(
        and(
          eq(conductorLogs.jobId, jobId),
          sql`${conductorLogs.timestamp} >= ${startTime.getTime()}`,
          sql`${conductorLogs.timestamp} <= ${endTime.getTime()}`,
        ),
      )
      .orderBy(asc(conductorLogs.timestamp))
      .all()
  }

  /**
   * Get the most recent log entry for a job
   * @param jobId - The job ID
   * @returns The most recent log entry or null if none found
   */
  findLatest(jobId: string): ConductorLog | null {
    const db = getDatabase()
    return (
      db
        .select()
        .from(conductorLogs)
        .where(eq(conductorLogs.jobId, jobId))
        .orderBy(desc(conductorLogs.timestamp))
        .limit(1)
        .get() ?? null
    )
  }

  /**
   * Get all unique log levels for a specific job
   * @param jobId - The job ID
   * @returns Array of unique log levels
   */
  getUniqueLevels(jobId: string): string[] {
    const db = getDatabase()
    const results = db
      .selectDistinct({ level: conductorLogs.level })
      .from(conductorLogs)
      .where(eq(conductorLogs.jobId, jobId))
      .all()
    return results.map((r) => r.level).filter((level): level is string => level !== null)
  }
}

// Export singleton instance
export const conductorLogRepository = new ConductorLogRepository()
