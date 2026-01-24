"use client"

import React from "react"
import { useAtomValue } from "jotai"
import { Terminal, FileCode, Loader2, Play } from "lucide-react"
import { cn } from "../../../lib/utils"
import { trpc } from "../../../lib/trpc"
import { selectedCommandAtom, selectedProjectAtom } from "../../agents/atoms"
import { Button } from "../../../components/ui/button"

/**
 * Badge component to show the source of a command
 */
function SourceBadge({ source }: { source: "user" | "project" | "custom" }) {
  const colors = {
    project: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
    user: "bg-green-500/10 text-green-600 dark:text-green-400",
    custom: "bg-purple-500/10 text-purple-600 dark:text-purple-400",
  }

  const labels = {
    project: "Project",
    user: "User",
    custom: "Custom",
  }

  return (
    <span
      className={cn(
        "text-xs px-2 py-0.5 rounded-full font-medium",
        colors[source],
      )}
    >
      {labels[source]}
    </span>
  )
}

export function CommandDetail() {
  const selectedCommandPath = useAtomValue(selectedCommandAtom)
  const selectedProject = useAtomValue(selectedProjectAtom)

  // Fetch all commands using tRPC
  const { data: commands, isLoading } = trpc.commands.list.useQuery({
    projectPath: selectedProject?.path,
  })

  // Find the selected command
  const command = commands?.find((cmd) => cmd.path === selectedCommandPath)

  if (!selectedCommandPath) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        <div className="text-center">
          <Terminal className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p className="text-sm">Select a command to view details</p>
        </div>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!command) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        <p className="text-sm">Command not found</p>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6 overflow-y-auto h-full">
      {/* Header */}
      <div className="space-y-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-muted">
              <Terminal className="h-5 w-5 text-foreground" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">/{command.name}</h2>
            </div>
          </div>
          <SourceBadge source={command.source} />
        </div>

        {/* Description */}
        {command.description && (
          <p className="text-sm text-muted-foreground">
            {command.description}
          </p>
        )}
      </div>

      {/* File Path */}
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          <FileCode className="h-4 w-4" />
          File Path
        </div>
        <div className="bg-muted/50 rounded-lg p-3">
          <code className="text-xs break-all text-muted-foreground">
            {command.path}
          </code>
        </div>
      </div>

      {/* Run Command Action */}
      <div className="pt-2">
        <Button
          variant="default"
          className="w-full"
          disabled
        >
          <Play className="h-4 w-4 mr-2" />
          Run Command
        </Button>
        <p className="text-xs text-muted-foreground text-center mt-2">
          Run commands by typing /{command.name} in the chat input
        </p>
      </div>
    </div>
  )
}
