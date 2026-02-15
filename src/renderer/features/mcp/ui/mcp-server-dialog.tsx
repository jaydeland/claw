"use client"

import React, { useState, useEffect, useCallback } from "react"
import { AnimatePresence, motion } from "motion/react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "../../../components/ui/dialog"
import { Button } from "../../../components/ui/button"
import { Input } from "../../../components/ui/input"
import { Label } from "../../../components/ui/label"
import { trpc } from "../../../lib/trpc"
import { toast } from "sonner"
import { Loader2, Plus, Trash2, X } from "lucide-react"
import { cn } from "../../../lib/utils"
import { McpConfigChat } from "./mcp-config-chat"

interface McpServerDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  mode: "add" | "edit"
  serverId?: string
  serverConfig?: {
    command?: string
    args?: string[]
    env?: Record<string, string>
    disabled?: boolean
    autoApprove?: string[]
    type?: "http" | "sse"
    url?: string
    headers?: Record<string, string>
  }
}

export function McpServerDialog({
  open,
  onOpenChange,
  mode,
  serverId,
  serverConfig,
}: McpServerDialogProps) {
  const utils = trpc.useUtils()

  // AI generated config state
  const [aiGeneratedConfig, setAiGeneratedConfig] = useState<{
    name: string
    command?: string
    args?: string[]
    env?: Record<string, string>
    type?: "http" | "sse"
    url?: string
    headers?: Record<string, string>
  } | null>(null)

  // Form state
  const [name, setName] = useState("")
  const [command, setCommand] = useState("")
  const [args, setArgs] = useState<string[]>([""])
  const [envVars, setEnvVars] = useState<{ key: string; value: string }[]>([{ key: "", value: "" }])
  const [serverType, setServerType] = useState<"stdio" | "http" | "sse">("stdio")
  const [url, setUrl] = useState("")
  const [isLoading, setIsLoading] = useState(false)

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      // Reset AI mode
      setAiGeneratedConfig(null)

      if (mode === "edit" && serverConfig) {
        setName(serverId || "")
        setCommand(serverConfig.command || "")
        setArgs(serverConfig.args?.length ? serverConfig.args : [""])
        setEnvVars(
          Object.entries(serverConfig.env || {}).map(([key, value]) => ({
            key,
            value: value || "",
          }))
        )
        setServerType(serverConfig.type || "stdio")
        setUrl(serverConfig.url || "")
      } else {
        // Reset for add mode
        setName("")
        setCommand("")
        setArgs([""])
        setEnvVars([{ key: "", value: "" }])
        setServerType("stdio")
        setUrl("")
      }
    }
  }, [open, mode, serverId, serverConfig])

  const addMutation = trpc.mcp.addServer.useMutation({
    onSuccess: () => {
      utils.mcp.listServers.invalidate()
      toast.success("MCP server added successfully")
      onOpenChange(false)
    },
    onError: (error) => {
      toast.error("Failed to add server", { description: error.message })
    },
  })

  const updateMutation = trpc.mcp.updateServer.useMutation({
    onSuccess: () => {
      utils.mcp.listServers.invalidate()
      toast.success("MCP server updated successfully")
      onOpenChange(false)
    },
    onError: (error) => {
      toast.error("Failed to update server", { description: error.message })
    },
  })

  const handleUseGenerated = () => {
    if (!aiGeneratedConfig) return

    const config: any = {
      disabled: false,
    }

    const type = aiGeneratedConfig.type || "stdio"
    if (type === "stdio") {
      config.command = aiGeneratedConfig.command || ""
      config.args = aiGeneratedConfig.args?.filter((a) => a.trim()) || []
    } else {
      config.type = type
      config.url = aiGeneratedConfig.url || ""
    }

    if (aiGeneratedConfig.env && Object.keys(aiGeneratedConfig.env).length > 0) {
      config.env = aiGeneratedConfig.env
    }

    // Auto-submit the generated config
    addMutation.mutate({
      name: aiGeneratedConfig.name.trim(),
      config,
      configFile: "user",
    })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!name.trim()) {
      toast.error("Server name is required")
      return
    }

    if (serverType === "stdio" && !command.trim()) {
      toast.error("Command is required for stdio servers")
      return
    }

    if ((serverType === "http" || serverType === "sse") && !url.trim()) {
      toast.error("URL is required for HTTP/SSE servers")
      return
    }

    const config: any = {
      disabled: false,
    }

    if (serverType === "stdio") {
      config.command = command.trim()
      config.args = args.filter((a) => a.trim()).map((a) => a.trim())
    } else {
      config.type = serverType
      config.url = url.trim()
    }

    // Build env object from key-value pairs
    const env: Record<string, string> = {}
    envVars.forEach(({ key, value }) => {
      if (key.trim()) {
        env[key.trim()] = value
      }
    })
    if (Object.keys(env).length > 0) {
      config.env = env
    }

    setIsLoading(true)

    try {
      if (mode === "add") {
        await addMutation.mutateAsync({
          name: name.trim(),
          config,
          configFile: "user",
        })
      } else {
        await updateMutation.mutateAsync({
          serverId: serverId!,
          config,
        })
      }
    } finally {
      setIsLoading(false)
    }
  }

  const addArg = () => setArgs([...args, ""])
  const removeArg = (index: number) => {
    setArgs(args.filter((_, i) => i !== index))
  }
  const updateArg = (index: number, value: string) => {
    const newArgs = [...args]
    newArgs[index] = value
    setArgs(newArgs)
  }

  const addEnvVar = () => setEnvVars([...envVars, { key: "", value: "" }])
  const removeEnvVar = (index: number) => {
    setEnvVars(envVars.filter((_, i) => i !== index))
  }
  const updateEnvVar = (index: number, field: "key" | "value", value: string) => {
    const newEnvVars = [...envVars]
    newEnvVars[index][field] = value
    setEnvVars(newEnvVars)
  }

  // Handle Escape key for add mode
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation()
        onOpenChange(false)
      }
    },
    [onOpenChange]
  )

  useEffect(() => {
    if (open && mode === "add") {
      document.addEventListener("keydown", handleKeyDown)
      return () => document.removeEventListener("keydown", handleKeyDown)
    }
  }, [open, mode, handleKeyDown])

  // For "add" mode, use motion.div like diff-center-peek-dialog
  if (mode === "add") {
    return (
      <AnimatePresence>
        {open && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="fixed inset-0 bg-black/50 z-50"
              onClick={() => onOpenChange(false)}
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
                    Configure a new MCP server to extend Claude&apos;s capabilities
                  </p>
                </div>
                <button
                  onClick={() => onOpenChange(false)}
                  className="p-2 rounded-md hover:bg-muted transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Content */}
              <div className="flex-1 overflow-hidden">
                <McpConfigChat
                  onConfigGenerated={(config) => {
                    setAiGeneratedConfig(config)
                    handleUseGenerated()
                  }}
                  onCancel={() => onOpenChange(false)}
                />
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    )
  }

  // For "edit" mode, use the regular Dialog
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit MCP Server</DialogTitle>
          <DialogDescription>
            Update the configuration for this MCP server
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
            {/* Server Name */}
            <div className="space-y-2">
              <Label htmlFor="name">Server Name</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., filesystem, brave-search"
                disabled={mode === "edit"}
              />
              {mode === "edit" && (
                <p className="text-xs text-muted-foreground">Server name cannot be changed</p>
              )}
            </div>

            {/* Server Type */}
            <div className="space-y-2">
              <Label>Server Type</Label>
              <div className="flex gap-2">
                {(["stdio", "http", "sse"] as const).map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setServerType(type)}
                    className={cn(
                      "flex-1 px-3 py-2 text-sm rounded-md border transition-colors",
                      serverType === type
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-background hover:bg-muted border-input"
                    )}
                  >
                    {type === "stdio" ? "Command (stdio)" : type.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>

            {/* Command/URL Section */}
            {serverType === "stdio" ? (
              <>
                <div className="space-y-2">
                  <Label htmlFor="command">Command</Label>
                  <Input
                    id="command"
                    value={command}
                    onChange={(e) => setCommand(e.target.value)}
                    placeholder="e.g., npx, python, node"
                  />
                </div>

                {/* Arguments */}
                <div className="space-y-2">
                  <Label>Arguments</Label>
                  {args.map((arg, index) => (
                    <div key={index} className="flex gap-2">
                      <Input
                        value={arg}
                        onChange={(e) => updateArg(index, e.target.value)}
                        placeholder={`Argument ${index + 1}`}
                      />
                      {args.length > 1 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => removeArg(index)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  ))}
                  <Button type="button" variant="outline" size="sm" onClick={addArg}>
                    <Plus className="h-4 w-4 mr-2" />
                    Add Argument
                  </Button>
                </div>
              </>
            ) : (
              <div className="space-y-2">
                <Label htmlFor="url">URL</Label>
                <Input
                  id="url"
                  type="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder={serverType === "sse" ? "https://example.com/sse" : "https://example.com/mcp"}
                />
              </div>
            )}

            {/* Environment Variables */}
            <div className="space-y-2">
              <Label>Environment Variables</Label>
              {envVars.map((env, index) => (
                <div key={index} className="flex gap-2">
                  <Input
                    value={env.key}
                    onChange={(e) => updateEnvVar(index, "key", e.target.value)}
                    placeholder="Key"
                    className="flex-1"
                  />
                  <Input
                    value={env.value}
                    onChange={(e) => updateEnvVar(index, "value", e.target.value)}
                    placeholder="Value"
                    className="flex-1"
                    type="password"
                  />
                  {envVars.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeEnvVar(index)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ))}
              <Button type="button" variant="outline" size="sm" onClick={addEnvVar}>
                <Plus className="h-4 w-4 mr-2" />
                Add Environment Variable
              </Button>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isLoading}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isLoading}>
                {isLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Save Changes
              </Button>
            </DialogFooter>
          </form>
      </DialogContent>
    </Dialog>
  )
}
