"use client"

import { memo, useState, useCallback, useRef, useEffect, type ReactNode } from "react"
import { GripVertical } from "lucide-react"
import { cn } from "../../../lib/utils"

/**
 * Panel configuration for a single panel in the tab view layout
 */
export interface TabViewPanelConfig {
  /** Unique identifier for the panel */
  id: string
  /** Content to render in the panel */
  content: ReactNode
  /** Initial width as percentage (0-100), or "auto" for flex-1 */
  defaultWidth?: number
  /** Minimum width in pixels */
  minWidth?: number
  /** Maximum width in pixels */
  maxWidth?: number
  /** Whether this panel can be resized */
  resizable?: boolean
  /** Whether to show a border on the right side */
  showBorder?: boolean
  /** Additional CSS classes */
  className?: string
}

/**
 * Props for the TabViewLayout component
 */
export interface TabViewLayoutProps {
  /** Title shown in the header */
  title: ReactNode
  /** Optional actions shown on the right side of the header */
  headerActions?: ReactNode
  /** Left panel configuration (tree/navigation) */
  leftPanel?: TabViewPanelConfig
  /** Center panel configuration (main content) */
  centerPanel?: TabViewPanelConfig
  /** Right panel configuration (chat/details) */
  rightPanel?: TabViewPanelConfig
  /** Additional CSS classes for the container */
  className?: string
  /** Additional CSS classes for the header */
  headerClassName?: string
}

/**
 * Unified Tab View Layout Component
 *
 * Provides a consistent 3-pane layout with resizable panels across all tabs.
 * Based on the GitHubView pattern.
 *
 * Layout structure:
 * - Header (title + actions)
 * - Left Panel (tree/navigation) - optional
 * - Center Panel (main content)
 * - Right Panel (chat/details) - optional
 *
 * Features:
 * - Draggable resize handles between panels
 * - Configurable min/max widths
 * - Consistent styling across all tabs
 * - Responsive percentage-based widths
 *
 * @example
 * ```tsx
 * <TabViewLayout
 *   title="GitHub"
 *   headerActions={<Button>Action</Button>}
 *   leftPanel={{
 *     id: "tree",
 *     content: <TreePane />,
 *     defaultWidth: 20,
 *     minWidth: 150,
 *   }}
 *   centerPanel={{
 *     id: "content",
 *     content: <ContentPane />,
 *     defaultWidth: 50,
 *     minWidth: 300,
 *   }}
 *   rightPanel={{
 *     id: "chat",
 *     content: <ChatPane />,
 *     defaultWidth: 30,
 *     minWidth: 250,
 *   }}
 * />
 * ```
 */
