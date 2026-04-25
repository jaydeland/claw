"use client"

import { Button } from "../../ui/button"
import { Label } from "../../ui/label"
import { Play } from "lucide-react"

interface AgentsDevServerTabProps {
  projectId: string
}

/**
 * Dev Server Settings Tab
 *
 * Shows common dev server commands for reference.
 * The terminal feature has been removed; configure dev servers manually.
 */
export function AgentsDevServerTab({ projectId: _projectId }: AgentsDevServerTabProps) {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-2">
        <h2 className="text-lg font-semibold">Dev Server Configuration</h2>
        <p className="text-sm text-muted-foreground">
          Configure your development server manually and preview it by entering the URL in the Dev Server Preview pane.
        </p>
      </div>

      {/* Quick Set Section */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <Label>Common Start Commands</Label>
        </div>
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
              onClick={() => navigator.clipboard.writeText(cmd)}
              className="text-xs font-mono justify-start"
            >
              <Play className="h-3 w-3 mr-2" />
              {cmd}
            </Button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          Click a command to copy it, then run it in your own terminal outside of Claw.
        </p>
      </section>
    </div>
  )
}
