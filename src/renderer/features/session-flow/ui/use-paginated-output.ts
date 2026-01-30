import { useState, useCallback, useEffect, useRef } from "react"
import { trpc } from "@/lib/trpc"

interface OutputState {
  lines: string[] // All loaded lines (in order from oldest to newest)
  totalLines: number // Total lines in file
  oldestLoadedLine: number // 0-based index of oldest loaded line
  newestLoadedLine: number // 0-based index of newest loaded line
  isLoadingMore: boolean // Loading previous chunk
  hasOlderLines: boolean // More lines available to load
}

interface UsePaginatedOutputOptions {
  enabled?: boolean // Whether to fetch data
  initialLimit?: number // Initial number of lines to load (default: 500)
  chunkSize?: number // Number of lines to load per "Load More" (default: 500)
}

export function usePaginatedOutput(
  taskId: string,
  options: UsePaginatedOutputOptions = {}
) {
  const { enabled = true, initialLimit = 500, chunkSize = 500 } = options

  const [state, setState] = useState<OutputState>({
    lines: [],
    totalLines: 0,
    oldestLoadedLine: 0,
    newestLoadedLine: -1,
    isLoadingMore: false,
    hasOlderLines: false,
  })

  const [pollingEnabled, setPollingEnabled] = useState(true)
  const prevTotalLinesRef = useRef<number>(0)

  // Initial load: fetch last N lines with metadata
  const { data: initialData, isLoading: isInitialLoading } =
    trpc.tasks.getWithOutput.useQuery(
      { taskId, tailLines: initialLimit, includeMetadata: true },
      {
        enabled: enabled && !state.lines.length && pollingEnabled,
        refetchInterval: (data) => {
          // Poll every 2 seconds if task is running, otherwise stop polling
          return data?.status === "running" ? 2000 : false
        },
      }
    )

  // Effect: Initialize state from initial data
  useEffect(() => {
    if (initialData) {
      console.log("[usePaginatedOutput] Initial data received:", {
        hasOutput: !!initialData.output,
        outputLength: initialData.output?.length,
        hasMetadata: !!initialData.outputMetadata,
        metadata: initialData.outputMetadata,
      })

      if (initialData.output && initialData.outputMetadata) {
        const lines = initialData.output.split("\n")
        const metadata = initialData.outputMetadata

        setState({
          lines,
          totalLines: metadata.totalLines,
          oldestLoadedLine: metadata.startLine,
          newestLoadedLine: metadata.endLine,
          isLoadingMore: false,
          hasOlderLines: metadata.hasMore,
        })

        prevTotalLinesRef.current = metadata.totalLines
      } else if (initialData.output) {
        // Fallback: Handle case where metadata is missing
        const lines = initialData.output.split("\n")
        console.warn("[usePaginatedOutput] No metadata, using fallback")

        setState({
          lines,
          totalLines: lines.length,
          oldestLoadedLine: 0,
          newestLoadedLine: lines.length - 1,
          isLoadingMore: false,
          hasOlderLines: false, // Can't determine without metadata
        })

        prevTotalLinesRef.current = lines.length
      }
    }
  }, [initialData])

  // Mutation for loading more (pagination)
  const loadMoreMutation = trpc.tasks.getWithOutput.useMutation()

  // Load more function
  const loadMore = useCallback(async () => {
    if (state.isLoadingMore || !state.hasOlderLines) return

    setState((prev) => ({ ...prev, isLoadingMore: true }))

    try {
      // Calculate offset for previous chunk
      const newOffset = Math.max(0, state.oldestLoadedLine - chunkSize)
      const limit = Math.min(chunkSize, state.oldestLoadedLine)

      const result = await loadMoreMutation.mutateAsync({
        taskId,
        offset: newOffset,
        limit,
        includeMetadata: true,
      })

      if (result?.output && result.outputMetadata) {
        const newLines = result.output.split("\n")
        const metadata = result.outputMetadata

        setState((prev) => ({
          lines: [...newLines, ...prev.lines], // Prepend new lines
          totalLines: metadata.totalLines,
          oldestLoadedLine: metadata.startLine,
          newestLoadedLine: prev.newestLoadedLine, // Keep existing newest
          isLoadingMore: false,
          hasOlderLines: metadata.hasMore,
        }))
      }
    } catch (error) {
      console.error("Failed to load more lines:", error)
      setState((prev) => ({ ...prev, isLoadingMore: false }))
    }
  }, [taskId, state.oldestLoadedLine, state.hasOlderLines, state.isLoadingMore, chunkSize, loadMoreMutation])

  // Refresh function (reload from current position)
  const refresh = useCallback(() => {
    setPollingEnabled(false)
    setState({
      lines: [],
      totalLines: 0,
      oldestLoadedLine: 0,
      newestLoadedLine: -1,
      isLoadingMore: false,
      hasOlderLines: false,
    })
    // Re-enable polling after a short delay
    setTimeout(() => setPollingEnabled(true), 100)
  }, [])

  // Reset function (clear state)
  const reset = useCallback(() => {
    setState({
      lines: [],
      totalLines: 0,
      oldestLoadedLine: 0,
      newestLoadedLine: -1,
      isLoadingMore: false,
      hasOlderLines: false,
    })
    prevTotalLinesRef.current = 0
  }, [])

  // Detect when new output is available (totalLines increased)
  const hasNewOutput =
    prevTotalLinesRef.current > 0 &&
    state.totalLines > prevTotalLinesRef.current

  // Get combined output as single string
  const output = state.lines.join("\n")

  return {
    // State
    output,
    lines: state.lines,
    totalLines: state.totalLines,
    oldestLoadedLine: state.oldestLoadedLine,
    newestLoadedLine: state.newestLoadedLine,
    hasOlderLines: state.hasOlderLines,
    hasNewOutput,

    // Loading states
    isLoading: isInitialLoading,
    isLoadingMore: state.isLoadingMore,

    // Actions
    loadMore,
    refresh,
    reset,

    // Task info from initial data
    status: initialData?.status,
    exitCode: initialData?.exitCode,
    command: initialData?.command,
    description: initialData?.description,
    outputFile: initialData?.outputFile,
  }
}