export const TabViewLayout = memo(function TabViewLayout({
  title,
  headerActions,
  leftPanel,
  centerPanel,
  rightPanel,
  className,
  headerClassName,
}: TabViewLayoutProps) {
  // Panel widths as percentages
  const [leftWidth, setLeftWidth] = useState(leftPanel?.defaultWidth ?? 20)
  const [centerWidth, setCenterWidth] = useState(centerPanel?.defaultWidth ?? 50)

  // Drag state
  const [isDraggingLeft, setIsDraggingLeft] = useState(false)
  const [isDraggingCenter, setIsDraggingCenter] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  // Calculate right panel width based on remaining space
  const rightWidth = 100 - centerWidth

  // Handle mouse down for left panel resize
  const handleLeftResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setIsDraggingLeft(true)
  }, [])

  // Handle mouse down for center panel resize
  const handleCenterResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setIsDraggingCenter(true)
  }, [])

  // Mouse move handler for resizing
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return

      const containerRect = containerRef.current.getBoundingClientRect()
      const x = e.clientX - containerRect.left
      const containerWidth = containerRect.width

      if (isDraggingLeft && leftPanel) {
        // Calculate left width as percentage
        const minWidthPct = leftPanel.minWidth
          ? (leftPanel.minWidth / containerWidth) * 100
          : 15
        const maxWidthPct = leftPanel.maxWidth
          ? (leftPanel.maxWidth / containerWidth) * 100
          : 40

        const newLeftWidth = Math.max(
          minWidthPct,
          Math.min(maxWidthPct, (x / containerWidth) * 100)
        )
        setLeftWidth(newLeftWidth)
      } else if (isDraggingCenter && centerPanel) {
        // Calculate center width relative to remaining space
        const remainingWidth = containerWidth * ((100 - leftWidth) / 100)
        const contentX = x - containerWidth * (leftWidth / 100)

        const minWidthPct = centerPanel.minWidth
          ? (centerPanel.minWidth / remainingWidth) * 100
          : 30
        const maxWidthPct = centerPanel.maxWidth
          ? (centerPanel.maxWidth / remainingWidth) * 100
          : 70

        const newCenterWidth = Math.max(
          minWidthPct,
          Math.min(maxWidthPct, (contentX / remainingWidth) * 100)
        )
        setCenterWidth(newCenterWidth)
      }
    }

    const handleMouseUp = () => {
      setIsDraggingLeft(false)
      setIsDraggingCenter(false)
    }

    if (isDraggingLeft || isDraggingCenter) {
      document.addEventListener("mousemove", handleMouseMove)
      document.addEventListener("mouseup", handleMouseUp)
      return () => {
        document.removeEventListener("mousemove", handleMouseMove)
        document.removeEventListener("mouseup", handleMouseUp)
      }
    }
  }, [isDraggingLeft, isDraggingCenter, leftWidth, leftPanel, centerPanel])

  return (
    <div
      ref={containerRef}
      className={cn(
        "h-full flex flex-col bg-background",
        (isDraggingLeft || isDraggingCenter) && "select-none",
        className
      )}
    >
      {/* Header */}
      <div
        className={cn(
          "flex items-center justify-between px-4 py-2 border-b border-border flex-shrink-0",
          headerClassName
        )}
      >
        <div className="flex items-center gap-2">{title}</div>
        {headerActions && (
          <div className="flex items-center gap-2">{headerActions}</div>
        )}
      </div>

      {/* Main content with resizable panels */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Panel */}
        {leftPanel && (
          <div
            className={cn(
              "flex-shrink-0 overflow-hidden",
              leftPanel.showBorder !== false && "border-r border-border",
              leftPanel.className
            )}
            style={{ width: `${leftWidth}%` }}
          >
            {leftPanel.content}
          </div>
        )}

        {/* Left resize handle */}
        {leftPanel && (centerPanel || rightPanel) && (
          <div
            className={cn(
              "w-1 flex-shrink-0 bg-border hover:bg-primary/50 cursor-col-resize flex items-center justify-center transition-colors",
              isDraggingLeft && "bg-primary"
            )}
            onMouseDown={handleLeftResizeStart}
          >
            <GripVertical className="h-4 w-4 text-muted-foreground opacity-0 hover:opacity-100" />
          </div>
        )}

        {/* Center + Right Panes */}
        <div className="flex-1 flex overflow-hidden">
          {/* Center Panel */}
          {centerPanel && (
            <div
              className={cn(
                "overflow-hidden",
                centerPanel.showBorder !== false && rightPanel && "border-r border-border",
                centerPanel.className
              )}
              style={{ width: rightPanel ? `${centerWidth}%` : "100%" }}
            >
              {centerPanel.content}
            </div>
          )}

          {/* Center/Right resize handle */}
          {centerPanel && rightPanel && (
            <div
              className={cn(
                "w-1 flex-shrink-0 bg-border hover:bg-primary/50 cursor-col-resize flex items-center justify-center transition-colors",
                isDraggingCenter && "bg-primary"
              )}
              onMouseDown={handleCenterResizeStart}
            >
              <GripVertical className="h-4 w-4 text-muted-foreground opacity-0 hover:opacity-100" />
            </div>
          )}

          {/* Right Panel */}
          {rightPanel && (
            <div
              className={cn(
                "overflow-hidden border-l border-border",
                rightPanel.className
              )}
              style={{ width: `${rightWidth}%` }}
            >
              {rightPanel.content}
            </div>
          )}
        </div>
      </div>
    </div>
  )
})

/**
 * Simplified 2-pane layout (no right panel)
 * Convenience wrapper for tabs that only need left + center panels
 */
export interface TwoPaneLayoutProps {
  /** Title shown in the header */
  title: ReactNode
  /** Optional actions shown on the right side of the header */
  headerActions?: ReactNode
  /** Left panel content (tree/navigation) */
  leftContent: ReactNode
  /** Center panel content (main content) */
  centerContent: ReactNode
  /** Initial left panel width percentage */
  defaultLeftWidth?: number
  /** Minimum left panel width in pixels */
  minLeftWidth?: number
  /** Maximum left panel width in pixels */
  maxLeftWidth?: number
  /** Additional CSS classes */
  className?: string
}

export const TwoPaneLayout = memo(function TwoPaneLayout({
  title,
  headerActions,
  leftContent,
  centerContent,
  defaultLeftWidth = 25,
  minLeftWidth = 150,
  maxLeftWidth = 400,
  className,
}: TwoPaneLayoutProps) {
  return (
    <TabViewLayout
      title={title}
      headerActions={headerActions}
      leftPanel={{
        id: "left",
        content: leftContent,
        defaultWidth: defaultLeftWidth,
        minWidth: minLeftWidth,
        maxWidth: maxLeftWidth,
      }}
      centerPanel={{
        id: "center",
        content: centerContent,
        defaultWidth: 100 - defaultLeftWidth,
      }}
      className={className}
    />
  )
})

export default TabViewLayout
