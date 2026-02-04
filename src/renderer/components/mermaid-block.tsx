"use client"

import { useState, useEffect, useRef, useCallback, memo } from "react"
import { createPortal } from "react-dom"
import mermaid from "mermaid"
import { cn } from "../lib/utils"
import { X, Maximize2, Copy, Check } from "lucide-react"

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
  }, [])

  const closeFullscreen = useCallback(() => {
    setIsFullscreen(false)
  }, [])

  // Handle keyboard navigation in fullscreen
  useEffect(() => {
    if (!isFullscreen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault()
        e.stopPropagation()
        closeFullscreen()
      }
    }

    window.addEventListener("keydown", handleKeyDown, true)
    return () => window.removeEventListener("keydown", handleKeyDown, true)
  }, [isFullscreen, closeFullscreen])

  if (error) {
    return (
      <div
        className={cn(
          "relative mt-2 mb-4 rounded-[10px] bg-destructive/10 border border-destructive/20 p-4",
          className
        )}
      >
        <div className="text-sm text-destructive mb-2">Failed to render Mermaid diagram:</div>
        <pre className="text-xs text-destructive/80 whitespace-pre-wrap">{error}</pre>
        <details className="mt-2">
          <summary className="text-xs text-muted-foreground cursor-pointer">Show source</summary>
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
            <div className="text-sm text-muted-foreground">Rendering diagram...</div>
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
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/90"
            onClick={closeFullscreen}
          >
            {/* Close button */}
            <button
              onClick={closeFullscreen}
              className="absolute top-4 right-4 p-2 rounded-full bg-black/50 hover:bg-black/70 transition-colors text-white z-10"
              type="button"
              aria-label="Close fullscreen (Esc)"
            >
              <X className="size-6" />
            </button>

            {/* Diagram */}
            <div
              className="max-w-[90vw] max-h-[90vh] overflow-auto bg-white dark:bg-gray-900 rounded-lg p-6 [&_svg]:max-w-full [&_svg]:h-auto"
              onClick={(e) => e.stopPropagation()}
              dangerouslySetInnerHTML={{ __html: svg }}
            />
          </div>,
          document.body
        )}
    </>
  )
})

MermaidBlock.displayName = "MermaidBlock"
