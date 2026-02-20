/**
 * Analyzer tRPC Router
 *
 * Provides endpoints for managing project analysis diagrams:
 * - Code Flow: Function/module dependency graph
 * - DB: Database schema visualization
 * - Architecture: High-level system architecture
 * - Build: Build system and dependencies
 *
 * Uses parallel Task agents for analysis generation.
 */

import { eq, and } from "drizzle-orm"
import { z } from "zod"
import { observable } from "@trpc/server/observable"
import { EventEmitter } from "events"
import {
  analysisDiagrams,
  analysisJobs,
  projects,
  getDatabase,
  type AnalysisDiagram,
  type AnalysisJob,
} from "../../db"
import { publicProcedure, router } from "../index"
import {
  startBackgroundAnalysis,
  startAllBackgroundAnalyses,
  cancelBackgroundAnalysis,
  onAnalysisProgress,
  type AnalysisProgressUpdate,
} from "../../analysis/background-analysis-runner"
import { getActiveBackgroundTasks } from "../../claude/background-session"

// ============ EVENT EMITTER FOR REAL-TIME UPDATES ============

interface DiagramUpdate {
  type: "diagram_created" | "diagram_updated" | "diagram_deleted" | "status_changed"
  diagram: AnalysisDiagram
  timestamp: Date
}

interface JobUpdate {
  type: "job_created" | "job_updated" | "job_completed" | "job_failed"
  job: AnalysisJob
  timestamp: Date
}

const analyzerEvents = new EventEmitter()

function emitDiagramUpdate(type: DiagramUpdate["type"], diagram: AnalysisDiagram) {
  analyzerEvents.emit("diagram-update", { type, diagram, timestamp: new Date() })
}

function emitJobUpdate(type: JobUpdate["type"], job: AnalysisJob) {
  analyzerEvents.emit("job-update", { type, job, timestamp: new Date() })
}

// ============ ANALYSIS TYPE DEFINITIONS ============

export const ANALYSIS_TYPES = ["codeflow", "db", "architecture", "build"] as const
export type AnalysisType = (typeof ANALYSIS_TYPES)[number]

export const ANALYSIS_LABELS: Record<AnalysisType, string> = {
  codeflow: "Code Flow",
  db: "Database",
  architecture: "Architecture",
  build: "Build System",
}

export const ANALYSIS_ICONS: Record<AnalysisType, string> = {
  codeflow: "GitBranch",
  db: "Database",
  architecture: "Layers",
  build: "Wrench",
}

// ============ REACT FLOW TYPES ============

export interface FlowNode {
  id: string
  type?: string
  position: { x: number; y: number }
  data: Record<string, unknown>
  width?: number
  height?: number
}

export interface FlowEdge {
  id: string
  source: string
  target: string
  type?: string
  label?: string
  data?: Record<string, unknown>
}

export interface FlowViewport {
  x: number
  y: number
  zoom: number
}

// ============ ZOD SCHEMAS ============

const analysisTypeSchema = z.enum(ANALYSIS_TYPES)

const flowNodeSchema = z.object({
  id: z.string(),
  type: z.string().optional(),
  position: z.object({ x: z.number(), y: z.number() }),
  data: z.record(z.unknown()),
  width: z.number().optional(),
  height: z.number().optional(),
})

const flowEdgeSchema = z.object({
  id: z.string(),
  source: z.string(),
  target: z.string(),
  type: z.string().optional(),
  label: z.string().optional(),
  data: z.record(z.unknown()).optional(),
})

const viewportSchema = z.object({
  x: z.number(),
  y: z.number(),
  zoom: z.number(),
})

// ============ ANALYZER ROUTER ============

