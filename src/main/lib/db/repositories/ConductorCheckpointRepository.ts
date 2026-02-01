import { eq, asc, desc, count, and, gte, lte } from "drizzle-orm"
import { getDatabase } from "../index"
import {
  conductorCheckpoints,
  type ConductorCheckpoint,
  type NewConductorCheckpoint,
} from "../schema/conductor"

/**
 * Repository for managing conductor checkpoints (agent progress markers)
 *
 * Checkpoints track progress points during job execution, allowing
 * for monitoring and potential resumption of interrupted tasks.
 *
 * @example
 * ```typescript
 * const repo = ConductorCheckpointRepository.getInstance()
 *
 * // Create a checkpoint
 * const checkpoint = repo.create({
 *   jobId: 'job-123',
 *   timestamp: new Date(),
 *   message: 'Task completed',
 *   metadata: JSON.stringify({ step: 1, status: 'success' })
 * })
 *
 * // Find checkpoints for a job
 * const checkpoints = repo.findByJobId('job-123')
 *
 * // Get the latest checkpoint
 * const latest = repo.findLatestByJobId('job-123')
 * ```
 */
export class ConductorCheckpointRepository {
  private static instance: ConductorCheckpointRepository | null = null

  /**
   * Get singleton instance of the repository
   */
  static getInstance(): ConductorCheckpointRepository {
    if (!ConductorCheckpointRepository.instance) {
      ConductorCheckpointRepository.instance = new ConductorCheckpointRepository()
    }
    return ConductorCheckpointRepository.instance
  }

  /**
   * Private constructor to enforce singleton pattern
   */
  private constructor() {}
  /**
   * Create a new checkpoint
   *
   * @param checkpoint - Checkpoint data (jobId, timestamp, message, metadata)
   * @returns The created checkpoint with generated ID
   * @throws Error if database operation fails
   */
  create(checkpoint: NewConductorCheckpoint): ConductorCheckpoint {
    try {
      const db = getDatabase()

      const result = db
        .insert(conductorCheckpoints)
        .values(checkpoint)
        .returning()
        .get()

      return result
    } catch (error) {
      throw new Error(`Failed to create checkpoint: ${error}`)
    }
  }

  /**
   * Find checkpoint by ID
   *
   * @param id - Checkpoint ID
   * @returns Checkpoint if found, null otherwise
   */
  findById(id: string): ConductorCheckpoint | null {
    try {
      const db = getDatabase()

      const result = db
        .select()
        .from(conductorCheckpoints)
        .where(eq(conductorCheckpoints.id, id))
        .get()

      return result || null
    } catch (error) {
      console.error(`Error finding checkpoint by ID ${id}:`, error)
      return null
    }
  }

  /**
   * Find all checkpoints for a specific job, ordered by timestamp
   *
   * @param jobId - Job ID
   * @returns Array of checkpoints ordered chronologically
   */
  findByJobId(jobId: string): ConductorCheckpoint[] {
    try {
      const db = getDatabase()

      const results = db
        .select()
        .from(conductorCheckpoints)
        .where(eq(conductorCheckpoints.jobId, jobId))
        .orderBy(asc(conductorCheckpoints.timestamp))
        .all()

      return results
    } catch (error) {
      console.error(`Error finding checkpoints for job ${jobId}:`, error)
      return []
    }
  }

  /**
   * Delete checkpoint by ID
   *
   * @param id - Checkpoint ID
   * @throws Error if database operation fails
   */
  delete(id: string): void {
    try {
      const db = getDatabase()

      db
        .delete(conductorCheckpoints)
        .where(eq(conductorCheckpoints.id, id))
        .run()
    } catch (error) {
      throw new Error(`Failed to delete checkpoint ${id}: ${error}`)
    }
  }

  /**
   * Delete all checkpoints for a specific job
   *
   * @param jobId - Job ID
   * @throws Error if database operation fails
   */
  deleteByJobId(jobId: string): void {
    try {
      const db = getDatabase()

      db
        .delete(conductorCheckpoints)
        .where(eq(conductorCheckpoints.jobId, jobId))
        .run()
    } catch (error) {
      throw new Error(`Failed to delete checkpoints for job ${jobId}: ${error}`)
    }
  }

  /**
   * Get the latest checkpoint for a specific job
   *
   * @param jobId - Job ID
   * @returns Latest checkpoint if found, null otherwise
   */
  findLatestByJobId(jobId: string): ConductorCheckpoint | null {
    try {
      const db = getDatabase()

      const result = db
        .select()
        .from(conductorCheckpoints)
        .where(eq(conductorCheckpoints.jobId, jobId))
        .orderBy(desc(conductorCheckpoints.timestamp))
        .limit(1)
        .get()

      return result || null
    } catch (error) {
      console.error(`Error finding latest checkpoint for job ${jobId}:`, error)
      return null
    }
  }

  /**
   * Count total checkpoints for a specific job
   *
   * @param jobId - Job ID
   * @returns Number of checkpoints
   */
  countByJobId(jobId: string): number {
    try {
      const db = getDatabase()

      const result = db
        .select({ count: count() })
        .from(conductorCheckpoints)
        .where(eq(conductorCheckpoints.jobId, jobId))
        .get()

      return result?.count || 0
    } catch (error) {
      console.error(`Error counting checkpoints for job ${jobId}:`, error)
      return 0
    }
  }

