"use client"

import { useState, useCallback, useEffect, memo } from "react"
import { createPortal } from "react-dom"
import { cn } from "../lib/utils"
import { X, Maximize2, Copy, Check } from "lucide-react"

interface Base64ImageBlockProps {
  code: string
  className?: string
}

// Pattern to validate and parse base64 image data URIs
const BASE64_IMAGE_PATTERN = /^data:image\/(png|jpeg|jpg|gif|webp|bmp|svg\+xml);base64,/i

export const Base64ImageBlock = memo(function Base64ImageBlock({
  code,
  className,
}: Base64ImageBlockProps) {
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [loaded, setLoaded] = useState(false)

  // Validate and extract image data
  const imageData = code.trim()
  const isValidBase64 = BASE64_IMAGE_PATTERN.test(imageData)

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

  const handleImageError = useCallback(() => {
    setError("Failed to load image")
  }, [])

  const handleImageLoad = useCallback(() => {
    setLoaded(true)
    setError(null)
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

  if (!isValidBase64) {
    return (
      <div
        className={cn(
          "relative mt-2 mb-4 rounded-[10px] bg-destructive/10 border border-destructive/20 p-4",
          className
        )}
      >
        <div className="text-sm text-destructive">Invalid image data format</div>
        <div className="text-xs text-muted-foreground mt-1">
          Expected: data:image/(png|jpeg|gif|webp);base64,...
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div
        className={cn(
          "relative mt-2 mb-4 rounded-[10px] bg-destructive/10 border border-destructive/20 p-4",
          className
        )}
      >
        <div className="text-sm text-destructive">{error}</div>
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
            title={copied ? "Copied!" : "Copy data URI"}
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

        {/* Image */}
        <div className="p-4 flex justify-center">
          {!loaded && (
            <div className="text-sm text-muted-foreground">Loading image...</div>
          )}
          <img
            src={imageData}
            alt="Embedded image"
            className={cn(
              "max-w-full h-auto rounded cursor-pointer transition-opacity",
              loaded ? "opacity-100" : "opacity-0 absolute"
            )}
            onClick={openFullscreen}
            onError={handleImageError}
            onLoad={handleImageLoad}
          />
        </div>
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

            {/* Image */}
            <img
              src={imageData}
              alt="Embedded image"
              className="max-w-[90vw] max-h-[90vh] object-contain"
              onClick={(e) => e.stopPropagation()}
            />
          </div>,
          document.body
        )}
    </>
  )
})

Base64ImageBlock.displayName = "Base64ImageBlock"
