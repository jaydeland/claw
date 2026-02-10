"use client"

import { useCallback, useEffect, useRef } from "react"
import { useSetAtom } from "jotai"
import { trpc } from "../../../lib/trpc"
import type { AnalysisType } from "../../../../main/lib/trpc/routers/analyzer"
import {
  isGeneratingAtom,
  diagramLoadingAtom,
  diagramErrorAtom,
  activeAnalysisJobsAtom,
} from "../atoms"
import type { AnalysisProgressUpdate } from "../../../../main/lib/analysis/background-analysis-runner"

interface UseAnalysisServiceOptions {
  projectId: string
  projectPath: string
}

interface ActiveJob {
  id: string
  type: AnalysisType
  status: "pending" | "running" | "completed" | "failed"
  progress?: number
  message?: string
  startedAt: Date
}

/**
 * Hook for managing analysis generation via background session
 *
 * This uses the background Claude session with Task tool to spawn
 * parallel analysis agents. No active chat is required - the analysis
 * runs entirely in the background and reports progress via tRPC
 * subscriptions.
 */
export function useAnalysisService({ projectId, projectPath }: UseAnalysisServiceOptions) {
  const setIsGenerating = useSetAtom(isGeneratingAtom)
  const setIsLoading = useSetAtom(diagramLoadingAtom)
  const setError = useSetAtom(diagramErrorAtom)
  const setActiveJobs = useSetAtom(activeAnalysisJobsAtom)

  const utils = trpc.useUtils()
  const activeJobIdsRef = useRef<Set<string>>(new Set())

  // Subscribe to background progress updates
  const progressSubscription = utils.analyzer.subscribeBackgroundProgress.useSubscription(undefined, {
    onData: (update: AnalysisProgressUpdate) => {
      // Only handle updates for our project
      if (!update.jobId) return

      // Update active jobs map
      setActiveJobs((prev) => {
        const next = new Map(prev)
        const existing = next.get(update.jobId)

        if (update.status === "completed" || update.status === "failed") {
          // Remove from active jobs when done
          next.delete(update.jobId)
          activeJobIdsRef.current.delete(update.jobId)

          // Refresh diagram data
          utils.analyzer.get.invalidate({ projectId, type: update.type })

          // Check if all jobs are done
          if (activeJobIdsRef.current.size === 0) {
            setIsGenerating(false)
            setIsLoading(false)
          }
        } else {
          // Update or add active job
          next.set(update.jobId, {
            id: update.jobId,
            type: update.type,
            status: update.status,
            progress: update.progress,
            message: update.message,
            startedAt: existing?.startedAt || new Date(),
          })
        }

        return next
      })

      // Set error if failed
      if (update.status === "failed" && update.error) {
        setError(update.error)
        setIsGenerating(false)
        setIsLoading(false)
      }
    },
    onError: (err) => {
      console.error("[useAnalysisService] Progress subscription error:", err)
    },
  })

  // Subscribe to diagram updates
  const diagramSubscription = utils.analyzer.subscribe.useSubscription(
    { projectId },
    {
      onData: (update) => {
        // Invalidate the specific diagram to refresh data
        utils.analyzer.get.invalidate({ projectId, type: update.diagram.type as AnalysisType })
      },
      onError: (err) => {
        console.error("[useAnalysisService] Diagram subscription error:", err)
      },
    }
  )

  /**
   * Generate a single analysis type via background session
   */
  const generateAnalysis = useCallback(
    async (type: AnalysisType) => {
      if (!projectPath) {
        setError("No project path available")
        return null
      }

      setIsGenerating(true)
      setIsLoading(true)
      setError(null)

      try {
        // Call the background analysis mutation
        const result = await utils.client.analyzer.generateViaBackground.mutate({
          projectId,
          projectPath,
          type,
        })

        if (!result.success || !result.job) {
          const errorMessage = result.error || "Failed to start background analysis"
          setError(errorMessage)
          setIsGenerating(false)
          setIsLoading(false)
          return null
        }

        // Track this job
        activeJobIdsRef.current.add(result.job.id)

        // Add to active jobs
        setActiveJobs((prev) => {
          const next = new Map(prev)
          next.set(result.job!.id, {
            id: result.job!.id,
            type,
            status: "running",
            message: "Starting analysis...",
            startedAt: new Date(),
          })
          return next
        })

        return { jobId: result.job.id, diagramId: result.job.diagramId }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : "Analysis failed"
        setError(errorMessage)
        setIsGenerating(false)
        setIsLoading(false)
        return null
      }
    },
    [projectId, projectPath, utils, setIsGenerating, setIsLoading, setError, setActiveJobs]
  )

  /**
   * Generate all 4 analysis types in parallel via background
   */
  const generateAll = useCallback(async () => {
    if (!projectPath) {
      setError("No project path available")
      return null
    }

    setIsGenerating(true)
    setIsLoading(true)
    setError(null)

    try {
      // Call the background all-analysis mutation
      const results = await utils.client.analyzer.generateAllViaBackground.mutate({
        projectId,
        projectPath,
      })

      const successful: Array<{ type: AnalysisType; jobId: string; diagramId: string }> = []

      for (const result of results) {
        if (result.success && result.job) {
          activeJobIdsRef.current.add(result.job.id)

          setActiveJobs((prev) => {
            const next = new Map(prev)
            next.set(result.job!.id, {
              id: result.job!.id,
              type: result.type,
              status: "running",
              message: "Starting analysis...",
              startedAt: new Date(),
            })
            return next
          })

          successful.push({
            type: result.type,
            jobId: result.job.id,
            diagramId: result.job.diagramId,
          })
        } else {
          console.error(`[useAnalysisService] Failed to start ${result.type}:`, result.error)
        }
      }

      if (successful.length === 0) {
        setError("Failed to start any analyses")
        setIsGenerating(false)
        setIsLoading(false)
        return null
      }

      return successful
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to start analyses"
      setError(errorMessage)
      setIsGenerating(false)
      setIsLoading(false)
      return null
    }
  }, [projectId, projectPath, utils, setIsGenerating, setIsLoading, setError, setActiveJobs])

  /**
   * Cancel an ongoing analysis
   */
  const cancelAnalysis = useCallback(
    async (jobId: string) => {
      try {
        await utils.client.analyzer.cancelBackground.mutate({ jobId })

        activeJobIdsRef.current.delete(jobId)

        setActiveJobs((prev) => {
          const next = new Map(prev)
          next.delete(jobId)
          return next
        })

        // If no more active jobs, clear loading states
        if (activeJobIdsRef.current.size === 0) {
          setIsGenerating(false)
          setIsLoading(false)
        }
      } catch (err) {
        console.error("[useAnalysisService] Failed to cancel analysis:", err)
      }
    },
    [utils, setActiveJobs, setIsGenerating, setIsLoading]
  )

  /**
   * Cancel all running analyses
   */
  const cancelAll = useCallback(async () => {
    const jobsToCancel = Array.from(activeJobIdsRef.current)

    await Promise.all(jobsToCancel.map((jobId) => cancelAnalysis(jobId)))

    activeJobIdsRef.current.clear()
    setIsGenerating(false)
    setIsLoading(false)
  }, [cancelAnalysis, setIsGenerating, setIsLoading])

  // Cleanup subscriptions on unmount
  useEffect(() => {
    return () => {
      progressSubscription.unsubscribe()
      diagramSubscription.unsubscribe()
    }
  }, [progressSubscription, diagramSubscription])

  return {
    generateAnalysis,
    generateAll,
    cancelAnalysis,
    cancelAll,
  }
}
