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
import type { AnalysisType, FlowNode, FlowEdge } from "../trpc/routers/analyzer"

// Re-export types for convenience
export type { AnalysisType, FlowNode, FlowEdge }

// Analysis prompts (mirrored from analyzer router)
const ANALYSIS_PROMPTS: Record<AnalysisType, string> = {
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

Use the following node types for different elements:
- "input" for entry points
- "output" for exports/public APIs
- "default" for internal modules
- "group" to group related files

Position nodes in a hierarchical layout with entry points at top, dependencies flowing downward.

IMPORTANT: Return ONLY valid JSON. No markdown, no code blocks, no explanations.`,

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

Position related tables near each other. Use smoothstep edges for relationships.

IMPORTANT: Return ONLY valid JSON. No markdown, no code blocks, no explanations.`,

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

Use a layered layout:
- Frontend/Client at top
- API/Gateway layer below
- Services/Business logic in middle
- Databases at bottom
- External services on sides

IMPORTANT: Return ONLY valid JSON. No markdown, no code blocks, no explanations.`,

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

Layout as a pipeline from left to right:
- Source files on left
- Build steps in middle
- Output/bundles on right
- Dependencies as supporting nodes

IMPORTANT: Return ONLY valid JSON. No markdown, no code blocks, no explanations.`,
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

export interface AnalysisProgressUpdate {
  jobId: string
  diagramId: string
  type: AnalysisType
  status: "started" | "running" | "completed" | "failed"
  progress?: number
  message?: string
  result?: AnalysisResult
  error?: string
}

export interface AnalysisResult {
  nodes: FlowNode[]
  edges: FlowEdge[]
  summary?: string
  stats?: Record<string, unknown>
}

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

    // Build the prompt
    const prompt = `${ANALYSIS_PROMPTS[type]}

Project path: ${projectPath}

Instructions:
1. Use Glob and Read tools to explore the codebase
2. Focus on the most important files for this analysis type
3. Return ONLY valid JSON matching the specified format
4. Do not include any explanations, markdown, or code blocks
5. Ensure all node IDs are unique and all edges reference existing nodes`

    // Execute via background task
    const taskResult = await executeBackgroundTask(prompt, {
      model: "sonnet",
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
 * Parse the analysis result from the background task output
 */
function parseAnalysisResult(responseText: string, toolOutput?: string): AnalysisResult | null {
  try {
    // Try tool output first (cleaner result from Task tool)
    if (toolOutput) {
      try {
        const parsed = JSON.parse(toolOutput)
        if (parsed.nodes && parsed.edges) {
          return {
            nodes: parsed.nodes,
            edges: parsed.edges,
            summary: parsed.summary,
            stats: parsed.stats,
          }
        }
      } catch {
        // Tool output wasn't valid JSON, try extracting from it
      }
    }

    // Extract JSON from response text
    let jsonText = responseText

    // Try to extract from markdown code block
    const codeBlockMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)```/)
    if (codeBlockMatch) {
      jsonText = codeBlockMatch[1]
    }

    // Try to find JSON object
    const jsonMatch = jsonText.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      jsonText = jsonMatch[0]
    }

    const data = JSON.parse(jsonText)

    // Validate
    if (!data.nodes || !Array.isArray(data.nodes)) {
      throw new Error("Missing or invalid 'nodes' array")
    }
    if (!data.edges || !Array.isArray(data.edges)) {
      throw new Error("Missing or invalid 'edges' array")
    }

    return {
      nodes: data.nodes,
      edges: data.edges,
      summary: data.summary,
      stats: data.stats,
    }
  } catch (error) {
    console.error("[BackgroundAnalysis] Failed to parse result:", error)
    console.error("[BackgroundAnalysis] Raw text:", responseText.slice(0, 500))
    return null
  }
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
