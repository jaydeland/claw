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
      const timeoutHandle = setTimeout(() => {
        reject(new Error("Connection timeout"))
        this.disconnect()
      }, 10000)

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
          .then(() => {
            clearTimeout(timeoutHandle)
            resolve()
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
   */
  private sendRequest(method: string, params?: Record<string, unknown>): Promise<unknown> {
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

      // Set timeout for request
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id)
        reject(new Error(`Request timeout: ${method}`))
      }, 5000)

      // Store pending request
      this.pendingRequests.set(id, { resolve, reject, timeout })

      // Send request
      const message = JSON.stringify(request) + "\n"
      this.process.stdin.write(message)
    })
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
   * Handle JSON-RPC response
   */
  private handleResponse(message: JsonRpcResponse): void {
    const pending = this.pendingRequests.get(Number(message.id))
    if (!pending) {
      return
    }

    clearTimeout(pending.timeout)
    this.pendingRequests.delete(Number(message.id))

    if (message.error) {
      pending.reject(
        new Error(
          `JSON-RPC error: ${message.error.message} (code: ${message.error.code})`
        )
      )
    } else {
      pending.resolve(message.result)
    }
  }

  /**
   * List available tools
   */
  async listTools(): Promise<McpTool[]> {
    try {
      const result = (await this.sendRequest("tools/list", {})) as {
        tools?: McpTool[]
      }
      return result.tools || []
    } catch (error) {
      console.error("[mcp-client] Failed to list tools:", error)
      return []
    }
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
 * Returns empty array if server fails to connect or doesn't respond
 */
export async function queryMcpServerTools(config: McpServerConfig): Promise<McpTool[]> {
  const client = new McpClient()

  try {
    console.log(`[mcp-tools] Connecting to server: ${config.command}`)
    await client.connect(config)

    console.log("[mcp-tools] Listing tools...")
    const tools = await client.listTools()
    console.log(`[mcp-tools] Found ${tools.length} tools`)

    return tools
  } catch (error) {
    console.error("[mcp-tools] Failed to query tools:", error)
    return []
  } finally {
    client.disconnect()
  }
}
