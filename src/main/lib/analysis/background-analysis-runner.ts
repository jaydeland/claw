/**
 * Background Analysis Runner
 *
 * Spawns parallel analysis agents via the background session's Task tool.
 * Each analysis type (Code Flow, DB, Architecture, Build) runs as a separate
 * background task, allowing true parallel execution without blocking the UI.
 */

import { eq, and } from "drizzle-orm"
import {
  getDatabase,
  analysisDiagrams,
  analysisJobs,
  systemPrompts,
  type AnalysisDiagram,
  type AnalysisJob,
} from "../db"
import {
  executeBackgroundTask,
  getBackgroundTaskResult,
  isBackgroundTaskRunning,
  type BackgroundSessionState,
  getBackgroundSessionState,
  initBackgroundSession,
} from "../claude/background-session"
import type { AnalysisType, FlowNode, FlowEdge, AnalysisProgressUpdate, AnalysisResult } from "./types"
import { parseAnalysisResult } from "./analysis-parser"
import { getPromptByKey, PROMPT_KEYS } from "../prompts/prompt-service"

// Re-export types for convenience
export type { AnalysisType, FlowNode, FlowEdge, AnalysisProgressUpdate, AnalysisResult }
export { parseAnalysisResult }

// Analysis prompts - Flowchart format (10-20 nodes, high-level overview)
const ANALYSIS_PROMPTS: Record<AnalysisType, string> = {
  codeflow: `Analyze this codebase and generate a FLOWCHART showing the high-level code execution flow.

CRITICAL CONSTRAINTS:
- MAXIMUM 10-20 nodes (keep it simple and high-level)
- Use standard FLOWCHART conventions
- Focus on execution flow, not detailed dependencies
- Group similar operations into single nodes

Output format - respond with ONLY a JSON object:
{
  "nodes": [
    {
      "id": "unique-id",
      "type": "start|end|process|decision|data|subprocess",
      "position": { "x": 400, "y": 0 },
      "data": {
        "label": "Short Label",
        "description": "Brief description",
        "flowType": "start|end|process|decision|data|subprocess"
      }
    }
  ],
  "edges": [
    {
      "id": "edge-1",
      "source": "source-node-id",
      "target": "target-node-id",
      "label": "Yes|No|condition",
      "type": "smoothstep"
    }
  ],
  "summary": "Brief summary of execution flow",
  "stats": { "nodeCount": 15 }
}

CRITICAL EDGE REQUIREMENTS:
- Each edge's "source" MUST be the EXACT "id" of a node in the nodes array
- Each edge's "target" MUST be the EXACT "id" of a node in the nodes array
- NEVER use "undefined", null, or empty strings for source or target
- Every source/target ID must match a node id exactly (case-sensitive)

FLOWCHART NODE TYPES:
- "start" - Entry point (rounded, green) - ONE per diagram at top
- "end" - Exit point (rounded, green) - Use for success/error endings
- "process" - Action/operation (rectangle, blue) - Main processing steps
- "decision" - Conditional/branch (diamond, yellow) - Yes/No branching
- "data" - Input/output data (parallelogram, purple) - Data operations
- "subprocess" - Sub-module (rectangle, orange) - Complex operations

EXAMPLE FLOW (10 nodes):
Start (Entry Point) → Load Config → Initialize System → [Decision: Has Dependencies?]
  → Yes: Install Dependencies → Load Modules → Start Server → End (Success)
  → No: Load Modules → Start Server → End (Success)

LAYOUT RULES:
- Start node at top center (x: 400, y: 0)
- Process nodes flow vertically downward (y increment: 180)
- Decision nodes centered with branches (left: x-250, right: x+250, y increment: 180)
- End nodes at bottom (y: last + 180)
- Horizontal spacing for parallel paths: 250 pixels

IMPORTANT: Return ONLY valid JSON. No markdown, no code blocks, no explanations. Keep total nodes between 10-20.`,

  db: `Analyze this codebase and generate an ER DIAGRAM showing the complete database schema with tables, columns, and relationships.

CRITICAL CONSTRAINTS:
- Identify ALL database tables/collections from the codebase
- Extract column names, types, and constraints (PK, FK, NOT NULL) from ORM models or schema files
- Map all foreign key relationships between tables
- Format output for TableNode component rendering

Output format - respond with ONLY a JSON object:
{
  "nodes": [
    {
      "id": "table-name",
      "type": "table",
      "position": { "x": 0, "y": 0 },
      "data": {
        "label": "table_name",
        "description": "Brief description of table purpose",
        "columns": [
          {
            "name": "id",
            "type": "uuid",
            "primaryKey": true,
            "foreignKey": null,
            "nullable": false
          },
          {
            "name": "user_id",
            "type": "uuid",
            "primaryKey": false,
            "foreignKey": "users.id",
            "nullable": false
          },
          {
            "name": "email",
            "type": "varchar",
            "primaryKey": false,
            "foreignKey": null,
            "nullable": true
          }
        ]
      }
    }
  ],
  "edges": [
    {
      "id": "fk-source-target",
      "source": "source_table",
      "target": "target_table",
      "sourceHandle": "fk_column-right",
      "targetHandle": "pk_column-top",
      "type": "smoothstep",
      "label": "fk_column"
    }
  ],
  "summary": "Database schema with 12 tables representing user management system",
  "stats": { "tableCount": 12, "relationshipCount": 8 }
}

CRITICAL REQUIREMENTS:
- Each node's "type" MUST be "table" (not process/decision/data)
- Each node MUST have a "columns" array with column definitions
- Column objects MUST have: name, type, primaryKey, foreignKey, nullable
- foreignKey format: "table.column" (e.g., "users.id") or null
- Edges MUST use sourceHandle and targetHandle for precise connections
- sourceHandle format: "{column_name}-right" for FK columns
- targetHandle format: "{column_name}-top" for PK columns

INSTRUCTIONS:
1. Search for schema files: prisma/schema.prisma, drizzle/schema.ts, src/models/, src/entities/
2. Look for SQL migration files (*.sql, migrations/, db/migrate/)
3. Extract actual table names, column names, and types from code
4. Identify primary keys (PK) and foreign keys (FK)
5. Create edges for every FK relationship with proper handle references
6. Position nodes in a grid layout (no overlapping, ~250px spacing)
7. Include ALL tables found (no maximum limit for ER diagrams)
8. Return ONLY valid JSON - no markdown, no code blocks, no explanations

LAYOUT RULES:
- Arrange tables in a grid pattern (3-4 columns)
- Space tables ~280px apart horizontally, ~320px vertically
- Position related tables near each other
- Flow direction: PK tables above FK tables when possible`,

  architecture: `Analyze this codebase and generate a FLOWCHART showing the high-level system request flow.

CRITICAL CONSTRAINTS:
- MAXIMUM 10-20 nodes (keep it simple and high-level)
- Use standard FLOWCHART conventions
- Focus on request/response flow through system layers
- Group components by layer

Output format - respond with ONLY a JSON object:
{
  "nodes": [
    {
      "id": "unique-id",
      "type": "start|end|process|decision|data|subprocess",
      "position": { "x": 400, "y": 0 },
      "data": {
        "label": "Short Label",
        "description": "Brief description",
        "tech": "Technology if relevant",
        "flowType": "start|end|process|decision|data|subprocess"
      }
    }
  ],
  "edges": [
    {
      "id": "edge-1",
      "source": "source-node-id",
      "target": "target-node-id",
      "label": "HTTP|API|Query",
      "type": "smoothstep"
    }
  ],
  "summary": "System architecture request flow",
  "stats": { "nodeCount": 14 }
}

CRITICAL EDGE REQUIREMENTS:
- Each edge's "source" MUST be the EXACT "id" of a node in the nodes array
- Each edge's "target" MUST be the EXACT "id" of a node in the nodes array
- NEVER use "undefined", null, or empty strings for source or target
- Every source/target ID must match a node id exactly (case-sensitive)

FLOWCHART NODE TYPES:
- "start" - User/client request (rounded, green)
- "end" - Response returned (rounded, green)
- "process" - Layer/component processing (rectangle, blue)
- "decision" - Routing/auth decisions (diamond, yellow)
- "data" - Database/cache (parallelogram, purple)
- "subprocess" - External services (rectangle, orange)

EXAMPLE FLOW (14 nodes):
Start (User Request) → Frontend/UI → [Decision: Authenticated?]
  → No: Login Flow → Auth Service → Return to Frontend
  → Yes: API Gateway → [Decision: Route Type?]
    → Data Query: Backend Service → Query Database → Transform Data → Return Response → End
    → External: External Service API → Process Response → Return Response → End

LAYOUT RULES:
- Start at top (x: 400, y: 0)
- Layer flow downward (Frontend → API → Services → Database)
- Decision branches horizontally (±250 pixels)
- End nodes at bottom (y: 900+)

IMPORTANT: Return ONLY valid JSON. No markdown, no code blocks, no explanations. Keep total nodes between 10-20.`,

  build: `Analyze this codebase and generate a FLOWCHART showing the high-level build pipeline flow.

CRITICAL CONSTRAINTS:
- MAXIMUM 10-20 nodes (keep it simple and high-level)
- Use standard FLOWCHART conventions
- Focus on build execution flow, not detailed configs
- Group related build steps

Output format - respond with ONLY a JSON object:
{
  "nodes": [
    {
      "id": "unique-id",
      "type": "start|end|process|decision|data|subprocess",
      "position": { "x": 400, "y": 0 },
      "data": {
        "label": "Short Label",
        "description": "Brief description",
        "flowType": "start|end|process|decision|data|subprocess"
      }
    }
  ],
  "edges": [
    {
      "id": "edge-1",
      "source": "source-node-id",
      "target": "target-node-id",
      "label": "depends on",
      "type": "smoothstep"
    }
  ],
  "summary": "Build pipeline flow overview",
  "stats": { "nodeCount": 13 }
}

CRITICAL EDGE REQUIREMENTS:
- Each edge's "source" MUST be the EXACT "id" of a node in the nodes array
- Each edge's "target" MUST be the EXACT "id" of a node in the nodes array
- NEVER use "undefined", null, or empty strings for source or target
- Every source/target ID must match a node id exactly (case-sensitive)

FLOWCHART NODE TYPES:
- "start" - Build triggered (rounded, green)
- "end" - Build complete/deployed (rounded, green)
- "process" - Build step/compilation (rectangle, blue)
- "decision" - Dev vs Prod, test pass (diamond, yellow)
- "data" - Source files/dependencies (parallelogram, purple)
- "subprocess" - Complex tools/bundlers (rectangle, orange)

EXAMPLE FLOW (13 nodes):
Start (Trigger Build) → Load Dependencies → [Decision: Dev or Prod?]
  → Dev: Fast Build → Hot Reload → Dev Server → End
  → Prod: Type Check → Run Tests → [Decision: Tests Pass?]
    → No: Report Errors → End (Failed)
    → Yes: Optimize Code → Bundle Assets → Deploy → End (Success)

LAYOUT RULES:
- Start at top center (x: 400, y: 0)
- Decision points for environment and validation
- Parallel paths for dev/prod (left: dev, right: prod)
- Multiple end nodes for success/failure states

IMPORTANT: Return ONLY valid JSON. No markdown, no code blocks, no explanations. Keep total nodes between 10-20.`,
}

