import { spawn, ChildProcess } from "node:child_process"
import { EventEmitter } from "node:events"
import { eq } from "drizzle-orm"
import type { McpServerConfig } from "../config/types"
import { getShellEnvironment } from "../git/shell-env"
import { getDatabase, claudeCodeSettings } from "../db"

/**
 * Get custom environment variables from settings
 */
function getCustomEnvVars(): Record<string, string> {
  try {
    const db = getDatabase()
    const settings = db
      .select()
      .from(claudeCodeSettings)
      .where(eq(claudeCodeSettings.id, "default"))
      .get()

    if (settings?.customEnvVars) {
      return JSON.parse(settings.customEnvVars) as Record<string, string>
    }
    return {}
  } catch (error) {
    console.error("[mcp-tools] Failed to get custom env vars from settings:", error)
    return {}
  }
}

/**
 * Expand environment variables in a string
 * Supports ${VAR}, ${VAR:-default}, and $VAR syntax
 */
export function expandEnvVars(str: string, env: Record<string, string | undefined> = process.env): string {
  // Handle ${VAR:-default} syntax first
  let result = str.replace(/\$\{([^}:]+):-([^}]*)\}/g, (_, varName, defaultValue) => {
    return env[varName] ?? defaultValue
  })

  // Handle ${VAR} syntax
  result = result.replace(/\$\{([^}]+)\}/g, (_, varName) => {
    return env[varName] ?? ""
  })

  // Handle $VAR syntax (word boundary)
  result = result.replace(/\$([A-Za-z_][A-Za-z0-9_]*)/g, (_, varName) => {
    return env[varName] ?? ""
  })

  return result
}

/**
 * Expand environment variables in MCP server config
 * Expands variables in command, args, url, and env values
 * Handles both command-based (stdio) and URL-based (http/sse) servers
 *
 * @param config The MCP server config to expand
 * @param baseEnv Optional base environment (defaults to process.env). Use getShellEnvironment() for GUI apps.
 */
export function expandConfigEnvVars(config: McpServerConfig, baseEnv: Record<string, string | undefined> = process.env): McpServerConfig {
  // First, expand config.env values using baseEnv only (not the merged env)
  // This handles self-referencing vars like VIDYARD_PATH: "${VIDYARD_PATH}"
  // which need to resolve from the shell environment first
  const expandedConfigEnv = config.env ? Object.fromEntries(
    Object.entries(config.env).map(([key, value]) => [key, expandEnvVars(value, baseEnv)])
  ) : undefined

  // Now merge: baseEnv as foundation, expanded config env takes precedence
  const mergedEnv = { ...baseEnv, ...expandedConfigEnv }

  return {
    ...config,
    // Handle command-based servers (stdio)
    ...(config.command && { command: expandEnvVars(config.command, mergedEnv) }),
    args: config.args?.map(arg => expandEnvVars(arg, mergedEnv)),
    // Handle URL-based servers (http/sse)
    ...(config.url && { url: expandEnvVars(config.url, mergedEnv) }),
    // Expand headers for HTTP servers (e.g., Authorization tokens)
    headers: config.headers ? Object.fromEntries(
      Object.entries(config.headers).map(([key, value]) => [key, expandEnvVars(value, mergedEnv)])
    ) : undefined,
    env: expandedConfigEnv,
  }
}

/**
 * MCP Tool definition
 */
export interface McpTool {
  name: string
  description?: string
  inputSchema?: {
    type: string
    properties?: Record<string, unknown>
    required?: string[]
    [key: string]: unknown
  }
}

/**
 * MCP JSON-RPC message types
 */
interface JsonRpcRequest {
  jsonrpc: "2.0"
  id: number | string
  method: string
  params?: Record<string, unknown>
}

/**
 * MCP JSON-RPC notification (no id field)
 */
interface JsonRpcNotification {
  jsonrpc: "2.0"
  method: string
  params?: Record<string, unknown>
}

interface JsonRpcResponse {
  jsonrpc: "2.0"
  id: number | string
  result?: unknown
  error?: {
    code: number
    message: string
    data?: unknown
  }
}

/**
 * MCP Client for querying server tools
 */
