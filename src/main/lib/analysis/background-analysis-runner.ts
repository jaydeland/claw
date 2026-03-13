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

  db: `Analyze this codebase and generate a FLOWCHART showing the high-level database interaction flow.

CRITICAL CONSTRAINTS:
- MAXIMUM 10-20 nodes (keep it simple and high-level)
- Use standard FLOWCHART conventions
- Focus on data flow patterns, not detailed schema
- Group related tables/operations

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
      "label": "Read|Write|Join",
      "type": "smoothstep"
    }
  ],
  "summary": "Database interaction flow overview",
  "stats": { "nodeCount": 12 }
}

CRITICAL EDGE REQUIREMENTS:
- Each edge's "source" MUST be the EXACT "id" of a node in the nodes array
- Each edge's "target" MUST be the EXACT "id" of a node in the nodes array
- NEVER use "undefined", null, or empty strings for source or target
- Every source/target ID must match a node id exactly (case-sensitive)

FLOWCHART NODE TYPES:
- "start" - User action/trigger (rounded, green)
- "end" - Return result (rounded, green)
- "process" - Query/update operation (rectangle, blue)
- "decision" - Read vs Write, validation (diamond, yellow)
- "data" - Main tables/collections (parallelogram, purple)
- "subprocess" - Complex joins/transactions (rectangle, orange)

EXAMPLE FLOW (12 nodes):
Start (User Request) → [Decision: Read or Write?]
  → Read Path: Query Tables → Join Relations → Return Data → End
  → Write Path: Validate Input → [Decision: Valid?]
    → Yes: Update Tables → Trigger Events → Return Success → End
    → No: Return Error → End

LAYOUT RULES:
- Start node at top center (x: 400, y: 0)
- Decision nodes for operation type (y: 180)
- Branch paths (left: read x: 200, right: write x: 600)
- End nodes at bottom (multiple if needed)

IMPORTANT: Return ONLY valid JSON. No markdown, no code blocks, no explanations. Keep total nodes between 10-20.`,

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

    // Build the prompt - use system prompt from DB for "db" analysis type
    let analysisPrompt: string
    if (type === "db") {
      // Fetch the system prompt from database (falls back to hardcoded if not found)
      const dbPrompt = getPromptByKey(PROMPT_KEYS.ANALYSIS_DB)
      analysisPrompt = dbPrompt || ANALYSIS_PROMPTS.db
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
