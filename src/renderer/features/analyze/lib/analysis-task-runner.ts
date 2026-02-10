/**
 * Analysis Task Runner
 *
 * Handles spawning parallel analysis agents using the Claude SDK.
 * Each analysis type (Code Flow, DB, Architecture, Build) runs as a separate
 * Task tool invocation with a specialized subagent.
 */

import { trpc } from "../../../lib/trpc"
import type { AnalysisType } from "../../../../main/lib/trpc/routers/analyzer"

export interface AnalysisTask {
  id: string
  type: AnalysisType
  projectId: string
  diagramId: string
  status: "pending" | "running" | "completed" | "failed"
  prompt: string
}

export interface AnalysisResult {
  success: boolean
  type: AnalysisType
  diagramId: string
  nodes?: Array<{
    id: string
    type?: string
    position: { x: number; y: number }
    data: Record<string, unknown>
  }>
  edges?: Array<{
    id: string
    source: string
    target: string
    type?: string
    label?: string
  }>
  summary?: string
  stats?: Record<string, unknown>
  error?: string
}

/**
 * Start an analysis task for a specific type
 */
export async function startAnalysisTask(
  projectId: string,
  type: AnalysisType,
  projectPath: string,
  utils: ReturnType<typeof trpc.useUtils>
): Promise<AnalysisTask | null> {
  try {
    // Get or create the diagram
    const diagram = await utils.client.analyzer.getOrCreate.mutate({
      projectId,
      type,
    })

    if (!diagram) {
      throw new Error("Failed to create diagram")
    }

    // Get the prompt for this analysis type
    const { prompt } = await utils.client.analyzer.getPrompt.query({ type })

    // Create the analysis job
    const job = await utils.client.analyzer.jobs.create.mutate({
      projectId,
      diagramId: diagram.id,
      type,
    })

    if (!job) {
      throw new Error("Failed to create analysis job")
    }

    // Return task info - the actual execution will be handled by the caller
    // (either through a direct Claude SDK call or via the chat interface)
    return {
      id: job.id,
      type,
      projectId,
      diagramId: diagram.id,
      status: "running",
      prompt,
    }
  } catch (error) {
    console.error("[AnalysisTaskRunner] Failed to start task:", error)
    return null
  }
}

/**
 * Parse the JSON response from the analysis agent
 */
export function parseAnalysisResponse(responseText: string): AnalysisResult | null {
  try {
    // Try to extract JSON from the response
    // The response might be wrapped in markdown code blocks or have extra text
    let jsonText = responseText

    // Extract from markdown code block if present
    const codeBlockMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)```/)
    if (codeBlockMatch) {
      jsonText = codeBlockMatch[1]
    }

    // Try to find JSON object in the text
    const jsonMatch = jsonText.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      jsonText = jsonMatch[0]
    }

    const data = JSON.parse(jsonText)

    // Validate required fields
    if (!data.nodes || !Array.isArray(data.nodes)) {
      throw new Error("Missing or invalid 'nodes' array")
    }
    if (!data.edges || !Array.isArray(data.edges)) {
      throw new Error("Missing or invalid 'edges' array")
    }

    return {
      success: true,
      type: data.type || "unknown",
      diagramId: data.diagramId || "",
      nodes: data.nodes,
      edges: data.edges,
      summary: data.summary,
      stats: data.stats,
    }
  } catch (error) {
    console.error("[AnalysisTaskRunner] Failed to parse response:", error)
    return {
      success: false,
      type: "unknown",
      diagramId: "",
      error: error instanceof Error ? error.message : "Failed to parse response",
    }
  }
}

/**
 * Save analysis results to the database
 */
export async function saveAnalysisResults(
  diagramId: string,
  result: AnalysisResult,
  utils: ReturnType<typeof trpc.useUtils>
): Promise<boolean> {
  try {
    if (!result.success) {
      // Update status to error
      await utils.client.analyzer.updateStatus.mutate({
        id: diagramId,
        status: "error",
        errorMessage: result.error || "Unknown error",
      })
      return false
    }

    // Update diagram with results
    await utils.client.analyzer.update.mutate({
      id: diagramId,
      nodes: result.nodes,
      edges: result.edges,
      summary: result.summary,
      stats: result.stats,
    })

    // Update status to complete
    await utils.client.analyzer.updateStatus.mutate({
      id: diagramId,
      status: "complete",
    })

    return true
  } catch (error) {
    console.error("[AnalysisTaskRunner] Failed to save results:", error)
    return false
  }
}

/**
 * Generate all 4 analysis types in parallel
 */
export async function generateAllAnalyses(
  projectId: string,
  projectPath: string,
  utils: ReturnType<typeof trpc.useUtils>
): Promise<AnalysisTask[]> {
  const types: AnalysisType[] = ["codeflow", "db", "architecture", "build"]

  // Start all analysis tasks in parallel
  const tasks = await Promise.all(
    types.map((type) => startAnalysisTask(projectId, type, projectPath, utils))
  )

  return tasks.filter((t): t is AnalysisTask => t !== null)
}
