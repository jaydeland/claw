"use client"

import { useState, useEffect, useRef, useCallback, memo } from "react"
import { createPortal } from "react-dom"
import mermaid from "mermaid"
import { cn } from "../lib/utils"
import {
  X,
  Maximize2,
  Copy,
  Check,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Code,
  Image as ImageIcon,
  Download,
} from "lucide-react"

// Initialize mermaid with default config
let initialized = false

function initMermaid(isDark: boolean) {
  mermaid.initialize({
    startOnLoad: false,
    theme: isDark ? "dark" : "default",
    securityLevel: "loose",
    fontFamily: "ui-sans-serif, system-ui, sans-serif",
  })
  initialized = true
}

interface MermaidBlockProps {
  code: string
  className?: string
}

// Zoom constants
const MIN_ZOOM = 0.25
const MAX_ZOOM = 4
const ZOOM_STEP = 0.25

export const MermaidBlock = memo(function MermaidBlock({
  code,
  className,
}: MermaidBlockProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [svg, setSvg] = useState<string>("")
  const [error, setError] = useState<string | null>(null)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [copied, setCopied] = useState(false)
  const [isDark, setIsDark] = useState(false)

  // Fullscreen state
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [isPanning, setIsPanning] = useState(false)
  const [panStart, setPanStart] = useState({ x: 0, y: 0 })
  const [showSource, setShowSource] = useState(false)
  const fullscreenContentRef = useRef<HTMLDivElement>(null)

  // Detect dark mode
  useEffect(() => {
    const checkDark = () => {
      const dark = document.documentElement.classList.contains("dark")
      setIsDark(dark)
    }
    checkDark()

    // Watch for theme changes
    const observer = new MutationObserver(checkDark)
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    })
    return () => observer.disconnect()
  }, [])

  // Render mermaid diagram
  useEffect(() => {
    const render = async () => {
      if (!code.trim()) return

      try {
        // Re-initialize mermaid with current theme
        initMermaid(isDark)

        // Generate unique ID for this render
        const id = `mermaid-${Date.now()}-${Math.random().toString(36).slice(2)}`

        const { svg: renderedSvg } = await mermaid.render(id, code.trim())
        setSvg(renderedSvg)
        setError(null)
      } catch (err) {
        console.error("[MermaidBlock] Failed to render:", err)
        setError(err instanceof Error ? err.message : "Failed to render diagram")
        setSvg("")
      }
    }

    render()
  }, [code, isDark])

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [code])

  const openFullscreen = useCallback(() => {
    setIsFullscreen(true)
    // Reset zoom/pan when opening
    setZoom(1)
    setPan({ x: 0, y: 0 })
    setShowSource(false)
  }, [])

  const closeFullscreen = useCallback(() => {
    setIsFullscreen(false)
  }, [])

  // Zoom controls
  const handleZoomIn = useCallback(() => {
    setZoom((z) => Math.min(z + ZOOM_STEP, MAX_ZOOM))
  }, [])

  const handleZoomOut = useCallback(() => {
    setZoom((z) => Math.max(z - ZOOM_STEP, MIN_ZOOM))
  }, [])

  const handleResetZoom = useCallback(() => {
    setZoom(1)
    setPan({ x: 0, y: 0 })
  }, [])

  // Mouse wheel zoom
  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      if (showSource) return
      e.preventDefault()
      const delta = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP
      setZoom((z) => Math.min(Math.max(z + delta, MIN_ZOOM), MAX_ZOOM))
    },
    [showSource]
  )

  // Pan handlers
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (showSource) return
      setIsPanning(true)
      setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y })
    },
    [pan, showSource]
  )

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isPanning || showSource) return
      setPan({
        x: e.clientX - panStart.x,
        y: e.clientY - panStart.y,
      })
    },
    [isPanning, panStart, showSource]
  )

  const handleMouseUp = useCallback(() => {
    setIsPanning(false)
  }, [])

  // Download as PNG
  const handleDownloadPng = useCallback(async () => {
    if (!svg) return

    try {
      // Create a canvas to render the SVG
      const svgElement = new DOMParser().parseFromString(svg, "image/svg+xml")
        .documentElement as unknown as SVGSVGElement

      // Get SVG dimensions
      const svgRect = svgElement.getBoundingClientRect()
      let width = svgElement.getAttribute("width")
      let height = svgElement.getAttribute("height")

      // Try viewBox if width/height not set
      if (!width || !height) {
        const viewBox = svgElement.getAttribute("viewBox")
        if (viewBox) {
          const [, , vbWidth, vbHeight] = viewBox.split(" ").map(Number)
          width = String(vbWidth || 800)
          height = String(vbHeight || 600)
        } else {
          width = "800"
          height = "600"
        }
      }

      const canvas = document.createElement("canvas")
      const scale = 2 // For higher resolution
      canvas.width = parseFloat(width) * scale
      canvas.height = parseFloat(height) * scale

      const ctx = canvas.getContext("2d")
      if (!ctx) throw new Error("Failed to get canvas context")

      // Set white background for light mode, dark for dark mode
      ctx.fillStyle = isDark ? "#1f2937" : "#ffffff"
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.scale(scale, scale)

      // Convert SVG to data URL
      const svgData = new XMLSerializer().serializeToString(svgElement)
      const svgBlob = new Blob([svgData], { type: "image/svg+xml;charset=utf-8" })
      const svgUrl = URL.createObjectURL(svgBlob)

      // Create image and draw to canvas
      const img = new window.Image()
      img.onload = () => {
        ctx.drawImage(img, 0, 0)
        URL.revokeObjectURL(svgUrl)

        // Download the canvas as PNG
        const pngUrl = canvas.toDataURL("image/png")
        const link = document.createElement("a")
        link.download = `mermaid-diagram-${Date.now()}.png`
        link.href = pngUrl
        link.click()
      }
      img.onerror = () => {
        URL.revokeObjectURL(svgUrl)
        console.error("Failed to load SVG for PNG export")
      }
      img.src = svgUrl
    } catch (err) {
      console.error("Failed to export PNG:", err)
    }
  }, [svg, isDark])

  // Handle keyboard navigation in fullscreen
  useEffect(() => {
    if (!isFullscreen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault()
        e.stopPropagation()
        closeFullscreen()
      } else if (e.key === "+" || e.key === "=") {
        e.preventDefault()
        handleZoomIn()
      } else if (e.key === "-") {
        e.preventDefault()
        handleZoomOut()
      } else if (e.key === "0") {
        e.preventDefault()
        handleResetZoom()
      }
    }

    window.addEventListener("keydown", handleKeyDown, true)
    return () => window.removeEventListener("keydown", handleKeyDown, true)
  }, [isFullscreen, closeFullscreen, handleZoomIn, handleZoomOut, handleResetZoom])

  if (error) {
    return (
      <div
        className={cn(
          "relative mt-2 mb-4 rounded-[10px] bg-destructive/10 border border-destructive/20 p-4",
          className
        )}
      >
        <div className="text-sm text-destructive mb-2">
          Failed to render Mermaid diagram:
        </div>
        <pre className="text-xs text-destructive/80 whitespace-pre-wrap">
          {error}
        </pre>
        <details className="mt-2">
          <summary className="text-xs text-muted-foreground cursor-pointer">
            Show source
          </summary>
          <pre className="mt-2 text-xs text-muted-foreground whitespace-pre-wrap bg-muted/50 p-2 rounded">
            {code}
          </pre>
        </details>
      </div>
    )
  }

  return (
    <>
      <div
        ref={containerRef}
        className={cn(
          "relative mt-2 mb-4 rounded-[10px] bg-muted overflow-hidden group",
          className
        )}
      >
        {/* Action buttons */}
        <div className="absolute top-2 right-2 flex gap-1 z-10 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={handleCopy}
            className="p-1.5 rounded bg-background/80 hover:bg-background border border-border/50 transition-colors"
            title={copied ? "Copied!" : "Copy source"}
          >
            <div className="relative w-3.5 h-3.5">
              <Copy
                className={cn(
                  "absolute inset-0 w-3.5 h-3.5 text-muted-foreground transition-[opacity,transform] duration-200",
                  copied ? "opacity-0 scale-50" : "opacity-100 scale-100"
                )}
              />
              <Check
                className={cn(
                  "absolute inset-0 w-3.5 h-3.5 text-muted-foreground transition-[opacity,transform] duration-200",
                  copied ? "opacity-100 scale-100" : "opacity-0 scale-50"
                )}
              />
            </div>
          </button>
          <button
            onClick={openFullscreen}
            className="p-1.5 rounded bg-background/80 hover:bg-background border border-border/50 transition-colors"
            title="View fullscreen"
          >
            <Maximize2 className="w-3.5 h-3.5 text-muted-foreground" />
          </button>
        </div>

        {/* Diagram */}
        {svg ? (
          <div
            className="p-4 flex justify-center cursor-pointer [&_svg]:max-w-full"
            onClick={openFullscreen}
            dangerouslySetInnerHTML={{ __html: svg }}
          />
        ) : (
          <div className="p-4 flex justify-center">
            <div className="text-sm text-muted-foreground">
              Rendering diagram...
            </div>
          </div>
        )}
      </div>

      {/* Fullscreen overlay */}
      {isFullscreen &&
        svg &&
        createPortal(
          <div
            role="dialog"
            aria-modal="true"
            className="fixed inset-0 z-50 flex flex-col bg-black/90"
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
          >
            {/* Top toolbar */}
            <div className="flex items-center justify-between px-4 py-3 bg-black/50 border-b border-white/10">
              <div className="flex items-center gap-2">
                {/* View toggle */}
                <div className="flex items-center gap-1 bg-white/10 rounded-md p-0.5">
                  <button
                    onClick={() => setShowSource(false)}
                    className={cn(
                      "flex items-center gap-1.5 px-3 py-1.5 rounded text-sm transition-colors",
                      !showSource
                        ? "bg-white/20 text-white"
                        : "text-white/60 hover:text-white"
                    )}
                  >
                    <ImageIcon className="w-4 h-4" />
                    Diagram
                  </button>
                  <button
                    onClick={() => setShowSource(true)}
                    className={cn(
                      "flex items-center gap-1.5 px-3 py-1.5 rounded text-sm transition-colors",
                      showSource
                        ? "bg-white/20 text-white"
                        : "text-white/60 hover:text-white"
                    )}
                  >
                    <Code className="w-4 h-4" />
                    Source
                  </button>
                </div>

                {/* Zoom controls - only show for diagram view */}
                {!showSource && (
                  <>
                    <div className="w-px h-6 bg-white/20 mx-2" />
                    <div className="flex items-center gap-1">
                      <button
                        onClick={handleZoomOut}
                        disabled={zoom <= MIN_ZOOM}
                        className="p-2 rounded hover:bg-white/10 text-white/80 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                        title="Zoom out (-)"
                      >
                        <ZoomOut className="w-4 h-4" />
                      </button>
                      <span className="text-sm text-white/80 w-14 text-center tabular-nums">
                        {Math.round(zoom * 100)}%
                      </span>
                      <button
                        onClick={handleZoomIn}
                        disabled={zoom >= MAX_ZOOM}
                        className="p-2 rounded hover:bg-white/10 text-white/80 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                        title="Zoom in (+)"
                      >
                        <ZoomIn className="w-4 h-4" />
                      </button>
                      <button
                        onClick={handleResetZoom}
                        className="p-2 rounded hover:bg-white/10 text-white/80 hover:text-white transition-colors"
                        title="Reset zoom (0)"
                      >
                        <RotateCcw className="w-4 h-4" />
                      </button>
                    </div>
                  </>
                )}
              </div>

              <div className="flex items-center gap-2">
                {/* Download PNG button */}
                <button
                  onClick={handleDownloadPng}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-white/10 hover:bg-white/20 text-white/80 hover:text-white text-sm transition-colors"
                  title="Download as PNG"
                >
                  <Download className="w-4 h-4" />
                  Save PNG
                </button>

                {/* Copy source button */}
                <button
                  onClick={handleCopy}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-white/10 hover:bg-white/20 text-white/80 hover:text-white text-sm transition-colors"
                  title="Copy source code"
                >
                  {copied ? (
                    <>
                      <Check className="w-4 h-4" />
                      Copied
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4" />
                      Copy
                    </>
                  )}
                </button>

                {/* Close button */}
                <button
                  onClick={closeFullscreen}
                  className="p-2 rounded-full hover:bg-white/10 transition-colors text-white"
                  type="button"
                  aria-label="Close fullscreen (Esc)"
                >
                  <X className="size-5" />
                </button>
              </div>
            </div>

            {/* Content area */}
            <div
              ref={fullscreenContentRef}
              className={cn(
                "flex-1 overflow-hidden",
                !showSource && "cursor-grab",
                isPanning && "cursor-grabbing"
              )}
              onWheel={handleWheel}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
            >
              {showSource ? (
                // Source code view
                <div className="h-full overflow-auto p-6">
                  <pre className="text-sm text-white/90 font-mono whitespace-pre-wrap bg-white/5 rounded-lg p-4 border border-white/10">
                    {code}
                  </pre>
                </div>
              ) : (
                // Diagram view with zoom/pan
                <div
                  className="h-full flex items-center justify-center"
                  style={{
                    transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                    transformOrigin: "center center",
                    transition: isPanning ? "none" : "transform 0.1s ease-out",
                  }}
                >
                  <div
                    className="bg-white dark:bg-gray-900 rounded-lg p-6 [&_svg]:max-w-none [&_svg]:h-auto"
                    dangerouslySetInnerHTML={{ __html: svg }}
                  />
                </div>
              )}
            </div>

            {/* Bottom hint */}
            {!showSource && (
              <div className="px-4 py-2 bg-black/50 border-t border-white/10 text-center">
                <span className="text-xs text-white/50">
                  Scroll to zoom • Drag to pan • Press 0 to reset
                </span>
              </div>
            )}
          </div>,
          document.body
        )}
    </>
  )
})

MermaidBlock.displayName = "MermaidBlock"
