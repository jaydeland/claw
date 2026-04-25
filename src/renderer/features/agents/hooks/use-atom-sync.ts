import { useEffect, useRef } from "react"
import type { SetStateAction } from "jotai"

/**
 * Consolidated hook for syncing multiple atoms
 * Reduces multiple single-value atom sync effects into one
 */
export function useAtomSync<T>(
  value: T,
  setter: (update: SetStateAction<T>) => void,
  deps: React.DependencyList = []
) {
  const valueRef = useRef(value)
  valueRef.current = value

  useEffect(() => {
    setter(valueRef.current)
  }, [setter, ...deps])
}

/**
 * Hook for syncing a Set-based atom (add/remove pattern)
 */
export function useSetAtomSync(
  id: string,
  shouldAdd: boolean,
  setter: (update: SetStateAction<Set<string>>) => void
) {
  useEffect(() => {
    setter((prev) => {
      const newSet = new Set(prev)
      if (shouldAdd) {
        newSet.add(id)
      } else {
        newSet.delete(id)
      }
      // Only return new set if it changed
      if (newSet.size !== prev.size || !Array.from(newSet).every((item) => prev.has(item))) {
        return newSet
      }
      return prev
    })
  }, [id, shouldAdd, setter])
}

/**
 * Hook for cleaning up Set-based atom on unmount
 */
export function useSetAtomCleanup(
  id: string,
  setter: (update: SetStateAction<Set<string>>) => void
) {
  const idRef = useRef(id)
  idRef.current = id

  useEffect(() => {
    return () => {
      setter((prev) => {
        if (prev.has(idRef.current)) {
          const newSet = new Set(prev)
          newSet.delete(idRef.current)
          return newSet
        }
        return prev
      })
    }
  }, [setter])
}

/**
 * Combined hook for pending plan approvals atom management
 * Replaces 2 separate useEffect hooks
 */
export function usePendingPlanApprovalsSync(
  subChatId: string,
  hasUnapprovedPlan: boolean,
  setPendingPlanApprovals: (update: SetStateAction<Set<string>>) => void
) {
  // Sync hasUnapprovedPlan state to atom
  useEffect(() => {
    setPendingPlanApprovals((prev: Set<string>) => {
      const newSet = new Set(prev)
      if (hasUnapprovedPlan) {
        newSet.add(subChatId)
      } else {
        newSet.delete(subChatId)
      }
      if (newSet.size !== prev.size || !Array.from(newSet).every((id) => prev.has(id))) {
        return newSet
      }
      return prev
    })
  }, [hasUnapprovedPlan, subChatId, setPendingPlanApprovals])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      setPendingPlanApprovals((prev: Set<string>) => {
        if (prev.has(subChatId)) {
          const newSet = new Set(prev)
          newSet.delete(subChatId)
          return newSet
        }
        return prev
      })
    }
  }, [subChatId, setPendingPlanApprovals])
}

/**
 * Hook for syncing rollback handler to atom
 * Replaces 2 separate useEffect hooks
 */
export function useRollbackSync(
  handleRollback: ((msg: any) => Promise<void>) | null,
  isRollingBack: boolean,
  setRollbackHandler: (update: SetStateAction<((msg: any) => Promise<void>) | null>) => void,
  setIsRollingBackAtom: (value: boolean) => void
) {
  // Sync handler
  useEffect(() => {
    setRollbackHandler(handleRollback ? () => handleRollback : null)
    return () => setRollbackHandler(null)
  }, [handleRollback, setRollbackHandler])

  // Sync isRollingBack state
  useEffect(() => {
    setIsRollingBackAtom(isRollingBack)
  }, [isRollingBack, setIsRollingBackAtom])
}

/**
 * Hook for syncing streaming status to loading atoms
 * Replaces streaming status sync effects
 */
export function useStreamingStatusSync(
  subChatId: string,
  isStreaming: boolean,
  parentChatId: string,
  setLoadingSubChats: (update: SetStateAction<Map<string, string>>) => void,
  setStreamingStatus: (subChatId: string, status: "ready" | "streaming" | "submitted" | "error") => void,
  status: string
) {
  // Sync loading status to atom
  useEffect(() => {
    if (isStreaming) {
      setLoadingSubChats((prev) => {
        const newMap = new Map(prev)
        newMap.set(subChatId, parentChatId)
        return newMap
      })
    } else {
      setLoadingSubChats((prev) => {
        if (prev.has(subChatId)) {
          const newMap = new Map(prev)
          newMap.delete(subChatId)
          return newMap
        }
        return prev
      })
    }
  }, [isStreaming, subChatId, parentChatId, setLoadingSubChats])

  // Sync status to streaming status store
  useEffect(() => {
    setStreamingStatus(subChatId, status as "ready" | "streaming" | "submitted" | "error")
  }, [subChatId, status, setStreamingStatus])
}