export const analyzerRouter = router({
  // ============ DIAGRAM OPERATIONS ============

  /**
   * List all analysis diagrams for a project
   */
  list: publicProcedure
    .input(z.object({ projectId: z.string() }))
    .query(({ input }) => {
      const db = getDatabase()
      return db
        .select()
        .from(analysisDiagrams)
        .where(eq(analysisDiagrams.projectId, input.projectId))
        .orderBy(analysisDiagrams.type)
        .all()
    }),

  /**
   * Get a specific diagram by project and type
   */
  get: publicProcedure
    .input(z.object({ projectId: z.string(), type: analysisTypeSchema }))
    .query(({ input }) => {
      const db = getDatabase()
      return db
        .select()
        .from(analysisDiagrams)
        .where(
          and(
            eq(analysisDiagrams.projectId, input.projectId),
            eq(analysisDiagrams.type, input.type)
          )
        )
        .get()
    }),

  /**
   * Get or create a diagram (returns existing or creates pending)
   */
  getOrCreate: publicProcedure
    .input(z.object({ projectId: z.string(), type: analysisTypeSchema }))
    .mutation(({ input }) => {
      const db = getDatabase()

      // Try to get existing
      const existing = db
        .select()
        .from(analysisDiagrams)
        .where(
          and(
            eq(analysisDiagrams.projectId, input.projectId),
            eq(analysisDiagrams.type, input.type)
          )
        )
        .get()

      if (existing) {
        return existing
      }

      // Create new pending diagram
      const diagram = db
        .insert(analysisDiagrams)
        .values({
          projectId: input.projectId,
          type: input.type,
          status: "pending",
          nodes: "[]",
          edges: "[]",
          stats: "{}",
        })
        .returning()
        .get()

      emitDiagramUpdate("diagram_created", diagram!)
      return diagram
    }),

  /**
   * Update diagram data (nodes, edges, viewport)
   */
  update: publicProcedure
    .input(
      z.object({
        id: z.string(),
        nodes: z.array(flowNodeSchema).optional(),
        edges: z.array(flowEdgeSchema).optional(),
        viewport: viewportSchema.optional(),
        summary: z.string().optional(),
        stats: z.record(z.unknown()).optional(),
        lastCommitHash: z.string().optional(),
        fileHash: z.string().optional(),
      })
    )
    .mutation(({ input }) => {
      const db = getDatabase()

      const updates: Partial<AnalysisDiagram> = {
        updatedAt: new Date(),
      }

      if (input.nodes !== undefined) updates.nodes = JSON.stringify(input.nodes)
      if (input.edges !== undefined) updates.edges = JSON.stringify(input.edges)
      if (input.viewport !== undefined) updates.viewport = JSON.stringify(input.viewport)
      if (input.summary !== undefined) updates.summary = input.summary
      if (input.stats !== undefined) updates.stats = JSON.stringify(input.stats)
      if (input.lastCommitHash !== undefined) updates.lastCommitHash = input.lastCommitHash
      if (input.fileHash !== undefined) updates.fileHash = input.fileHash

      const diagram = db
        .update(analysisDiagrams)
        .set(updates)
        .where(eq(analysisDiagrams.id, input.id))
        .returning()
        .get()

      if (diagram) {
        emitDiagramUpdate("diagram_updated", diagram)
      }

      return diagram
    }),

  /**
   * Update diagram status
   */
  updateStatus: publicProcedure
    .input(
      z.object({
        id: z.string(),
        status: z.enum(["pending", "generating", "complete", "error"]),
        errorMessage: z.string().optional(),
      })
    )
    .mutation(({ input }) => {
      const db = getDatabase()

      const diagram = db
        .update(analysisDiagrams)
        .set({
          status: input.status,
          errorMessage: input.errorMessage,
          updatedAt: new Date(),
        })
        .where(eq(analysisDiagrams.id, input.id))
        .returning()
        .get()

      if (diagram) {
        emitDiagramUpdate("status_changed", diagram)
      }

      return diagram
    }),

  /**
   * Delete a diagram (and associated jobs)
   */
  delete: publicProcedure.input(z.object({ id: z.string() })).mutation(({ input }) => {
    const db = getDatabase()

    const diagram = db
      .delete(analysisDiagrams)
      .where(eq(analysisDiagrams.id, input.id))
      .returning()
      .get()

    if (diagram) {
      emitDiagramUpdate("diagram_deleted", diagram)
    }

    return { success: true }
  }),

  /**
   * Check if diagram needs refresh based on file/commit changes
   */
  checkRefreshNeeded: publicProcedure
    .input(z.object({ id: z.string(), currentCommitHash: z.string().optional(), currentFileHash: z.string().optional() }))
    .query(({ input }) => {
      const db = getDatabase()
      const diagram = db
        .select()
        .from(analysisDiagrams)
        .where(eq(analysisDiagrams.id, input.id))
        .get()

      if (!diagram) {
        return { needsRefresh: true, reason: "not_found" }
      }

      // If no hashes stored, assume needs refresh
      if (!diagram.lastCommitHash && !diagram.fileHash) {
        return { needsRefresh: true, reason: "no_baseline" }
      }

      // Check commit hash
      if (input.currentCommitHash && diagram.lastCommitHash !== input.currentCommitHash) {
        return { needsRefresh: true, reason: "commit_changed" }
      }

      // Check file hash
      if (input.currentFileHash && diagram.fileHash !== input.currentFileHash) {
        return { needsRefresh: true, reason: "files_changed" }
      }

      return { needsRefresh: false }
    }),

  // ============ JOB OPERATIONS ============

  /**
   * Create a new analysis job
   */
  jobs: router({
    create: publicProcedure
      .input(
        z.object({
          projectId: z.string(),
          diagramId: z.string(),
          type: analysisTypeSchema,
          taskCallId: z.string().optional(),
        })
      )
      .mutation(({ input }) => {
        const db = getDatabase()

        const job = db
          .insert(analysisJobs)
          .values({
            projectId: input.projectId,
            diagramId: input.diagramId,
            type: input.type,
            status: "running",
            taskCallId: input.taskCallId,
            log: "[]",
          })
          .returning()
          .get()

        // Update diagram status to generating
        db.update(analysisDiagrams)
          .set({ status: "generating", updatedAt: new Date() })
          .where(eq(analysisDiagrams.id, input.diagramId))
          .run()

        emitJobUpdate("job_created", job!)
        return job
      }),

    /**
     * Get job by ID
     */
    get: publicProcedure.input(z.object({ id: z.string() })).query(({ input }) => {
      const db = getDatabase()
      return db.select().from(analysisJobs).where(eq(analysisJobs.id, input.id)).get()
    }),

    /**
     * List jobs for a diagram
     */
    listByDiagram: publicProcedure
      .input(z.object({ diagramId: z.string() }))
      .query(({ input }) => {
        const db = getDatabase()
        return db
          .select()
          .from(analysisJobs)
          .where(eq(analysisJobs.diagramId, input.diagramId))
          .orderBy(analysisJobs.startedAt)
          .all()
      }),

    /**
     * Update job status
     */
    updateStatus: publicProcedure
      .input(
        z.object({
          id: z.string(),
          status: z.enum(["running", "completed", "failed"]),
          errorMessage: z.string().optional(),
        })
      )
      .mutation(({ input }) => {
        const db = getDatabase()

        const updates: Partial<AnalysisJob> = {
          status: input.status,
          updatedAt: new Date(),
        }

        if (input.errorMessage !== undefined) {
          updates.errorMessage = input.errorMessage
        }

        if (input.status === "completed" || input.status === "failed") {
          updates.completedAt = new Date()
        }

        const job = db
          .update(analysisJobs)
          .set(updates)
          .where(eq(analysisJobs.id, input.id))
          .returning()
          .get()

        if (job) {
          const eventType = input.status === "completed" ? "job_completed" : input.status === "failed" ? "job_failed" : "job_updated"
          emitJobUpdate(eventType, job)

          // Update diagram status if job completed/failed
          const diagramStatus = input.status === "completed" ? "complete" : input.status === "failed" ? "error" : "generating"
          db.update(analysisDiagrams)
            .set({
              status: diagramStatus,
              errorMessage: input.errorMessage,
              updatedAt: new Date(),
            })
            .where(eq(analysisDiagrams.id, job.diagramId))
            .run()
        }

        return job
      }),

    /**
     * Append log entry to job
     */
    appendLog: publicProcedure
      .input(
        z.object({
          id: z.string(),
          level: z.enum(["info", "warning", "error", "debug"]).default("info"),
          message: z.string(),
        })
      )
      .mutation(({ input }) => {
        const db = getDatabase()

        const job = db.select().from(analysisJobs).where(eq(analysisJobs.id, input.id)).get()
        if (!job) return null

        const log = JSON.parse(job.log) as Array<{ level: string; message: string; timestamp: string }>
        log.push({
          level: input.level,
          message: input.message,
          timestamp: new Date().toISOString(),
        })

        return db
          .update(analysisJobs)
          .set({ log: JSON.stringify(log) })
          .where(eq(analysisJobs.id, input.id))
          .returning()
          .get()
      }),

    /**
     * Get latest running job for a diagram
     */
    getLatestForDiagram: publicProcedure
      .input(z.object({ diagramId: z.string() }))
      .query(({ input }) => {
        const db = getDatabase()
        return db
          .select()
          .from(analysisJobs)
          .where(eq(analysisJobs.diagramId, input.diagramId))
          .orderBy(analysisJobs.startedAt)
          .limit(1)
          .get()
      }),
  }),

  // ============ BACKGROUND ANALYSIS ============

  /**
   * Start a background analysis for a specific type
   */
  generateViaBackground: publicProcedure
    .input(z.object({ projectId: z.string(), projectPath: z.string(), type: analysisTypeSchema }))
    .mutation(async ({ input }) => {
      const result = await startBackgroundAnalysis(input.projectId, input.projectPath, input.type)
      return result
    }),

  /**
   * Start all 4 analyses in parallel via background
   */
  generateAllViaBackground: publicProcedure
    .input(z.object({ projectId: z.string(), projectPath: z.string() }))
    .mutation(async ({ input }) => {
      const results = await startAllBackgroundAnalyses(input.projectId, input.projectPath)
      return results
    }),

  /**
   * Cancel a running background analysis
   */
  cancelBackground: publicProcedure.input(z.object({ jobId: z.string() })).mutation(({ input }) => {
    const cancelled = cancelBackgroundAnalysis(input.jobId)
    return { success: cancelled }
  }),

  /**
   * Get active background analyses
   */
  getActiveBackgroundAnalyses: publicProcedure.query(() => {
    const tasks = getActiveBackgroundTasks()
    return tasks
  }),

  // ============ SUBSCRIPTIONS ============

  /**
   * Subscribe to diagram updates for a project
   */
  subscribe: publicProcedure
    .input(z.object({ projectId: z.string() }))
    .subscription(({ input }) => {
      return observable<DiagramUpdate>((emit) => {
        const handler = (update: DiagramUpdate) => {
          if (update.diagram.projectId === input.projectId) {
            emit.next(update)
          }
        }

        analyzerEvents.on("diagram-update", handler)

        return () => {
          analyzerEvents.off("diagram-update", handler)
        }
      })
    }),

  /**
   * Subscribe to job updates for a diagram
   */
  subscribeJobs: publicProcedure
    .input(z.object({ diagramId: z.string() }))
    .subscription(({ input }) => {
      return observable<JobUpdate>((emit) => {
        const handler = (update: JobUpdate) => {
          if (update.job.diagramId === input.diagramId) {
            emit.next(update)
          }
        }

        analyzerEvents.on("job-update", handler)

        return () => {
          analyzerEvents.off("job-update", handler)
        }
      })
    }),

  /**
   * Subscribe to background analysis progress updates
   */
  subscribeBackgroundProgress: publicProcedure.subscription(() => {
    return observable<AnalysisProgressUpdate>((emit) => {
      const unsubscribe = onAnalysisProgress((update) => {
        emit.next(update)
      })

      return () => {
        unsubscribe()
      }
    })
  }),

  // ============ ANALYSIS PROMPTS ============

  /**
   * Get the analysis prompt for a specific type
   */
  getPrompt: publicProcedure.input(z.object({ type: analysisTypeSchema })).query(({ input }) => {
    const prompts: Record<AnalysisType, string> = {
      codeflow: `Analyze this codebase and generate a React Flow diagram showing the code flow and module dependencies.

Focus on:
1. Main entry points (index files, main functions)
2. Module hierarchy and imports
3. Function/class relationships
4. Data flow between modules
5. Key exports and their consumers

Output format - respond with ONLY a JSON object:
{
  "nodes": [
    {
      "id": "unique-id",
      "type": "default|input|output|group",
      "position": { "x": 0, "y": 0 },
      "data": { "label": "Module Name", "description": "What this does", "type": "file|function|class|module" }
    }
  ],
  "edges": [
    {
      "id": "edge-1",
      "source": "source-node-id",
      "target": "target-node-id",
      "label": "imports|calls|extends",
      "type": "default|smoothstep|straight"
    }
  ],
  "summary": "Brief summary of the codebase structure",
  "stats": { "fileCount": 10, "functionCount": 50, "classCount": 5 }
}

CRITICAL REQUIREMENTS FOR EDGES:
- Each edge's "source" MUST be the EXACT "id" of a node in the nodes array
- Each edge's "target" MUST be the EXACT "id" of a node in the nodes array
- NEVER use "undefined", null, or empty strings for source or target
- Double-check that every node id referenced in edges exists in the nodes array

Use the following node types for different elements:
- "input" for entry points
- "output" for exports/public APIs
- "default" for internal modules
- "group" to group related files

Position nodes in a hierarchical layout with entry points at top, dependencies flowing downward.`,

      db: `Analyze this codebase and generate a React Flow diagram showing the database schema and data flow.

Focus on:
1. Database tables/collections
2. Field definitions and types
3. Relationships (1:1, 1:N, N:M)
4. Foreign keys and constraints
5. Indexes and keys
6. Migration patterns

Output format - respond with ONLY a JSON object:
{
  "nodes": [
    {
      "id": "table-name",
      "type": "default",
      "position": { "x": 0, "y": 0 },
      "data": {
        "label": "Table Name",
        "type": "table",
        "columns": [
          { "name": "id", "type": "uuid", "primary": true },
          { "name": "name", "type": "varchar" }
        ]
      }
    }
  ],
  "edges": [
    {
      "id": "rel-1",
      "source": "users",
      "target": "posts",
      "label": "1:N",
      "type": "smoothstep"
    }
  ],
  "summary": "Database schema overview",
  "stats": { "tableCount": 5, "relationshipCount": 3 }
}

CRITICAL REQUIREMENTS FOR EDGES:
- Each edge's "source" MUST be the EXACT "id" of a node in the nodes array
- Each edge's "target" MUST be the EXACT "id" of a node in the nodes array
- NEVER use "undefined", null, or empty strings for source or target
- Double-check that every node id referenced in edges exists in the nodes array

Position related tables near each other. Use smoothstep edges for relationships.`,

      architecture: `Analyze this codebase and generate a React Flow diagram showing the high-level system architecture.

Focus on:
1. System layers (frontend, backend, database, external services)
2. Major components and their responsibilities
3. Communication patterns between components
4. External integrations (APIs, services, libraries)
5. Infrastructure components

Output format - respond with ONLY a JSON object:
{
  "nodes": [
    {
      "id": "component-id",
      "type": "default|input|output",
      "position": { "x": 0, "y": 0 },
      "data": {
        "label": "Component Name",
        "type": "service|database|frontend|external|layer",
        "description": "What this component does",
        "tech": "React|Node.js|PostgreSQL|etc"
      }
    }
  ],
  "edges": [
    {
      "id": "conn-1",
      "source": "frontend",
      "target": "api",
      "label": "HTTP/REST",
      "type": "smoothstep"
    }
  ],
  "summary": "System architecture overview",
  "stats": { "componentCount": 8, "externalServices": 3 }
}

CRITICAL REQUIREMENTS FOR EDGES:
- Each edge's "source" MUST be the EXACT "id" of a node in the nodes array
- Each edge's "target" MUST be the EXACT "id" of a node in the nodes array
- NEVER use "undefined", null, or empty strings for source or target
- Double-check that every node id referenced in edges exists in the nodes array

Use a layered layout:
- Frontend/Client at top
- API/Gateway layer below
- Services/Business logic in middle
- Databases at bottom
- External services on sides`,

      build: `Analyze this codebase and generate a React Flow diagram showing the build system and dependencies.

Focus on:
1. Build tools and configuration (webpack, vite, rollup, etc.)
2. Package dependencies (direct and dev)
3. Build pipeline steps
4. Scripts and commands
5. Output/bundle structure
6. CI/CD integration if present

Output format - respond with ONLY a JSON object:
{
  "nodes": [
    {
      "id": "step-id",
      "type": "default|input|output",
      "position": { "x": 0, "y": 0 },
      "data": {
        "label": "Step Name",
        "type": "tool|script|dependency|output",
        "description": "What this step does",
        "config": "relevant config"
      }
    }
  ],
  "edges": [
    {
      "id": "dep-1",
      "source": "source",
      "target": "build",
      "label": "depends on",
      "type": "smoothstep"
    }
  ],
  "summary": "Build system overview",
  "stats": { "scriptCount": 8, "dependencyCount": 50, "devDependencyCount": 30 }
}

CRITICAL REQUIREMENTS FOR EDGES:
- Each edge's "source" MUST be the EXACT "id" of a node in the nodes array
- Each edge's "target" MUST be the EXACT "id" of a node in the nodes array
- NEVER use "undefined", null, or empty strings for source or target
- Double-check that every node id referenced in edges exists in the nodes array

Layout as a pipeline from left to right:
- Source files on left
- Build steps in middle
- Output/bundles on right
- Dependencies as supporting nodes`,
    }

    return { prompt: prompts[input.type], type: input.type, label: ANALYSIS_LABELS[input.type] }
  }),

  /**
   * Get all analysis types with their metadata
   */
  getTypes: publicProcedure.query(() => {
    return ANALYSIS_TYPES.map((type) => ({
      type,
      label: ANALYSIS_LABELS[type],
      icon: ANALYSIS_ICONS[type],
    }))
  }),
})