class McpClient extends EventEmitter {
  private process: ChildProcess | null = null
  private buffer = ""
  private requestId = 0
  private pendingRequests = new Map<
    number,
    {
      resolve: (result: unknown) => void
      reject: (error: Error) => void
      timeout: NodeJS.Timeout
    }
  >()
  private shellEnv: Record<string, string | undefined> = process.env

  /**
   * Set the shell environment to use for spawning processes
   * Call this before connect() when running as a GUI app on macOS
   */
  setShellEnv(env: Record<string, string | undefined>): void {
    this.shellEnv = env
  }

  /**
   * Connect to MCP server
   */
  async connect(config: McpServerConfig): Promise<void> {
    return new Promise((resolve, reject) => {
      // Increase connection timeout to 15 seconds - some servers (like uvx-based ones) take time to start
      const timeoutHandle = setTimeout(() => {
        reject(new Error("Connection timeout after 15 seconds - server may be slow to start or misconfigured"))
        this.disconnect()
      }, 15000)

      try {
        // Spawn the server process with shell environment (includes vars like PATH, VIDYARD_PATH)
        this.process = spawn(config.command, config.args || [], {
          env: { ...this.shellEnv, ...config.env } as NodeJS.ProcessEnv,
          stdio: ["pipe", "pipe", "pipe"],
        })

        if (!this.process.stdout || !this.process.stdin || !this.process.stderr) {
          reject(new Error("Failed to create stdio pipes"))
          clearTimeout(timeoutHandle)
          return
        }

        // Handle stdout (JSON-RPC responses)
        this.process.stdout.on("data", (chunk: Buffer) => {
          this.buffer += chunk.toString()
          this.processBuffer()
        })

        // Handle stderr (logs)
        this.process.stderr.on("data", (chunk: Buffer) => {
          const msg = chunk.toString().trim()
          if (msg) {
            console.log(`[mcp-client] stderr: ${msg}`)
          }
        })

        // Handle process errors
        this.process.on("error", (error) => {
          console.error("[mcp-client] Process error:", error)
          reject(error)
          clearTimeout(timeoutHandle)
        })

        // Handle process exit
        this.process.on("exit", (code) => {
          console.log(`[mcp-client] Process exited with code ${code}`)
        })

        // Send initialize request
        this.sendRequest("initialize", {
          protocolVersion: "2024-11-05",
          capabilities: {
            roots: { listChanged: false },
            sampling: {},
          },
          clientInfo: {
            name: "1code",
            version: "0.1.0",
          },
        })
          .then((result) => {
            console.log("[mcp-client] Initialize response received:", JSON.stringify(result).slice(0, 200))

            // CRITICAL: Send 'notifications/initialized' notification after initialize handshake
            // According to MCP protocol, this notification MUST be sent before other requests
            // Many servers (including AWS MCP) wait for this before responding to tools/list
            this.sendNotification("notifications/initialized", {})

            // Give the server a moment to process the notification
            setTimeout(() => {
              clearTimeout(timeoutHandle)
              resolve()
            }, 100)
          })
          .catch((error) => {
            clearTimeout(timeoutHandle)
            reject(error)
          })
      } catch (error) {
        clearTimeout(timeoutHandle)
        reject(error)
      }
    })
  }

  /**
   * Send JSON-RPC request and wait for response
   * @param method - The JSON-RPC method to call
   * @param params - Optional parameters for the method
   * @param timeoutMs - Custom timeout in milliseconds (default: 30000 for tools/list, 10000 otherwise)
   */
  private sendRequest(method: string, params?: Record<string, unknown>, timeoutMs?: number): Promise<unknown> {
    return new Promise((resolve, reject) => {
      if (!this.process || !this.process.stdin) {
        reject(new Error("Not connected"))
        return
      }

      const id = ++this.requestId
      const request: JsonRpcRequest = {
        jsonrpc: "2.0",
        id,
        method,
        params,
      }

      // Use longer timeout for tools/list since some servers have many tools (e.g., AWS MCP)
      const defaultTimeout = method === "tools/list" ? 30000 : 10000
      const actualTimeout = timeoutMs ?? defaultTimeout

      // Set timeout for request
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id)
        reject(new Error(`Request timeout after ${actualTimeout}ms: ${method}`))
      }, actualTimeout)

