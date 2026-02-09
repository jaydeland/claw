"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { cn } from "../../../lib/utils"

/**
 * Hybrid traffic lights component for macOS desktop app
 * - Shows native macOS traffic lights when hovered (with proper colors and click handling)
 * - Shows custom muted circles when NOT hovered (for visual indication)
 * - Manages its own hover state internally
 * Note: isDesktop prop should be passed from parent after mount to avoid hydration mismatch
 */
export function TrafficLights({
  isFullscreen = null,
  isDesktop = false,
  className = "",
}: {
  isFullscreen?: boolean | null
  isDesktop?: boolean
  className?: string
}) {
  const [isHovered, setIsHovered] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  // Handle mouse enter/leave for the hover zone
  // Toggle native traffic lights synchronously on hover to avoid flicker
  const handleMouseEnter = useCallback(() => {
    if (isDesktop && !isFullscreen && window.desktopApi?.setTrafficLightVisibility) {
      window.desktopApi.setTrafficLightVisibility(true)
    }
    setIsHovered(true)
  }, [isDesktop, isFullscreen])

  const handleMouseLeave = useCallback(() => {
    if (isDesktop && !isFullscreen && window.desktopApi?.setTrafficLightVisibility) {
      window.desktopApi.setTrafficLightVisibility(false)
    }
    setIsHovered(false)
  }, [isDesktop, isFullscreen])

  // Only show in desktop app, hide in fullscreen (native traffic lights always show in fullscreen)
  // isFullscreen === true means fullscreen, null or false means not fullscreen
  if (!isDesktop || isFullscreen === true) return null

  // Single render path with CSS transitions - avoids DOM swap flicker
  // Expand hover zone with padding to fully cover native button area (y=6..18)
  return (
    <div
      ref={containerRef}
      className={cn("relative", className)}
      style={{
        // @ts-expect-error - WebKit-specific property
        WebkitAppRegion: "no-drag",
        // Expand hover zone to cover native button area
        padding: "6px 4px",
        margin: "-6px -4px", // Compensate so layout isn't affected
      }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      data-sidebar-content
    >
      {/* Muted traffic lights - always visible for alignment debugging */}
      <div className="flex items-center gap-2" data-sidebar-content>
        <div
          className={cn(
            "w-3 h-3 rounded-full border transition-opacity duration-75",
            "opacity-100 border-foreground/30"
          )}
          aria-hidden="true"
        />
        <div
          className={cn(
            "w-3 h-3 rounded-full border transition-opacity duration-75",
            "opacity-100 border-foreground/30"
          )}
          aria-hidden="true"
        />
        <div
          className={cn(
            "w-3 h-3 rounded-full border transition-opacity duration-75",
            "opacity-100 border-foreground/30"
          )}
          aria-hidden="true"
        />
      </div>
    </div>
  )
}

/**
 * Spacer component for macOS traffic light buttons (close/minimize/maximize)
 * Only renders in Electron desktop app to provide space for the buttons
 * Animates height smoothly when appearing/disappearing (e.g. fullscreen transitions)
 * 
 * isFullscreen can be:
 * - null: not initialized yet (no animation, assume not fullscreen)
 * - boolean: initialized (animate only on real changes)
 */
export function TrafficLightSpacer({
  isFullscreen = null,
  isDesktop = false,
  className = "",
}: {
  isFullscreen?: boolean | null
  isDesktop?: boolean
  className?: string
}) {
  const prevFullscreenRef = useRef(isFullscreen)
  const [shouldAnimate, setShouldAnimate] = useState(false)

  useEffect(() => {
    // Enable animation only after first real fullscreen change (not initial load)
    // Both previous and current must be non-null (initialized) and different
    if (
      isFullscreen !== null &&
      prevFullscreenRef.current !== null &&
      prevFullscreenRef.current !== isFullscreen
    ) {
      setShouldAnimate(true)
    }
    prevFullscreenRef.current = isFullscreen
  }, [isFullscreen])

  // Show spacer when desktop and not fullscreen
  // If isFullscreen is null (not initialized), assume not fullscreen
  const shouldShow = isDesktop && isFullscreen !== true

  return (
    <div
      className={cn(
        "w-full shrink-0 overflow-hidden",
        shouldAnimate && "transition-[height] duration-200 ease-out",
        className,
      )}
      style={{ height: shouldShow ? 32 : 0 }}
    />
  )
}

/**
 * Wrapper to make child elements non-draggable within a draggable region
 */
export function NoDrag({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        // @ts-expect-error - WebKit-specific property
        WebkitAppRegion: "no-drag",
      }}
    >
      {children}
    </div>
  )
}
