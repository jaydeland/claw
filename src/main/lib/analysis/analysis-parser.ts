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
        if (parsed.nodes && parsed.edges && Array.isArray(parsed.nodes) && Array.isArray(parsed.edges)) {
          const validNodeIds = new Set(parsed.nodes.map((n: { id: string }) => n.id))
          const validEdges = parsed.edges.filter((edge: { source?: string; target?: string; id?: string }, index: number) => {
            const { source, target } = edge
            if (!source || !target || source === "undefined" || target === "undefined") {
              console.warn(`[parseAnalysisResult] toolOutput edge ${index} (${edge.id || 'no-id'}) missing source/target`)
              return false
            }
            if (!validNodeIds.has(source)) {
              console.warn(`[parseAnalysisResult] toolOutput edge ${index} (${edge.id || 'no-id'}) invalid source: "${source}"`)
              return false
            }
            if (!validNodeIds.has(target)) {
              console.warn(`[parseAnalysisResult] toolOutput edge ${index} (${edge.id || 'no-id'}) invalid target: "${target}"`)
              return false
            }
            return true
          })
          console.log(`[parseAnalysisResult] toolOutput: validated ${validEdges.length}/${parsed.edges.length} edges`)
          return {
            nodes: parsed.nodes,
            edges: validEdges,
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

    let data = JSON.parse(jsonText)

    // Handle wrapped response (e.g., {success: true, result: {...}})
    if (data.result && typeof data.result === "object") {
      data = data.result
    }

    // Validate
    if (!data.nodes || !Array.isArray(data.nodes)) {
      throw new Error("Missing or invalid 'nodes' array")
    }
    if (!data.edges || !Array.isArray(data.edges)) {
      throw new Error("Missing or invalid 'edges' array")
    }

    // Build a set of valid node IDs for edge validation
    const validNodeIds = new Set(data.nodes.map((n: { id: string }) => n.id))

    // Filter and validate edges
    const validEdges = data.edges.filter((edge: { source?: string; target?: string; id?: string }, index: number) => {
      const source = edge.source
      const target = edge.target

      // Check for missing source/target
      if (!source || !target) {
        console.warn(`[parseAnalysisResult] Edge ${index} (${edge.id || 'no-id'}) missing source/target:`, { source, target })
        return false
      }

      // Check for "undefined" string (common parsing error)
      if (source === "undefined" || target === "undefined") {
        console.warn(`[parseAnalysisResult] Edge ${index} (${edge.id || 'no-id'}) has "undefined" string`)
        return false
      }

      // Check if source/target exist in nodes
      if (!validNodeIds.has(source)) {
        console.warn(`[parseAnalysisResult] Edge ${index} (${edge.id || 'no-id'}) has invalid source: "${source}" not in nodes`)
        return false
      }
      if (!validNodeIds.has(target)) {
        console.warn(`[parseAnalysisResult] Edge ${index} (${edge.id || 'no-id'}) has invalid target: "${target}" not in nodes`)
        return false
      }

      return true
    })

    console.log(`[parseAnalysisResult] Validated ${validEdges.length}/${data.edges.length} edges`)

    return {
      nodes: data.nodes,
      edges: validEdges,
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