      // Store pending request
      this.pendingRequests.set(id, { resolve, reject, timeout })

      // Send request
      const message = JSON.stringify(request) + "\n"
      console.log(`[mcp-client] Sending request: ${method} (timeout: ${actualTimeout}ms)`)
      this.process.stdin.write(message)
    })
  }

  /**
   * Send JSON-RPC notification (no response expected)
   * Used for protocol notifications like 'initialized'
   */
  private sendNotification(method: string, params?: Record<string, unknown>): void {
    if (!this.process || !this.process.stdin) {
      console.warn("[mcp-client] Cannot send notification: not connected")
      return
    }

    const notification: JsonRpcNotification = {
      jsonrpc: "2.0",
      method,
      params,
    }

    const message = JSON.stringify(notification) + "\n"
    console.log(`[mcp-client] Sending notification: ${method}`)
    this.process.stdin.write(message)
  }

  /**
   * Process incoming JSON-RPC messages from buffer
   */
  private processBuffer(): void {
    const lines = this.buffer.split("\n")
    this.buffer = lines.pop() || "" // Keep incomplete line in buffer

    for (const line of lines) {
      if (!line.trim()) continue

      try {
        const message = JSON.parse(line) as JsonRpcResponse
        this.handleResponse(message)
      } catch (error) {
        console.error("[mcp-client] Failed to parse message:", error, line)
      }
    }
  }

  /**
   * Handle JSON-RPC response or notification
   */
  private handleResponse(message: JsonRpcResponse | { jsonrpc: "2.0"; method?: string }): void {
    // Check if this is a notification (no id field) - servers can send these
    if (!("id" in message) || message.id === undefined || message.id === null) {
      // This is a notification from the server, not a response to our request
      // Log it for debugging but don't treat it as an error
      const notif = message as { jsonrpc: "2.0"; method?: string }
      console.log(`[mcp-client] Received server notification: ${notif.method || "unknown"}`)
      return
    }

    const pending = this.pendingRequests.get(Number(message.id))
    if (!pending) {
      console.log(`[mcp-client] Received response for unknown request id: ${message.id}`)
      return
    }

    clearTimeout(pending.timeout)
    this.pendingRequests.delete(Number(message.id))

    const response = message as JsonRpcResponse
    if (response.error) {
      pending.reject(
        new Error(
          `JSON-RPC error: ${response.error.message} (code: ${response.error.code})`
        )
      )
    } else {
      pending.resolve(response.result)
    }
  }

  /**
   * List available tools
   * Throws an error if the request fails - caller should handle appropriately
   */
  async listTools(): Promise<McpTool[]> {
    console.log("[mcp-client] Requesting tools/list...")
    const result = (await this.sendRequest("tools/list", {})) as {
      tools?: McpTool[]
    }

    const tools = result?.tools || []
    console.log(`[mcp-client] tools/list returned ${tools.length} tools`)

    // Log first few tool names for debugging
    if (tools.length > 0) {
      const toolNames = tools.slice(0, 5).map(t => t.name)
      console.log(`[mcp-client] First few tools: ${toolNames.join(", ")}${tools.length > 5 ? "..." : ""}`)
    }

    return tools
  }

  /**
   * Disconnect from server
   */
  disconnect(): void {
    // Reject all pending requests
    for (const [id, pending] of this.pendingRequests.entries()) {
      clearTimeout(pending.timeout)
      pending.reject(new Error("Disconnected"))
      this.pendingRequests.delete(id)
    }

    // Kill process
    if (this.process) {
      this.process.kill()
      this.process = null
    }

    this.buffer = ""
  }
}

/**
 * Query tools from an HTTP/SSE MCP server
 * Uses fetch to communicate via JSON-RPC over HTTP
 */
