"use client"

import { useState, useEffect } from "react"
import { useSetAtom } from "jotai"
import { trpc } from "../../../lib/trpc"
import { Button } from "../../ui/button"
import { Input } from "../../ui/input"
import { Label } from "../../ui/label"
import { Textarea } from "../../ui/textarea"
import { AIPenIcon } from "../../ui/icons"
import { Play, AlertCircle } from "lucide-react"
import { toast } from "sonner"
import {
  agentsSettingsDialogOpenAtom,
  selectedAgentChatIdAtom,
  selectedProjectAtom,
  agentsSettingsDialogActiveTabAtom,
} from "../../../lib/atoms"
import { useAiQuery } from "../../../hooks/use-ai-query"
import { AiResultModal } from "../ai-result-modal"

interface AgentsDevServerTabProps {
  projectId: string
}

/**
 * Dev Server Settings Tab
 *
 * Allows users to configure dev server start commands with AI assistance
 */
export function AgentsDevServerTab({ projectId }: AgentsDevServerTabProps) {
  const setSelectedProject = useSetAtom(selectedProjectAtom)
  const setSelectedChatId = useSetAtom(selectedAgentChatIdAtom)
  const setSettingsDialogOpen = useSetAtom(agentsSettingsDialogOpenAtom)
  const setSettingsActiveTab = useSetAtom(agentsSettingsDialogActiveTabAtom)

  // Fetch start commands for the project
  const { data: startCommandsData, refetch: refetchStartCommands } =
    trpc.projects.getStartCommands.useQuery(
      { id: projectId },
      { enabled: !!projectId },
    )

  // Save start commands mutation
  const saveStartCommandsMutation = trpc.projects.updateStartCommands.useMutation({
    onSuccess: () => {
      toast.success("Start commands saved")
      refetchStartCommands()
    },
    onError: (err) => {
      toast.error("Failed to save start commands", {
        description: err.message,
      })
    },
  })

  // AI query for discovering dev commands
  const { mutate: runAiQuery, isPending: aiIsPending } = useAiQuery()
  const [aiResultOpen, setAiResultOpen] = useState(false)
  const [aiResult, setAiResult] = useState<string | null>(null)
  const [localStartCommands, setLocalStartCommands] = useState("")

  // Update local state when start commands load
  useEffect(() => {
    if (startCommandsData?.commands) {
      setLocalStartCommands(startCommandsData.commands.join("\n"))
    }
  }, [startCommandsData])

  // Handle AI discovery of dev commands
  const handleFillWithAI = () => {
    const prompt = `Analyze this project's package.json (or other config files) and determine the correct command to start the development server. Look for scripts like "dev", "start", "serve", etc. Return only the command, e.g., "bun run dev" or "npm start".`

    runAiQuery(
      {
        prompt,
        projectId,
      },
      {
        onSuccess: (result) => {
          setAiResult(result)
          setAiResultOpen(true)
        },
        onError: (err) => {
          toast.error("AI discovery failed", {
            description: err.message,
          })
        },
      }
    )
  }

  // Handle AI result acceptance
  const handleAcceptAiResult = () => {
    if (aiResult) {
      // Parse the AI result - it might be a single command or multiple
      const commands = aiResult.split("\n").filter(c => c.trim())
      saveStartCommandsMutation.mutate({
        id: projectId,
        commands,
      })
      setLocalStartCommands(commands.join("\n"))
      setAiResultOpen(false)
      setAiResult(null)
    }
  }

  // Handle save start commands
  const handleSaveStartCommands = () => {
    const commands = localStartCommands.split("\n").filter(c => c.trim())
    saveStartCommandsMutation.mutate({
      id: projectId,
      commands,
    })
  }

  // Handle close and navigate to dev server preview
  const handleDone = () => {
    setSettingsDialogActiveTab("chats") // Reset to default tab
    // This will be handled by the play button in dev-server-preview
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-2">
        <h2 className="text-lg font-semibold">Dev Server Configuration</h2>
        <p className="text-sm text-muted-foreground">
          Configure the command to start your development server. Use AI to auto-discover the correct command.
        </p>
      </div>

      {/* Start Commands Section */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <Label>Start Commands</Label>
          <Button
            variant="outline"
            size="sm"
            onClick={handleFillWithAI}
            disabled={aiIsPending}
            className="gap-2"
          >
            <AIPenIcon className="h-4 w-4" />
            {aiIsPending ? "Analyzing..." : "Fill With AI"}
          </Button>
        </div>

        <div className="space-y-2">
          <Textarea
            value={localStartCommands}
            onChange={(e) => setLocalStartCommands(e.target.value)}
            className="min-h-[120px] font-mono text-sm"
            placeholder="Enter start commands, one per line&#10;e.g., bun run dev&#10;npm start"
          />
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              Commands run sequentially in the terminal when dev server starts
            </p>
            <Button
              onClick={handleSaveStartCommands}
              disabled={saveStartCommandsMutation.isPending || !localStartCommands.trim()}
              size="sm"
            >
              {saveStartCommandsMutation.isPending ? "Saving..." : "Save Commands"}
            </Button>
          </div>
        </div>
      </section>

      {/* Info Section */}
      <section className="bg-muted/50 rounded-md p-4 space-y-2">
        <div className="flex items-start gap-2">
          <AlertCircle className="h-5 w-5 text-muted-foreground mt-0.5" />
          <div className="space-y-1 text-sm">
            <p className="font-medium">How it works</p>
            <ul className="list-disc list-inside space-y-1 text-muted-foreground">
              <li>Click "Fill With AI" to auto-discover the dev server command</li>
              <li>Commands are saved to your project configuration</li>
              <li>Click the Play button in Dev Server Preview to start the server</li>
              <li>The server will open automatically in the preview pane</li>
            </ul>
          </div>
        </div>
      </section>

      {/* Common Examples */}
      <section className="space-y-2">
        <Label>Common Commands</Label>
        <div className="grid grid-cols-2 gap-2">
          {[
            "bun run dev",
            "npm run dev",
            "yarn dev",
            "pnpm dev",
            "npm start",
            "bun start",
          ].map((cmd) => (
            <Button
              key={cmd}
              variant="outline"
              size="sm"
              onClick={() => setLocalStartCommands(cmd)}
              className="text-xs font-mono justify-start"
            >
              <Play className="h-3 w-3 mr-2" />
              {cmd}
            </Button>
          ))}
        </div>
      </section>

      {/* AI Result Modal */}
      {aiResultOpen && (
        <AiResultModal
          isOpen={aiResultOpen}
          onClose={() => {
            setAiResultOpen(false)
            setAiResult(null)
          }}
          result={aiResult || ""}
          onAccept={handleAcceptAiResult}
        />
      )}
    </div>
  )
}
