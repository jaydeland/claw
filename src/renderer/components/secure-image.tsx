"use client"

import { memo, useState, useEffect } from "react"
import { cn } from "../lib/utils"
import { ImageIcon, AlertCircle } from "lucide-react"

interface SecureImageProps {
  src: string
  alt?: string
  className?: string
}

export const SecureImage = memo(function SecureImage({
  src,
  alt = "",
  className,
}: SecureImageProps) {
  const [imageData, setImageData] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    const loadImage = async () => {
      // If it's already a data URL, use it directly
      if (src.startsWith("data:")) {
        setImageData(src)
        setIsLoading(false)
        return
      }

      // For external URLs, fetch through main process
      try {
        setIsLoading(true)
        setError(null)

        const result = await window.desktopApi.fetchImage(src)

        if (cancelled) return

        if (result.success && result.dataUrl) {
          setImageData(result.dataUrl)
        } else {
          setError(result.error || "Failed to load image")
        }
      } catch (err) {
        if (!cancelled) {
          setError((err as Error).message || "Failed to load image")
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false)
        }
      }
    }

    loadImage()

    return () => {
      cancelled = true
    }
  }, [src])

  if (isLoading) {
    return (
      <div
        className={cn(
          "flex items-center justify-center bg-muted/50 rounded-lg min-h-[100px]",
          className
        )}
      >
        <ImageIcon className="w-6 h-6 text-muted-foreground/50 animate-pulse" />
      </div>
    )
  }

  if (error || !imageData) {
    return (
      <div
        className={cn(
          "flex items-center gap-2 p-3 bg-destructive/10 rounded-lg border border-destructive/20",
          className
        )}
      >
        <AlertCircle className="w-4 h-4 text-destructive flex-shrink-0" />
        <span className="text-xs text-destructive truncate">{error || "Failed to load image"}</span>
      </div>
    )
  }

  return (
    <img
      src={imageData}
      alt={alt}
      className={cn("max-w-full h-auto rounded-lg", className)}
      loading="lazy"
    />
  )
})

SecureImage.displayName = "SecureImage"
