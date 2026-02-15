"use client"

import React, { useState, useEffect, useCallback } from "react"
import { AnimatePresence, motion } from "motion/react"
import { Plug, Plus, FileJson, X } from "lucide-react"
import { useAtom } from "jotai"
import { trpc } from "../../../lib/trpc"
import { McpServerList } from "./mcp-server-list"
import { McpServerDetail } from "./mcp-server-detail"
import { McpAuthModal } from "./mcp-auth-modal"
import { McpConfigChat } from "./mcp-config-chat"
import { Button } from "../../../components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../../components/ui/dialog"
import { Input } from "../../../components/ui/input"
import { Label } from "../../../components/ui/label"
import { toast } from "sonner"
import { mcpAddFileDialogOpenAtom, mcpAddServerDialogOpenAtom, mcpAddServerTargetFileAtom } from "../atoms"

export function McpContent() {
  const [addFileDialogOpen, setAddFileDialogOpen] = useAtom(mcpAddFileDialogOpenAtom)
  const [addServerDialogOpen, setAddServerDialogOpen] = useAtom(mcpAddServerDialogOpenAtom)
  const [targetFilePath] = useAtom(mcpAddServerTargetFileAtom)
  const [newFilePath, setNewFilePath] = useState("")

  const utils = trpc.useUtils()

  const createConfigFileMutation = trpc.mcp.createConfigFile.useMutation({
    onSuccess: (result) => {
      utils.mcp.listServers.invalidate()
      toast.success("Config file created", {
        description: result.path,
      })
      setAddFileDialogOpen(false)
      setNewFilePath("")
    },
    onError: (error) => {
      toast.error("Failed to create config file", { description: error.message })
    },
  })

  const addServerMutation = trpc.mcp.addServer.useMutation({
    onSuccess: () => {
      utils.mcp.listServers.invalidate()
      toast.success("MCP server added successfully")
      setAddServerDialogOpen(false)
    },
    onError: (error) => {
      toast.error("Failed to add server", { description: error.message })
    },
  })

  const handleCreateFile = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newFilePath.trim()) {
      toast.error("File path is required")
      return
    }
    createConfigFileMutation.mutate({ filePath: newFilePath.trim() })
  }

  const handleConfigGenerated = (config: {
    name: string
    command?: string
    args?: string[]
    env?: Record<string, string>
    type?: "stdio" | "http" | "sse"
    url?: string
    headers?: Record<string, string>
  }) => {
    if (!targetFilePath) {
      toast.error("No target file selected")
      return
    }

    const serverConfig: {
      command?: string
      args?: string[]
      env?: Record<string, string>
      disabled?: boolean
      autoApprove?: string[]
      type?: "http" | "sse"
      url?: string
      headers?: Record<string, string>
    } = {
      disabled: false,
    }

    const type = config.type || "stdio"
    if (type === "stdio") {
      serverConfig.command = config.command || ""
      serverConfig.args = config.args?.filter((a) => a.trim()) || []
    } else {
      serverConfig.type = type
      serverConfig.url = config.url || ""
    }

    if (config.env && Object.keys(config.env).length > 0) {
      serverConfig.env = config.env
    }

    addServerMutation.mutate({
      name: config.name.trim(),
      config: serverConfig,
      configFile: "custom", // Use custom since we're targeting a specific file path
      customPath: targetFilePath, // Pass the actual target file path
    })
  }

  // Handle Escape key for add server dialog
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation()
        setAddServerDialogOpen(false)
      }
    },
    []
  )

  useEffect(() => {
    if (addServerDialogOpen) {
      document.addEventListener("keydown", handleKeyDown)
      return () => document.removeEventListener("keydown", handleKeyDown)
    }
  }, [addServerDialogOpen, handleKeyDown])

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <Plug className="h-5 w-5" />
          <h1 className="text-lg font-semibold">MCP Servers</h1>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setAddFileDialogOpen(true)}
        >
          <FileJson className="h-4 w-4 mr-2" />
          Add MCP File
        </Button>
      </div>

      {/* Two-column layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* Server list (left) */}
        <div className="w-[320px] border-r border-border flex-shrink-0 overflow-hidden">
          <McpServerList />
        </div>

        {/* Server detail (right) */}
        <div className="flex-1 overflow-hidden">
          <McpServerDetail />
        </div>
      </div>

      {/* Auth modal */}
      <McpAuthModal />

      {/* Add MCP File Dialog */}
      <Dialog open={addFileDialogOpen} onOpenChange={setAddFileDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Add MCP Config File</DialogTitle>
            <DialogDescription>
              Create a new MCP configuration file to organize your servers.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreateFile} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="filePath">File Path</Label>
              <Input
                id="filePath"
                value={newFilePath}
                onChange={(e) => setNewFilePath(e.target.value)}
                placeholder="e.g., ~/.claude/mcp-custom.json or /path/to/project/.claude/mcp.json"
              />
              <p className="text-xs text-muted-foreground">
                The path where the new MCP config file will be created. The directory will be created if it doesn&apos;t exist.
              </p>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setAddFileDialogOpen(false)}
                disabled={createConfigFileMutation.isPending}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={createConfigFileMutation.isPending || !newFilePath.trim()}
              >
                {createConfigFileMutation.isPending ? (
                  <>
                    <div className="h-4 w-4 mr-2 animate-spin rounded-full border-2 border-current border-t-transparent" />
                    Creating...
                  </>
                ) : (
                  <>
                    <Plus className="h-4 w-4 mr-2" />
                    Create File
                  </>
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Add MCP Server Dialog (AI Assistant) */}
      <AnimatePresence>
        {addServerDialogOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="fixed inset-0 bg-black/50 z-50"
              onClick={() => setAddServerDialogOpen(false)}
            />

            {/* Dialog */}
            <motion.div
              role="dialog"
              aria-modal="true"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.15, ease: [0.4, 0, 0.2, 1] }}
              className="fixed z-50 flex flex-col bg-background border border-border/50 overflow-hidden"
              style={{
                top: "72px",
                left: "72px",
                right: "72px",
                height: "calc(100% - 144px)",
                maxWidth: "1200px",
                marginInline: "auto",
                borderRadius: "12px",
                boxShadow:
                  "0 25px 50px -12px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.05)",
              }}
            >
              {/* Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-border">
                <div>
                  <h2 className="text-lg font-semibold">Add MCP Server</h2>
                  <p className="text-sm text-muted-foreground">
                    {targetFilePath
                      ? `Add a server to ${targetFilePath.split("/").pop()}`
                      : "Configure a new MCP server"}
                  </p>
                </div>
                <button
                  onClick={() => setAddServerDialogOpen(false)}
                  className="p-2 rounded-md hover:bg-muted transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Content */}
              <div className="flex-1 overflow-hidden">
                <McpConfigChat
                  onConfigGenerated={handleConfigGenerated}
                  onCancel={() => setAddServerDialogOpen(false)}
                  targetConfigPath={targetFilePath}
                />
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  )
}
