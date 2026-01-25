import { spawn, ChildProcess } from "node:child_process"
import { EventEmitter } from "node:events"
import type { McpServerConfig } from "../config/types"

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
        // Spawn the server process
        this.process = spawn(config.command, config.args || [], {
          env: { ...process.env, ...config.env },
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
 * Query tools from an MCP server
 * Throws an error if server fails to connect or doesn't respond - caller should handle
 */
export async function queryMcpServerTools(config: McpServerConfig): Promise<McpTool[]> {
  const client = new McpClient()
  const commandDisplay = `${config.command} ${(config.args || []).join(" ")}`.trim()

  try {
    console.log(`[mcp-tools] Connecting to server: ${commandDisplay}`)
    await client.connect(config)

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