// Active analysis tracking
interface ActiveAnalysis {
  jobId: string
  diagramId: string
  type: AnalysisType
  callId: string
  projectId: string
  startTime: Date
}

const activeAnalyses = new Map<string, ActiveAnalysis>()

// Progress callbacks
const progressCallbacks = new Set<(update: AnalysisProgressUpdate) => void>()

/**
 * Subscribe to analysis progress updates
 */
export function onAnalysisProgress(callback: (update: AnalysisProgressUpdate) => void): () => void {
  progressCallbacks.add(callback)
  return () => progressCallbacks.delete(callback)
}

/**
 * Emit progress update to all subscribers
 */
function emitProgress(update: AnalysisProgressUpdate) {
  for (const callback of progressCallbacks) {
    try {
      callback(update)
    } catch (err) {
      console.error("[BackgroundAnalysis] Progress callback error:", err)
    }
  }
}

/**
 * Ensure the background session is ready
 */
async function ensureBackgroundSession(): Promise<BackgroundSessionState> {
  const state = getBackgroundSessionState()
  if (state.status === "ready") {
    return state
  }
  return await initBackgroundSession()
}

/**
 * Start a single analysis in the background
 *
 * @param projectId - The project ID
 * @param projectPath - The project filesystem path
 * @param type - The analysis type
 * @returns The created job info
 */
