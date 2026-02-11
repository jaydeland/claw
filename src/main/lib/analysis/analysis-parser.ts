/**
 * Analysis Result Parser
 *
 * Pure function for parsing analysis results from background task output.
 * No dependencies on electron or other native modules - can be tested in isolation.
 */

import type { AnalysisResult } from "./types"

/**
 * Parse the analysis result from the background task output
 * Exported for testing
 */
export function parseAnalysisResult(responseText: string, toolOutput?: string): AnalysisResult | null {
  try {
    // Try tool output first (cleaner result from Task tool)
    if (toolOutput && toolOutput.trim()) {
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
    console.error("[BackgroundAnalysis] Raw text length:", responseText?.length || 0)
    console.error("[BackgroundAnalysis] Raw text preview:", responseText?.slice(0, 1000) || "empty")
    console.error("[BackgroundAnalysis] Tool output:", toolOutput?.slice(0, 500) || "none/empty")
    return null
  }
}
