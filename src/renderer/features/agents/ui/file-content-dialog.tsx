"use client"

import { memo, useCallback, useState, useMemo } from "react"
import { useAtom } from "jotai"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import {
  Copy,
  CheckIcon,
  FileText,
  Code,
  Eye,
} from "lucide-react"
import { cn } from "@/lib/utils"
import {
  fileContentDialogOpenAtom,
  selectedFileContentAtom,
} from "../atoms"
import { CodeBlock } from "./code-block"
import { ChatMarkdownRenderer } from "../../../components/chat-markdown-renderer"
import { getFileIconByExtension } from "../mentions/agents-file-mention"

// Check if file is a markdown file
function isMarkdownFile(filePath: string): boolean {
  const ext = filePath.split(".").pop()?.toLowerCase()
  return ext === "md" || ext === "mdx" || ext === "markdown"
}

// Get language from file path
function getLanguageFromPath(filePath: string): string {
  const ext = filePath.split(".").pop()?.toLowerCase() || ""
  const langMap: Record<string, string> = {
    ts: "typescript",
    tsx: "tsx",
    js: "javascript",
    jsx: "jsx",
    py: "python",
    go: "go",
    rs: "rust",
    html: "html",
    css: "css",
    scss: "scss",
    json: "json",
    yaml: "yaml",
    yml: "yaml",
    md: "markdown",
    mdx: "markdown",
    sh: "bash",
    bash: "bash",
    zsh: "bash",
    sql: "sql",
    rb: "ruby",
    java: "java",
    kt: "kotlin",
    swift: "swift",
    c: "c",
    cpp: "cpp",
    h: "c",
    hpp: "cpp",
    cs: "csharp",
    php: "php",
    xml: "xml",
    toml: "toml",
    ini: "ini",
    dockerfile: "dockerfile",
    makefile: "makefile",
  }
  return langMap[ext] || "plaintext"
}

// Format file size in human-readable format
function formatFileSize(content: string): string {
  const bytes = new Blob([content]).size
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// Count lines in content
function countLines(content: string): number {
  return content.split("\n").length
}

interface FileContentDialogProps {
  /** Chat ID - dialog closes when this changes */
  chatId?: string
}

export const FileContentDialog = memo(function FileContentDialog({
  chatId,
}: FileContentDialogProps) {
  const [open, setOpen] = useAtom(fileContentDialogOpenAtom)
  const [selectedFile, setSelectedFile] = useAtom(selectedFileContentAtom)
  const [copied, setCopied] = useState(false)
  const [showRendered, setShowRendered] = useState(true)

  const handleClose = useCallback(() => {
    setOpen(false)
    // Clear selection after dialog closes
    setTimeout(() => {
      setSelectedFile(null)
      setShowRendered(true) // Reset to rendered view for next open
    }, 200)
  }, [setOpen, setSelectedFile])

  const handleCopy = useCallback(async () => {
    if (!selectedFile?.content) return

    try {
      await navigator.clipboard.writeText(selectedFile.content)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error("Failed to copy:", err)
    }
  }, [selectedFile?.content])

  // Determine if this is a markdown file and should show the toggle
  const isMarkdown = useMemo(() => {
    if (!selectedFile?.filePath) return false
    return isMarkdownFile(selectedFile.filePath)
  }, [selectedFile?.filePath])

  // Get language for syntax highlighting
  const language = useMemo(() => {
    if (!selectedFile?.filePath) return "plaintext"
    return selectedFile.language || getLanguageFromPath(selectedFile.filePath)
  }, [selectedFile?.filePath, selectedFile?.language])

  // Get file icon
  const FileIcon = useMemo(() => {
    if (!selectedFile?.filePath) return FileText
    const filename = selectedFile.filePath.split("/").pop() || ""
    return getFileIconByExtension(filename, true) || FileText
  }, [selectedFile?.filePath])

  // File stats
  const fileStats = useMemo(() => {
    if (!selectedFile?.content) return null
    return {
      lines: countLines(selectedFile.content),
      size: formatFileSize(selectedFile.content),
    }
  }, [selectedFile?.content])

  // Get filename from path
  const filename = useMemo(() => {
    if (!selectedFile?.filePath) return "File"
    return selectedFile.filePath.split("/").pop() || "File"
  }, [selectedFile?.filePath])

  return (
    <Dialog open={open && !!selectedFile} onOpenChange={(newOpen) => {
      setOpen(newOpen)
      if (!newOpen) {
        // Clear selection after dialog closes
        setTimeout(() => {
          setSelectedFile(null)
          setShowRendered(true)
        }, 200)
      }
    }}>
      <DialogContent className="w-[80vw] max-w-[80vw] h-[80vh] flex flex-col">
        {selectedFile && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <FileIcon className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                <span className="truncate">{filename}</span>
              </DialogTitle>
              <DialogDescription className="font-mono text-xs truncate">
                {selectedFile.displayPath}
              </DialogDescription>
              <div className="flex items-center gap-3 pt-2">
                {fileStats && (
                  <span className="text-xs text-muted-foreground">
                    {fileStats.lines} lines / {fileStats.size}
                  </span>
                )}
                {/* Markdown view toggle */}
                {isMarkdown && (
                  <div className="flex items-center gap-1 border rounded-md p-0.5">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowRendered(true)}
                      className={cn(
                        "h-6 px-2 text-xs",
                        showRendered && "bg-muted"
                      )}
                      title="Rendered view"
                    >
                      <Eye className="h-3 w-3 mr-1" />
                      Rendered
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowRendered(false)}
                      className={cn(
                        "h-6 px-2 text-xs",
                        !showRendered && "bg-muted"
                      )}
                      title="Raw code view"
                    >
                      <Code className="h-3 w-3 mr-1" />
                      Raw
                    </Button>
                  </div>
                )}
              </div>
            </DialogHeader>

            {/* File content */}
            <div className="flex-1 overflow-y-auto border rounded-md bg-muted/30">
              {isMarkdown && showRendered ? (
                <div className="p-4 prose prose-sm max-w-none dark:prose-invert">
                  <ChatMarkdownRenderer
                    content={selectedFile.content}
                    size="md"
                  />
                </div>
              ) : (
                <div className="p-4">
                  <CodeBlock
                    code={selectedFile.content}
                    language={language}
                    showLineNumbers={false}
                    wrap={true}
                  />
                </div>
              )}
            </div>

            <DialogFooter className="flex-shrink-0">
              <Button
                variant="outline"
                size="sm"
                onClick={handleCopy}
                disabled={copied || !selectedFile.content}
              >
                {copied ? (
                  <>
                    <CheckIcon className="w-3.5 h-3.5 mr-1.5" />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5 mr-1.5" />
                    Copy Content
                  </>
                )}
              </Button>
              <Button variant="default" size="sm" onClick={handleClose}>
                Close
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
})