export async function startBackgroundAnalysis(
  projectId: string,
  projectPath: string,
  type: AnalysisType
): Promise<{ success: boolean; job?: AnalysisJob; diagram?: AnalysisDiagram; error?: string }> {
  // Ensure background session is ready
  const sessionState = await ensureBackgroundSession()
  if (sessionState.status !== "ready") {
    return { success: false, error: `Background session not ready: ${sessionState.status}` }
  }

  const db = getDatabase()

  try {
    // Get or create the diagram
    let diagram = db
      .select()
      .from(analysisDiagrams)
      .where(
        and(
          eq(analysisDiagrams.projectId, projectId),
          eq(analysisDiagrams.type, type)
        )
      )
      .get()

    if (!diagram) {
      diagram = db
        .insert(analysisDiagrams)
        .values({
          projectId,
          type,
          status: "generating",
          nodes: "[]",
          edges: "[]",
          stats: "{}",
        })
        .returning()
        .get()
    } else {
      // Update status to generating
      diagram = db
        .update(analysisDiagrams)
        .set({ status: "generating", updatedAt: new Date() })
        .where(eq(analysisDiagrams.id, diagram.id))
        .returning()
        .get()
    }

    if (!diagram) {
      return { success: false, error: "Failed to create or update diagram" }
    }

    // Create the job
    const job = db
      .insert(analysisJobs)
      .values({
        projectId,
        diagramId: diagram.id,
        type,
        status: "running",
        log: JSON.stringify([{ level: "info", message: "Starting background analysis", timestamp: new Date().toISOString() }]),
      })
      .returning()
      .get()

    if (!job) {
      return { success: false, error: "Failed to create analysis job" }
    }

    // Build the prompt - use hardcoded prompt for "db" analysis type
    // Note: The seeded DB prompt may be outdated, hardcoded prompt is source of truth
    let analysisPrompt: string
    if (type === "db") {
      // Always use hardcoded prompt for database analysis (ER diagram format)
      analysisPrompt = ANALYSIS_PROMPTS.db
    } else {
      analysisPrompt = ANALYSIS_PROMPTS[type]
    }

    const prompt = `${analysisPrompt}

Project path: ${projectPath}

Instructions:
1. Use Glob and Read tools to explore the codebase
2. Focus on the most important files for this analysis type
3. Return ONLY valid JSON matching the specified format
4. Do not include any explanations, markdown, or code blocks
5. Ensure all node IDs are unique and all edges reference existing nodes`

    // Execute via background task — model is resolved from user's configured background model
    const taskResult = await executeBackgroundTask(prompt, {
      subagentType: "explore",
      timeout: 300000, // 5 minutes
    })

    if (!taskResult.success || !taskResult.callId) {
      // Update job to failed
      db.update(analysisJobs)
        .set({
          status: "failed",
          errorMessage: taskResult.error || "Failed to start background task",
          completedAt: new Date(),
        })
        .where(eq(analysisJobs.id, job.id))
        .run()

      db.update(analysisDiagrams)
        .set({
          status: "error",
          errorMessage: taskResult.error || "Failed to start background task",
          updatedAt: new Date(),
        })
        .where(eq(analysisDiagrams.id, diagram.id))
        .run()

      return { success: false, error: taskResult.error }
    }

    // Update job with task call ID
    db.update(analysisJobs)
      .set({ taskCallId: taskResult.callId })
      .where(eq(analysisJobs.id, job.id))
      .run()

    // Track the active analysis
    activeAnalyses.set(job.id, {
      jobId: job.id,
      diagramId: diagram.id,
      type,
      callId: taskResult.callId,
      projectId,
      startTime: new Date(),
    })

    // Start polling for results
    pollForResults(job.id, taskResult.callId, diagram.id, type)

    // Emit started event
    emitProgress({
      jobId: job.id,
      diagramId: diagram.id,
      type,
      status: "started",
      message: "Analysis started in background",
    })

    return { success: true, job, diagram }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    console.error("[BackgroundAnalysis] Failed to start analysis:", error)
    return { success: false, error: errorMessage }
  }
}

