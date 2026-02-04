"use client"

import { useState, useMemo, useCallback, useEffect, memo } from "react"
import { createPortal } from "react-dom"
import { cn } from "../lib/utils"
import { X, Maximize2, Copy, Check } from "lucide-react"
import DOMPurify from "dompurify"

interface SVGBlockProps {
  code: string
  className?: string
}

// Pattern to detect SVG content
const SVG_PATTERN = /^<svg[\s>]/i

export const SVGBlock = memo(function SVGBlock({ code, className }: SVGBlockProps) {
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [copied, setCopied] = useState(false)

  const svgContent = code.trim()
  const isValidSvg = SVG_PATTERN.test(svgContent)

  // Sanitize SVG to prevent XSS attacks
  const sanitizedSvg = useMemo(() => {
    if (!isValidSvg) return ""

    return DOMPurify.sanitize(svgContent, {
      USE_PROFILES: { svg: true, svgFilters: true },
      // Allow common SVG attributes
      ADD_ATTR: ["viewBox", "preserveAspectRatio", "xmlns", "xmlns:xlink"],
    })
  }, [svgContent, isValidSvg])

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

  if (!isValidSvg) {
    return (
      <div
        className={cn(
          "relative mt-2 mb-4 rounded-[10px] bg-destructive/10 border border-destructive/20 p-4",
          className
        )}
      >
        <div className="text-sm text-destructive">Invalid SVG content</div>
        <div className="text-xs text-muted-foreground mt-1">
          Expected: SVG markup starting with &lt;svg&gt;
        </div>
      </div>
    )
  }

  return (
    <>
      <div
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
            title={copied ? "Copied!" : "Copy SVG"}
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

        {/* SVG container */}
        <div
          className="p-4 flex justify-center cursor-pointer svg-block-container [&_svg]:max-w-full [&_svg]:h-auto"
          onClick={openFullscreen}
          dangerouslySetInnerHTML={{ __html: sanitizedSvg }}
        />
      </div>

      {/* Fullscreen overlay */}
      {isFullscreen &&
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

            {/* SVG in fullscreen */}
            <div
              className="bg-white dark:bg-zinc-900 p-6 rounded-lg max-w-[90vw] max-h-[90vh] overflow-auto svg-block-container [&_svg]:max-w-full [&_svg]:h-auto"
              onClick={(e) => e.stopPropagation()}
              dangerouslySetInnerHTML={{ __html: sanitizedSvg }}
            />
          </div>,
          document.body
        )}
    </>
  )
})

SVGBlock.displayName = "SVGBlock"
