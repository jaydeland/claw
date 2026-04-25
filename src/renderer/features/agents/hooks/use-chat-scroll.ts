import { useCallback, useEffect, useLayoutEffect, useRef } from "react"

interface ChatScrollConfig {
  subChatId: string
  isActive: boolean
  status: string
  messages: any[]
}

/**
 * Consolidated hook for chat scroll management
 * Combines scroll initialization, scroll listener, and auto-scroll effects
 * Reduces 4 separate effects into 1 unified hook
 */
export function useChatScroll(config: ChatScrollConfig) {
  const { subChatId, isActive, status, messages } = config

  // Scroll management refs
  const shouldAutoScrollRef = useRef(true)
  const isAutoScrollingRef = useRef(false)
  const isInitializingScrollRef = useRef(false)
  const chatContainerRef = useRef<HTMLElement | null>(null)
  const chatContainerObserverRef = useRef<ResizeObserver | null>(null)
  const prevScrollTopRef = useRef(0)
  const scrollInitializedRef = useRef(false)
  const hasInitializedRef = useRef(false)

  // Keep isActive in ref for scroll event handler
  const isActiveRef = useRef(isActive)
  isActiveRef.current = isActive

  // Check if user is at bottom of chat
  const isAtBottom = useCallback(() => {
    const container = chatContainerRef.current
    if (!container) return true
    const threshold = 50
    return (
      container.scrollHeight - container.scrollTop - container.clientHeight <=
      threshold
    )
  }, [])

  // Handle scroll events to detect user scrolling
  const handleScroll = useCallback(() => {
    if (!isActiveRef.current) return

    const container = chatContainerRef.current
    if (!container) return

    const currentScrollTop = container.scrollTop
    const prevScrollTop = prevScrollTopRef.current
    prevScrollTopRef.current = currentScrollTop

    // Ignore scroll events during initialization
    if (isAutoScrollingRef.current || isInitializingScrollRef.current) return

    // If user scrolls UP - disable auto-scroll
    if (currentScrollTop < prevScrollTop) {
      shouldAutoScrollRef.current = false
      return
    }

    // If user scrolls DOWN and reaches bottom - enable auto-scroll
    shouldAutoScrollRef.current = isAtBottom()
  }, [isAtBottom])

  // Scroll to bottom handler with ease-in-out animation
  const scrollToBottom = useCallback(() => {
    const container = chatContainerRef.current
    if (!container) return

    isAutoScrollingRef.current = true
    shouldAutoScrollRef.current = true

    const start = container.scrollTop
    const duration = 300
    const startTime = performance.now()

    const easeInOutCubic = (t: number) =>
      t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2

    const animateScroll = (currentTime: number) => {
      const elapsed = currentTime - startTime
      const progress = Math.min(elapsed / duration, 1)
      const easedProgress = easeInOutCubic(progress)
      const end = container.scrollHeight - container.clientHeight
      container.scrollTop = start + (end - start) * easedProgress

      if (progress < 1) {
        requestAnimationFrame(animateScroll)
      } else {
        container.scrollTop = container.scrollHeight
        isAutoScrollingRef.current = false
      }
    }

    requestAnimationFrame(animateScroll)
  }, [])

  // ===== Combined: Initialize scroll + attach listener + auto-scroll during streaming =====
  useLayoutEffect(() => {
    if (!isActive) return

    const container = chatContainerRef.current
    if (!container) return

    // With keep-alive, only initialize once per tab mount
    if (hasInitializedRef.current) return
    hasInitializedRef.current = true

    scrollInitializedRef.current = false
    isInitializingScrollRef.current = true

    // IMMEDIATE scroll to bottom - no waiting
    container.scrollTop = container.scrollHeight
    shouldAutoScrollRef.current = true
    scrollInitializedRef.current = true
    isInitializingScrollRef.current = false

    // MutationObserver for async content (images, code blocks loading after initial render)
    const observer = new MutationObserver((mutations) => {
      if (!isActiveRef.current) return
      if (!shouldAutoScrollRef.current) return

      const hasAddedContent = mutations.some(
        (m) => m.type === "childList" && m.addedNodes.length > 0
      )

      if (hasAddedContent) {
        requestAnimationFrame(() => {
          isAutoScrollingRef.current = true
          container.scrollTop = container.scrollHeight
          requestAnimationFrame(() => {
            isAutoScrollingRef.current = false
          })
        })
      }
    })

    observer.observe(container, { childList: true, subtree: true })

    return () => {
      observer.disconnect()
    }
  }, [subChatId, isActive])

  // ===== Attach scroll listener =====
  useEffect(() => {
    const container = chatContainerRef.current
    if (!container) return

    container.addEventListener("scroll", handleScroll, { passive: true })
    return () => {
      container.removeEventListener("scroll", handleScroll)
    }
  }, [handleScroll])

  // ===== Auto scroll to bottom when messages change during streaming =====
  useEffect(() => {
    if (!isActive) return
    if (!scrollInitializedRef.current) return

    if (shouldAutoScrollRef.current && status === "streaming") {
      const container = chatContainerRef.current
      if (container) {
        requestAnimationFrame(() => {
          isAutoScrollingRef.current = true
          container.scrollTop = container.scrollHeight
          requestAnimationFrame(() => {
            isAutoScrollingRef.current = false
          })
        })
      }
    }
  }, [isActive, messages, status, subChatId])

  // ===== Cleanup isAutoScrollingRef on unmount =====
  useEffect(() => {
    return () => {
      isAutoScrollingRef.current = false
    }
  }, [])

  // Container ref callback for setting up ResizeObserver
  const setContainerRef = useCallback((el: HTMLElement | null) => {
    // Cleanup previous observer
    if (chatContainerObserverRef.current) {
      chatContainerObserverRef.current.disconnect()
      chatContainerObserverRef.current = null
    }

    chatContainerRef.current = el

    // Setup ResizeObserver for --chat-container-height CSS variable
    if (el) {
      const observer = new ResizeObserver((entries) => {
        const height = entries[0]?.contentRect.height ?? 0
        el.style.setProperty("--chat-container-height", `${height}px`)
      })
      observer.observe(el)
      chatContainerObserverRef.current = observer
    }
  }, [])

  return {
    chatContainerRef,
    setContainerRef,
    scrollToBottom,
    handleScroll,
    shouldAutoScrollRef,
    isAutoScrollingRef,
  }
}
