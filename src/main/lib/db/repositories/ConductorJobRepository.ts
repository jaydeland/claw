import { getDatabase } from "../index"
import { eq } from "drizzle-orm"
import type { ConductorJob, NewConductorJob } from "../schema/conductor"
import { conductorJobs } from "../schema/conductor"

/**
 * Repository for CRUD operations on conductor_jobs table
 * Provides methods for managing conductor jobs including hierarchical relationships
 */
export class ConductorJobRepository {
  /**
   * Create a new conductor job
   * @param job - The job data to create
   * @returns The created job with generated ID and timestamps
   */
  create(job: NewConductorJob): ConductorJob {
    const db = getDatabase()
    const result = db
      .insert(conductorJobs)
      .values(job)
      .returning()
      .get()

    if (!result) {
      throw new Error("Failed to create conductor job")
    }

    return result
  }

  /**
   * Find a conductor job by ID
   * @param id - The job ID
   * @returns The job if found, null otherwise
   */
  findById(id: string): ConductorJob | null {
    const db = getDatabase()
    const result = db
      .select()
      .from(conductorJobs)
      .where(eq(conductorJobs.id, id))
      .get()

    return result ?? null
  }

  /**
   * Find all conductor jobs
   * @returns Array of all jobs
   */
  findAll(): ConductorJob[] {
    const db = getDatabase()
    return db
      .select()
      .from(conductorJobs)
      .all()
  }

  /**
   * Update a conductor job
   * @param id - The job ID to update
   * @param updates - Partial job data to update
   * @returns The updated job
   */
  update(id: string, updates: Partial<ConductorJob>): ConductorJob {
    const db = getDatabase()

    // Add updatedAt timestamp
    const updateData = {
      ...updates,
      updatedAt: new Date(),
    }

    const result = db
      .update(conductorJobs)
      .set(updateData)
      .where(eq(conductorJobs.id, id))
      .returning()
      .get()

    if (!result) {
      throw new Error(`Failed to update conductor job with id: ${id}`)
    }

    return result
  }

  /**
   * Delete a conductor job
   * @param id - The job ID to delete
   */
  delete(id: string): void {
    const db = getDatabase()
    db
      .delete(conductorJobs)
      .where(eq(conductorJobs.id, id))
      .run()
  }

  /**
   * Find conductor jobs by status
   * @param status - The status to filter by (e.g., "to_do", "in_progress", "review", "done", "blocked")
   * @returns Array of jobs with the specified status
   */
  findByStatus(status: string): ConductorJob[] {
    const db = getDatabase()
    return db
      .select()
      .from(conductorJobs)
      .where(eq(conductorJobs.status, status))
      .all()
  }

  /**
   * Find all child jobs of a parent job
   * @param parentId - The parent job ID
   * @returns Array of child jobs
   */
  findChildren(parentId: string): ConductorJob[] {
    const db = getDatabase()
    return db
      .select()
      .from(conductorJobs)
      .where(eq(conductorJobs.parentId, parentId))
      .all()
  }

  /**
   * Update the position of a job
   * @param id - The job ID
   * @param position - The new position value
   */
  updatePosition(id: string, position: number): void {
    const db = getDatabase()
    db
      .update(conductorJobs)
      .set({
        position,
        updatedAt: new Date(),
      })
      .where(eq(conductorJobs.id, id))
      .run()
  }
}

// Export singleton instance
export const conductorJobRepository = new ConductorJobRepository()
