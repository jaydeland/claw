"use client"

import React, { useState } from "react"
import { Plug, Plus, FileJson } from "lucide-react"
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
      <Dialog open={addServerDialogOpen} onOpenChange={setAddServerDialogOpen}>
        <DialogContent className="max-w-6xl max-h-[85vh] overflow-hidden">
          <McpConfigChat
            onConfigGenerated={handleConfigGenerated}
            onCancel={() => setAddServerDialogOpen(false)}
            targetConfigPath={targetFilePath}
          />
        </DialogContent>
      </Dialog>
    </div>
  )
}