  /**
   * Check if any checkpoints exist for a specific job
   *
   * @param jobId - Job ID
   * @returns True if checkpoints exist, false otherwise
   */
  existsByJobId(jobId: string): boolean {
    return this.countByJobId(jobId) > 0
  }

  /**
   * Create multiple checkpoints in a single transaction
   *
   * @param checkpoints - Array of checkpoint data
   * @returns Array of created checkpoints with generated IDs
   * @throws Error if database operation fails
   */
  createMany(checkpoints: NewConductorCheckpoint[]): ConductorCheckpoint[] {
    try {
      const db = getDatabase()

      const results = db
        .insert(conductorCheckpoints)
        .values(checkpoints)
        .returning()
        .all()

      return results
    } catch (error) {
      throw new Error(`Failed to create checkpoints: ${error}`)
    }
  }

  /**
   * Find checkpoints within a time range for a specific job
   *
   * @param jobId - Job ID
   * @param startTime - Start of time range
   * @param endTime - End of time range
   * @returns Array of checkpoints within the time range
   */
  findByJobIdAndTimeRange(
    jobId: string,
    startTime: Date,
    endTime: Date,
  ): ConductorCheckpoint[] {
    try {
      const db = getDatabase()

      const results = db
        .select()
        .from(conductorCheckpoints)
        .where(
          and(
            eq(conductorCheckpoints.jobId, jobId),
            gte(conductorCheckpoints.timestamp, startTime),
            lte(conductorCheckpoints.timestamp, endTime),
          ),
        )
        .orderBy(asc(conductorCheckpoints.timestamp))
        .all()

      return results
    } catch (error) {
      console.error(
        `Error finding checkpoints for job ${jobId} in time range:`,
        error,
      )
      return []
    }
  }

  /**
   * Update checkpoint metadata
   *
   * @param id - Checkpoint ID
   * @param metadata - New metadata (JSON string)
   * @returns Updated checkpoint
   * @throws Error if checkpoint not found or database operation fails
   */
  updateMetadata(id: string, metadata: string): ConductorCheckpoint {
    try {
      const db = getDatabase()

      const result = db
        .update(conductorCheckpoints)
        .set({ metadata })
        .where(eq(conductorCheckpoints.id, id))
        .returning()
        .get()

      if (!result) {
        throw new Error(`Checkpoint ${id} not found`)
      }

      return result
    } catch (error) {
      throw new Error(`Failed to update checkpoint metadata: ${error}`)
    }
  }

  /**
   * Get all checkpoints across all jobs (useful for debugging or admin views)
   *
   * @param limit - Maximum number of checkpoints to return (default: 100)
   * @returns Array of checkpoints ordered by timestamp (newest first)
   */
  findAll(limit: number = 100): ConductorCheckpoint[] {
    try {
      const db = getDatabase()

      const results = db
        .select()
        .from(conductorCheckpoints)
        .orderBy(desc(conductorCheckpoints.timestamp))
        .limit(limit)
        .all()

      return results
    } catch (error) {
      console.error("Error finding all checkpoints:", error)
      return []
    }
  }

  /**
   * Parse checkpoint metadata from JSON string
   *
   * @param checkpoint - Checkpoint with metadata to parse
   * @returns Parsed metadata object or null if parsing fails
   */
  parseMetadata<T = Record<string, any>>(checkpoint: ConductorCheckpoint): T | null {
    if (!checkpoint.metadata) {
      return null
    }

    try {
      return JSON.parse(checkpoint.metadata) as T
    } catch (error) {
      console.error(`Failed to parse metadata for checkpoint ${checkpoint.id}:`, error)
      return null
    }
  }

  /**
   * Create a checkpoint with typed metadata
   *
   * @param jobId - Job ID
   * @param message - Checkpoint message
   * @param metadata - Metadata object (will be JSON stringified)
   * @param timestamp - Optional timestamp (defaults to now)
   * @returns The created checkpoint
   */
  createWithMetadata(
    jobId: string,
    message: string,
    metadata: Record<string, any>,
    timestamp?: Date,
  ): ConductorCheckpoint {
    return this.create({
      jobId,
      timestamp: timestamp || new Date(),
      message,
      metadata: JSON.stringify(metadata),
    })
  }

  /**
   * Delete old checkpoints for a job, keeping only the most recent N
   *
   * @param jobId - Job ID
   * @param keepCount - Number of recent checkpoints to keep
   * @returns Number of deleted checkpoints
   */
  deleteOldCheckpoints(jobId: string, keepCount: number = 10): number {
    try {
      const db = getDatabase()

      // Get all checkpoint IDs ordered by timestamp (newest first)
      const allCheckpoints = db
        .select({ id: conductorCheckpoints.id })
        .from(conductorCheckpoints)
        .where(eq(conductorCheckpoints.jobId, jobId))
        .orderBy(desc(conductorCheckpoints.timestamp))
        .all()

      // If we have fewer than or equal to keepCount, nothing to delete
      if (allCheckpoints.length <= keepCount) {
        return 0
      }

      // Get IDs of checkpoints to delete (all except the first keepCount)
      const idsToDelete = allCheckpoints.slice(keepCount).map((cp) => cp.id)

      // Delete the old checkpoints
      let deleteCount = 0
      for (const id of idsToDelete) {
        this.delete(id)
        deleteCount++
      }

      return deleteCount
    } catch (error) {
      console.error(`Error deleting old checkpoints for job ${jobId}:`, error)
      return 0
    }
  }
}
