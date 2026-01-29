import { memo, useEffect, useState } from "react"
import { useCodeTheme } from "../../../lib/hooks/use-code-theme"
import { highlightCode } from "../../../lib/themes/shiki-theme-loader"
import { cn } from "../../../lib/utils"

interface CodeBlockProps {
  code: string
  language?: string
  showLineNumbers?: boolean
  wrap?: boolean
  className?: string
}

export const CodeBlock = memo(function CodeBlock({
  code,
  language = "plaintext",
  showLineNumbers = false,
  wrap = true,
  className,
}: CodeBlockProps) {
  const [highlightedCode, setHighlightedCode] = useState<string>("")
  const codeTheme = useCodeTheme()

  useEffect(() => {
    let cancelled = false

    async function highlight() {
      try {
        const html = await highlightCode(code, language, codeTheme)
        if (!cancelled) {
          setHighlightedCode(html)
        }
      } catch (error) {
        console.error("Failed to highlight code:", error)
        if (!cancelled) {
          setHighlightedCode(code)
        }
      }
    }

    highlight()

    return () => {
      cancelled = true
    }
  }, [code, language, codeTheme])

  if (!highlightedCode) {
    return (
      <pre className={cn(
        "font-mono text-xs p-4",
        wrap ? "whitespace-pre-wrap break-words" : "whitespace-pre overflow-x-auto",
        className
      )}>
        <code>{code}</code>
      </pre>
    )
  }

  return (
    <pre className={cn(
      "font-mono text-xs",
      wrap ? "whitespace-pre-wrap break-words" : "whitespace-pre overflow-x-auto",
      className
    )}>
      <code
        dangerouslySetInnerHTML={{ __html: highlightedCode }}
        className={showLineNumbers ? "block" : undefined}
      />
    </pre>
  )
})
