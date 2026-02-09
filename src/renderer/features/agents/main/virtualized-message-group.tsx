import { useEffect, useRef, useState, type ReactNode } from "react"

interface VirtualizedMessageGroupProps {
  children: ReactNode
  alwaysMounted: boolean
}

/**
 * Lazy-mount wrapper for message groups using IntersectionObserver
 *
 * When a message group scrolls far off-screen, this component:
 * 1. Unmounts the children (releases DOM nodes, React components, and memory)
 * 2. Renders a placeholder div with the measured height to preserve scroll position
 *
 * When the group scrolls back into viewport range, children are re-mounted.
 *
 * The last 3 groups are always mounted (alwaysMounted=true) to support:
 * - Streaming content at the bottom
 * - Auto-scroll behavior
 */
export function VirtualizedMessageGroup({
  children,
  alwaysMounted,
}: VirtualizedMessageGroupProps) {
  const wrapperRef = useRef<HTMLDivElement>(null)
  const [isVisible, setIsVisible] = useState(true)
  const [measuredHeight, setMeasuredHeight] = useState<number | null>(null)

  // If alwaysMounted, always render children
  if (alwaysMounted) {
    return <div ref={wrapperRef}>{children}</div>
  }

  useEffect(() => {
    const wrapper = wrapperRef.current
    if (!wrapper) return

    // IntersectionObserver to detect when group is in/near viewport
    // rootMargin of 2000px means we keep groups mounted within 2 viewport heights
    const intersectionObserver = new IntersectionObserver(
      (entries) => {
        const entry = entries[0]
        if (entry) {
          setIsVisible(entry.isIntersecting)
        }
      },
      {
        rootMargin: "2000px 0px", // 2000px above and below viewport
      }
    )

    intersectionObserver.observe(wrapper)

    // ResizeObserver to track height changes (for when children expand/collapse)
    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (entry) {
        setMeasuredHeight(entry.contentRect.height)
      }
    })

    resizeObserver.observe(wrapper)

    return () => {
      intersectionObserver.disconnect()
      resizeObserver.disconnect()
    }
  }, [])

  // If not visible and we have a measured height, render placeholder
  if (!isVisible && measuredHeight !== null) {
    return <div ref={wrapperRef} style={{ height: measuredHeight }} />
  }

  // Render children (first render, or when visible)
  return <div ref={wrapperRef}>{children}</div>
}
