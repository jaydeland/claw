import { useEffect, useRef, useState, useCallback } from "react"

interface DiffSidebarEffectsConfig {
  isDiffSidebarOpen: boolean
  worktreePath: string | null
  parsedFileDiffs: any[] | null
  gitStatus: {
    staged?: any[]
    unstaged?: any[]
    untracked?: any[]
  } | undefined
  isGitStatusLoading: boolean
  storedDiffSidebarWidth: number
  fetchDiffStats: () => Promise<void>
  refetchGitStatus: () => void
  setParsedFileDiffs: (files: any[] | null) => void
  setPrefetchedFileContents: (contents: Record<string, string>) => void
  setDiffContent: (content: string | null) => void
  setDiffStats: (stats: {
    fileCount: number
    additions: number
    deletions: number
    isLoading: boolean
    hasChanges: boolean
  }) => void
}

/**
 * Consolidated hook for diff sidebar effects
 * Reduces 6+ separate useEffect hooks into fewer, more organized effects
 */
export function useDiffSidebarEffects(config: DiffSidebarEffectsConfig) {
  const {
    isDiffSidebarOpen,
    worktreePath,
    parsedFileDiffs,
    gitStatus,
    isGitStatusLoading,
    storedDiffSidebarWidth,
    fetchDiffStats,
    refetchGitStatus,
    setParsedFileDiffs,
    setPrefetchedFileContents,
    setDiffContent,
    setDiffStats,
  } = config

  const diffSidebarRef = useRef<HTMLDivElement>(null)
  const [diffSidebarWidth, setDiffSidebarWidth] = useState(storedDiffSidebarWidth)

  // Keep fetchDiffStats in ref for use in callbacks
  const fetchDiffStatsRef = useRef(fetchDiffStats)
  fetchDiffStatsRef.current = fetchDiffStats

  // ===== Combined effect: Fetch diff stats on mount + sidebar open + window focus =====
  useEffect(() => {
    // Fetch on mount
    fetchDiffStatsRef.current()

    // Only set up window focus listener if sidebar is open
    if (!isDiffSidebarOpen || !worktreePath) return

    const handleWindowFocus = () => {
      refetchGitStatus()
      fetchDiffStatsRef.current()
    }

    window.addEventListener("focus", handleWindowFocus)
    return () => window.removeEventListener("focus", handleWindowFocus)
  }, [isDiffSidebarOpen, worktreePath, refetchGitStatus])

  // ===== Refresh diff stats when sidebar opens (background refresh) =====
  useEffect(() => {
    if (isDiffSidebarOpen) {
      fetchDiffStatsRef.current()
    }
  }, [isDiffSidebarOpen])

  // ===== Sync parsedFileDiffs with git status =====
  // Clear diff data when all files are committed (external git commit)
  useEffect(() => {
    if (!gitStatus || isGitStatusLoading) return

    const hasUncommittedChanges =
      (gitStatus.staged?.length ?? 0) > 0 ||
      (gitStatus.unstaged?.length ?? 0) > 0 ||
      (gitStatus.untracked?.length ?? 0) > 0

    // If git shows no changes but we still have parsedFileDiffs, clear them
    if (!hasUncommittedChanges && parsedFileDiffs && parsedFileDiffs.length > 0) {
      console.log("[useDiffSidebarEffects] Git status empty, clearing diff data")
      setParsedFileDiffs([])
      setPrefetchedFileContents({})
      setDiffContent(null)
      setDiffStats({
        fileCount: 0,
        additions: 0,
        deletions: 0,
        isLoading: false,
        hasChanges: false,
      })
    }
  }, [gitStatus, isGitStatusLoading, parsedFileDiffs, setParsedFileDiffs, setPrefetchedFileContents, setDiffContent, setDiffStats])

  // ===== ResizeObserver for diff sidebar width tracking =====
  useEffect(() => {
    if (!isDiffSidebarOpen) return

    let observer: ResizeObserver | null = null
    let rafId: number | null = null

    const checkRef = () => {
      const element = diffSidebarRef.current
      if (!element) {
        rafId = requestAnimationFrame(checkRef)
        return
      }

      setDiffSidebarWidth(element.offsetWidth || storedDiffSidebarWidth)

      observer = new ResizeObserver((entries) => {
        for (const entry of entries) {
          const width = entry.contentRect.width
          if (width > 0) {
            setDiffSidebarWidth(width)
          }
        }
      })

      observer.observe(element)
    }

    checkRef()

    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId)
      if (observer) observer.disconnect()
    }
  }, [isDiffSidebarOpen, storedDiffSidebarWidth])

  return {
    diffSidebarRef,
    diffSidebarWidth,
    fetchDiffStatsRef,
  }
}

/**
 * Hook for throttled diff refetch when sub-chat files change
 */
export function useThrottledDiffRefetch(
  totalSubChatFileCount: number,
  fetchDiffStats: () => Promise<void>,
  throttleMs: number = 2000
) {
  const lastDiffFetchTimeRef = useRef<number>(Date.now())
  const fetchDiffStatsRef = useRef(fetchDiffStats)
  fetchDiffStatsRef.current = fetchDiffStats

  useEffect(() => {
    if (totalSubChatFileCount === 0) return

    const now = Date.now()
    const timeSinceLastFetch = now - lastDiffFetchTimeRef.current

    if (timeSinceLastFetch >= throttleMs) {
      lastDiffFetchTimeRef.current = now
      fetchDiffStatsRef.current()
    } else {
      const delay = throttleMs - timeSinceLastFetch
      const timer = setTimeout(() => {
        lastDiffFetchTimeRef.current = Date.now()
        fetchDiffStatsRef.current()
      }, delay)
      return () => clearTimeout(timer)
    }
  }, [totalSubChatFileCount, throttleMs])
}