/**
 * Poll for task results and update the database
 */
async function pollForResults(
  jobId: string,
  callId: string,
  diagramId: string,
  type: AnalysisType,
  pollInterval = 2000,
  maxPolls = 150 // 5 minutes max
): Promise<void> {
  let polls = 0

  const poll = async () => {
    polls++

    // Check if still running
    if (isBackgroundTaskRunning(callId)) {
      if (polls >= maxPolls) {
        // Timeout
        await completeAnalysis(jobId, diagramId, type, null, "Analysis timed out after 5 minutes")
        return
      }

      // Still running, emit progress and continue polling
      emitProgress({
        jobId,
        diagramId,
        type,
        status: "running",
        progress: Math.min(polls / 30, 0.9), // Estimate progress
        message: `Analyzing... (${polls * 2}s)`,
      })

      setTimeout(poll, pollInterval)
      return
    }

    // Task completed, get result
    const result = getBackgroundTaskResult(callId)

    if (!result) {
      await completeAnalysis(jobId, diagramId, type, null, "No result from background task")
      return
    }

    if (!result.success) {
      await completeAnalysis(jobId, diagramId, type, null, result.error || "Background task failed")
      return
    }

    // Parse the result
    const parsedResult = parseAnalysisResult(result.text, result.toolOutput)

    if (!parsedResult) {
      await completeAnalysis(jobId, diagramId, type, null, "Failed to parse analysis result")
      return
    }

    // Success!
    await completeAnalysis(jobId, diagramId, type, parsedResult, null)
  }

  // Start polling
  setTimeout(poll, pollInterval)
}