async function queryHttpMcpServerTools(config: McpServerConfig, mergedEnv: Record<string, string | undefined>): Promise<McpTool[]> {
  // Expand environment variables in the config
  const expandedConfig = expandConfigEnvVars(config, mergedEnv)
  const url = expandedConfig.url

  if (!url) {
    throw new Error("HTTP MCP server config missing URL")
  }

  console.log(`[mcp-tools] Querying HTTP MCP server: ${url}`)

  // Build headers
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...expandedConfig.headers,
  }

  // Auto-inject MCP_ACCESS_TOKEN into Authorization header if present and no auth header set
  if (!headers["Authorization"] && !headers["authorization"]) {
    const accessToken = mergedEnv["MCP_ACCESS_TOKEN"]
    if (accessToken) {
      console.log("[mcp-tools] Injecting MCP_ACCESS_TOKEN into Authorization header")
      headers["Authorization"] = `Bearer ${accessToken}`
    }
  }

  let requestId = 0

  // Helper to send JSON-RPC request
  async function sendRequest(method: string, params?: Record<string, unknown>): Promise<unknown> {
    const request = {
      jsonrpc: "2.0",
      id: ++requestId,
      method,
      params,
    }

    const response = await fetch(url!, {
      method: "POST",
      headers,
      body: JSON.stringify(request),
    })

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }

    const contentType = response.headers.get("content-type") || ""

    // Handle SSE response
    if (contentType.includes("text/event-stream")) {
      const text = await response.text()
      // Parse SSE events - look for data: lines with JSON
      const lines = text.split("\n")
      for (const line of lines) {
        if (line.startsWith("data: ")) {
          try {
            const data = JSON.parse(line.slice(6))
            if (data.id === request.id) {
              if (data.error) {
                throw new Error(`JSON-RPC error: ${data.error.message}`)
              }
              return data.result
            }
          } catch {
            // Continue looking for valid JSON
          }
        }
      }
      throw new Error("No valid response found in SSE stream")
    }

    // Handle regular JSON response
    const data = await response.json()
    if (data.error) {
      throw new Error(`JSON-RPC error: ${data.error.message}`)
    }
    return data.result
  }

  // Initialize the server
  console.log("[mcp-tools] Sending initialize request to HTTP server...")
  await sendRequest("initialize", {
    protocolVersion: "2024-11-05",
    capabilities: {
      roots: { listChanged: false },
      sampling: {},
    },
    clientInfo: {
      name: "claw",
      version: "0.1.0",
    },
  })

  // List tools
  console.log("[mcp-tools] Requesting tools/list from HTTP server...")
  const result = await sendRequest("tools/list", {}) as { tools?: McpTool[] }
  const tools = result?.tools || []

  console.log(`[mcp-tools] HTTP server returned ${tools.length} tools`)
  return tools
}

/**
 * Query tools from an MCP server
 * Throws an error if server fails to connect or doesn't respond - caller should handle
 */
export async function queryMcpServerTools(config: McpServerConfig): Promise<McpTool[]> {
  // Get shell environment for env var expansion (handles macOS GUI app PATH issues)
  const shellEnv = await getShellEnvironment()

  // Get custom env vars from settings (user-defined, take precedence over shell env)
  const customEnvVars = getCustomEnvVars()

  // Merge environments: shell env as base, custom env vars take precedence
  const mergedEnv = { ...shellEnv, ...customEnvVars }

  // Check if this is an HTTP/SSE server (has URL, no command)
  if (config.url || config.type === "http" || config.type === "sse") {
    return queryHttpMcpServerTools(config, mergedEnv)
  }

  // Otherwise, use stdio client for command-based servers
  const client = new McpClient()

  // Set merged env on client so spawned processes get full environment
  client.setShellEnv(mergedEnv)

  // Expand environment variables in command, args, and env values
  const expandedConfig = expandConfigEnvVars(config, mergedEnv)
  const commandDisplay = `${expandedConfig.command} ${(expandedConfig.args || []).join(" ")}`.trim()

  try {
    console.log(`[mcp-tools] Connecting to server: ${commandDisplay}`)
    await client.connect(expandedConfig)

    console.log("[mcp-tools] Connection established, listing tools...")
    const tools = await client.listTools()
    console.log(`[mcp-tools] Successfully retrieved ${tools.length} tools from ${config.command}`)

    return tools
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    console.error(`[mcp-tools] Failed to query tools from ${config.command}:`, errorMessage)

    // Re-throw with more context
    throw new Error(`Failed to query tools: ${errorMessage}`)
  } finally {
    client.disconnect()
  }
}
