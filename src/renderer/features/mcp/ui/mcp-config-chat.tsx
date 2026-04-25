"use client"

import React from "react"
import { Check } from "lucide-react"
import { Button } from "../../../components/ui/button"
import { cn } from "../../../lib/utils"

interface GeneratedConfig {
  name: string
  command?: string
  args?: string[]
  env?: Record<string, string>
  type?: "stdio" | "http" | "sse"
  url?: string
  headers?: Record<string, string>
}

interface McpConfigChatProps {
  detectedConfig: GeneratedConfig | null
  onUseConfig: () => void
  onCancel: () => void
}

/**
 * MCP-specific result preview component
 * Renders the detected MCP server configuration
 */
export function McpConfigResultPreview({
  config,
  onUse,
}: {
  config: GeneratedConfig
  onUse: () => void
}) {
  return (
    <div className="border border-primary/30 rounded-lg p-3 bg-primary/5 mt-4">
      <div className="flex items-center gap-2 mb-2">
        <Check className="h-4 w-4 text-primary" />
        <span className="text-sm font-medium">Configuration Generated</span>
      </div>
      <div className="text-xs text-muted-foreground space-y-1">
        <div className="flex justify-between">
          <span>Name:</span>
          <span className="font-medium text-foreground">{config.name}</span>
        </div>
        {config.command && (
          <div className="flex justify-between">
            <span>Command:</span>
            <span className="font-medium text-foreground">{config.command}</span>
          </div>
        )}
        {config.url && (
          <div className="flex justify-between">
            <span>URL:</span>
            <span className="font-medium text-foreground">{config.url}</span>
          </div>
        )}
        {config.env && Object.keys(config.env).length > 0 && (
          <div className="flex justify-between">
            <span>Env Vars:</span>
            <span className="font-medium text-foreground">
              {Object.keys(config.env).join(", ")}
            </span>
          </div>
        )}
      </div>
      <Button onClick={onUse} className="w-full mt-3" size="sm">
        <Check className="h-4 w-4 mr-2" />
        Use This Configuration
      </Button>
    </div>
  )
}

/**
 * Parse MCP config from AI message text
 */
export function parseMcpConfig(text: string): GeneratedConfig | null {
  try {
    // Look for JSON code blocks
    const jsonMatch = text.match(/```(?:json)?\s*({[\s\S]*?})\s*```/)
    if (jsonMatch) {
      const config = JSON.parse(jsonMatch[1])
      if (config.name) {
        return {
          name: config.name,
          command: config.command,
          args: config.args,
          env: config.env,
          type: config.type || "stdio",
          url: config.url,
          headers: config.headers,
        }
      }
    }

    // Try to find JSON object directly
    const directJsonMatch = text.match(/\{[\s\S]*"name"[\s\S]*\}/)
    if (directJsonMatch) {
      const config = JSON.parse(directJsonMatch[0])
      if (config.name) {
        return {
          name: config.name,
          command: config.command,
          args: config.args,
          env: config.env,
          type: config.type || "stdio",
          url: config.url,
          headers: config.headers,
        }
      }
    }
  } catch {
    // Not valid JSON, ignore
  }
  return null
}

/**
 * MCP greeting message
 */
export const MCP_GREETING = `Hello! I'm here to help you add an MCP server. What would you like to configure?

**Popular options:**
- **GitHub** - Interact with repositories, issues, PRs
- **Context7** - Documentation and code search
- **Filesystem** - Access local files
- **PostgreSQL** - Database integration
- **Slack** - Send messages
- **Other** - Any MCP server`

/**
 * Phrases that indicate MCP config is complete
 */
export const MCP_COMPLETION_PHRASES = [
  "the configuration has been added and the conversation is complete",
  "configuration has been added",
  "conversation is complete",
  "we're done",
  "mcp.json has been updated",
  "successfully added",
  "you can now use",
]

/**
 * MCP config chat wrapper - uses the generic AiAssistantDialog
 * This is kept for backward compatibility
 */
export function McpConfigChat({
  detectedConfig,
  onUseConfig,
  onCancel,
}: McpConfigChatProps) {
  if (!detectedConfig) return null

  return (
    <McpConfigResultPreview config={detectedConfig} onUse={onUseConfig} />
  )
}