/**
 * Complete an analysis job (success or failure)
 */
async function completeAnalysis(
  jobId: string,
  diagramId: string,
  type: AnalysisType,
  result: AnalysisResult | null,
  error: string | null
): Promise<void> {
  const db = getDatabase()

  try {
    if (error || !result) {
      // Failure
      db.update(analysisJobs)
        .set({
          status: "failed",
          errorMessage: error || "Unknown error",
          completedAt: new Date(),
        })
        .where(eq(analysisJobs.id, jobId))
        .run()

      db.update(analysisDiagrams)
        .set({
          status: "error",
          errorMessage: error || "Unknown error",
          updatedAt: new Date(),
        })
        .where(eq(analysisDiagrams.id, diagramId))
        .run()

      emitProgress({
        jobId,
        diagramId,
        type,
        status: "failed",
        error: error || "Unknown error",
      })
    } else {
      // Success
      db.update(analysisJobs)
        .set({
          status: "completed",
          completedAt: new Date(),
        })
        .where(eq(analysisJobs.id, jobId))
        .run()

      db.update(analysisDiagrams)
        .set({
          status: "complete",
          nodes: JSON.stringify(result.nodes),
          edges: JSON.stringify(result.edges),
          summary: result.summary,
          stats: JSON.stringify(result.stats || {}),
          updatedAt: new Date(),
        })
        .where(eq(analysisDiagrams.id, diagramId))
        .run()

      emitProgress({
        jobId,
        diagramId,
        type,
        status: "completed",
        result,
      })
    }

    // Clean up tracking
    activeAnalyses.delete(jobId)
  } catch (err) {
    console.error("[BackgroundAnalysis] Failed to complete analysis:", err)
  }
}

/**
 * Start all 4 analysis types in parallel
 *
 * @param projectId - The project ID
 * @param projectPath - The project filesystem path
 * @returns Array of started job infos
 */
export async function startAllBackgroundAnalyses(
  projectId: string,
  projectPath: string
): Promise<Array<{ success: boolean; type: AnalysisType; job?: AnalysisJob; diagram?: AnalysisDiagram; error?: string }>> {
  const types: AnalysisType[] = ["codeflow", "db", "architecture", "build"]

  // Start all in parallel
  const results = await Promise.all(
    types.map(async (type) => {
      const result = await startBackgroundAnalysis(projectId, projectPath, type)
      return { type, ...result }
    })
  )

  return results
}

/**
 * Cancel a running background analysis
 *
 * @param jobId - The job ID to cancel
 * @returns true if cancelled
 */
export function cancelBackgroundAnalysis(jobId: string): boolean {
  const analysis = activeAnalyses.get(jobId)
  if (!analysis) {
    return false
  }

  // Cancel the background task
  // Note: This requires cancelBackgroundTask from background-session
  // which we imported via executeBackgroundTask

  activeAnalyses.delete(jobId)

  // Update database
  const db = getDatabase()
  db.update(analysisJobs)
    .set({
      status: "failed",
      errorMessage: "Cancelled by user",
      completedAt: new Date(),
    })
    .where(eq(analysisJobs.id, jobId))
    .run()

  db.update(analysisDiagrams)
    .set({
      status: "error",
      errorMessage: "Cancelled by user",
      updatedAt: new Date(),
    })
    .where(eq(analysisDiagrams.id, analysis.diagramId))
    .run()

  emitProgress({
    jobId,
    diagramId: analysis.diagramId,
    type: analysis.type,
    status: "failed",
    error: "Cancelled by user",
  })

  return true
}

/**
 * Get the status of active analyses
 */
export function getActiveAnalyses(): Array<{
  jobId: string
  diagramId: string
  type: AnalysisType
  duration: number
}> {
  const now = Date.now()
  return Array.from(activeAnalyses.values()).map((a) => ({
    jobId: a.jobId,
    diagramId: a.diagramId,
    type: a.type,
    duration: now - a.startTime.getTime(),
  }))
}

/**
 * Check if an analysis type is currently running for a project
 */
export function isAnalysisRunning(projectId: string, type: AnalysisType): boolean {
  for (const analysis of activeAnalyses.values()) {
    if (analysis.projectId === projectId && analysis.type === type) {
      return true
    }
  }
  return false
}
