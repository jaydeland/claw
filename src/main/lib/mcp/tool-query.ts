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
        if (!config.command) {
          reject(new Error("MCP server command is required"))
          clearTimeout(timeoutHandle)
          return
        }

        // Spawn the server process with shell environment (includes vars like PATH, VIDYARD_PATH)
        this.process = spawn(config.command, config.args ?? [], {
          env: { ...this.shellEnv, ...config.env } as NodeJS.ProcessEnv,
          stdio: ["pipe", "pipe", "pipe"],
        })

        const proc = this.process!
        if (!proc.stdout || !proc.stdin || !proc.stderr) {
          reject(new Error("Failed to create stdio pipes"))
          clearTimeout(timeoutHandle)
          return
        }

        const { stdout, stderr } = proc

        // Handle stdout (JSON-RPC responses)
        stdout.on("data", (chunk: Buffer) => {
          this.buffer += chunk.toString()
          this.processBuffer()
        })

        // Handle stderr (logs)
        stderr.on("data", (chunk: Buffer) => {
          const msg = chunk.toString().trim()
          if (msg) {
            console.log(`[mcp-client] stderr: ${msg}`)
          }
        })

        // Handle process errors
        proc.on("error", (error) => {
          console.error("[mcp-client] Process error:", error)
          reject(error)
          clearTimeout(timeoutHandle)
        })

        // Handle process exit
        proc.on("exit", (code) => {
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
 * Query tools from an SSE (Server-Sent Events) MCP server
 * SSE transport works differently from HTTP:
 * 1. Client opens SSE connection to the server URL
 * 2. Server sends an "endpoint" event with the URL where requests should be POSTed
 * 3. Client POSTs JSON-RPC requests to that endpoint
 * 4. Server sends responses through the SSE stream
 */
async function querySseMcpServerTools(config: McpServerConfig, mergedEnv: Record<string, string | undefined>): Promise<McpTool[]> {
  const expandedConfig = expandConfigEnvVars(config, mergedEnv)
  const sseUrl = expandedConfig.url

  if (!sseUrl) {
    throw new Error("SSE MCP server config missing URL")
  }

  console.log(`[mcp-tools] Querying SSE MCP server: ${sseUrl}`)

  // Get auth credentials
  const accessTokenFromConfig = expandedConfig.env?.["MCP_ACCESS_TOKEN"]
  const accessTokenFromEnv = mergedEnv["MCP_ACCESS_TOKEN"]
  const accessToken = accessTokenFromConfig || accessTokenFromEnv

  // Build headers for SSE connection and POST requests
  const headers: Record<string, string> = {
    "Accept": "text/event-stream",
  }

  if (expandedConfig.headers) {
    Object.assign(headers, expandedConfig.headers)
  }

  if (!headers["Authorization"] && !headers["authorization"] && accessToken) {
    console.log("[mcp-tools] Injecting MCP_ACCESS_TOKEN into Authorization header for SSE")
    headers["Authorization"] = `Bearer ${accessToken}`
  }

  return new Promise<McpTool[]>((resolve, reject) => {
    let messageEndpoint: string | null = null
    let requestId = 0
    let tools: McpTool[] = []
    let connectionTimeout: NodeJS.Timeout | null = null
    let initializeSent = false
    let initializedSent = false
    let toolsRequested = false
    const pendingRequests = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>()

    // Set connection timeout
    connectionTimeout = setTimeout(() => {
      cleanup()
      reject(new Error("SSE connection timeout - no endpoint received"))
    }, 30000)

    // Create AbortController for the SSE connection
    const abortController = new AbortController()

    const cleanup = () => {
      if (connectionTimeout) {
        clearTimeout(connectionTimeout)
        connectionTimeout = null
      }
      abortController.abort()
      for (const pending of pendingRequests.values()) {
        pending.reject(new Error("Connection closed"))
      }
      pendingRequests.clear()
    }

    // Send a JSON-RPC request to the message endpoint
    const sendRequest = async (method: string, params?: Record<string, unknown>): Promise<unknown> => {
      if (!messageEndpoint) {
        throw new Error("No message endpoint available")
      }

      const id = ++requestId
      const request = {
        jsonrpc: "2.0",
        id,
        method,
        params: params || {},
      }

      console.log(`[mcp-tools] SSE sending request: ${method} (id=${id}) to ${messageEndpoint}`)

      const postHeaders: Record<string, string> = {
        "Content-Type": "application/json",
      }
      if (headers["Authorization"]) {
        postHeaders["Authorization"] = headers["Authorization"]
      }

      // Create a promise for this request
      return new Promise((resolveReq, rejectReq) => {
        pendingRequests.set(id, { resolve: resolveReq, reject: rejectReq })

        // Send the request
        fetch(messageEndpoint!, {
          method: "POST",
          headers: postHeaders,
          body: JSON.stringify(request),
        }).catch(err => {
          pendingRequests.delete(id)
          rejectReq(err)
        })

        // Set a timeout for this request
        setTimeout(() => {
          if (pendingRequests.has(id)) {
            pendingRequests.delete(id)
            rejectReq(new Error(`Request timeout for ${method}`))
          }
        }, 30000)
      })
    }

    // Send a notification (no response expected)
    const sendNotification = async (method: string, params?: Record<string, unknown>): Promise<void> => {
      if (!messageEndpoint) {
        throw new Error("No message endpoint available")
      }

      const notification = {
        jsonrpc: "2.0",
        method,
        params: params || {},
      }

      console.log(`[mcp-tools] SSE sending notification: ${method} to ${messageEndpoint}`)

      const postHeaders: Record<string, string> = {
        "Content-Type": "application/json",
      }
      if (headers["Authorization"]) {
        postHeaders["Authorization"] = headers["Authorization"]
      }

      try {
        await fetch(messageEndpoint, {
          method: "POST",
          headers: postHeaders,
          body: JSON.stringify(notification),
        })
      } catch (error) {
        console.log(`[mcp-tools] SSE notification ${method} failed:`, error)
      }
    }

    // Handle incoming SSE events
    const handleSseEvent = async (event: string, data: string) => {
      console.log(`[mcp-tools] SSE event: ${event}`)

      if (event === "endpoint") {
        // Server sends the message endpoint URL
        messageEndpoint = data.trim()
        console.log(`[mcp-tools] SSE received message endpoint: ${messageEndpoint}`)

        // If the endpoint is relative, make it absolute
        if (messageEndpoint.startsWith("/")) {
          const urlObj = new URL(sseUrl)
          messageEndpoint = `${urlObj.origin}${messageEndpoint}`
          console.log(`[mcp-tools] SSE resolved absolute endpoint: ${messageEndpoint}`)
        }

        // Now that we have the endpoint, start the MCP handshake
        if (!initializeSent) {
          initializeSent = true
          try {
            console.log("[mcp-tools] SSE sending initialize request...")
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
            // initialize response will be handled in the message event
          } catch (error) {
            console.error("[mcp-tools] SSE initialize failed:", error)
            cleanup()
            reject(error instanceof Error ? error : new Error(String(error)))
          }
        }
      } else if (event === "message") {
        // Handle JSON-RPC response
        try {
          const message = JSON.parse(data)
          console.log(`[mcp-tools] SSE received message:`, message.id ? `id=${message.id}` : "notification", message.method || "")

          if (message.id !== undefined) {
            // This is a response to one of our requests
            const pending = pendingRequests.get(message.id)
            if (pending) {
              pendingRequests.delete(message.id)
              if (message.error) {
                pending.reject(new Error(`JSON-RPC error: ${message.error.message}`))
              } else {
                pending.resolve(message.result)

                // Check if this is the initialize response
                if (!initializedSent && message.result?.serverInfo) {
                  initializedSent = true
                  console.log(`[mcp-tools] SSE server: ${message.result.serverInfo.name} v${message.result.serverInfo.version}`)

                  // Send initialized notification
                  await sendNotification("notifications/initialized", {})

                  // Small delay then request tools
                  setTimeout(async () => {
                    if (!toolsRequested) {
                      toolsRequested = true
                      try {
                        console.log("[mcp-tools] SSE requesting tools/list...")
                        const result = await sendRequest("tools/list", {}) as { tools?: McpTool[] }
                        tools = result?.tools || []
                        console.log(`[mcp-tools] SSE received ${tools.length} tools`)
                        cleanup()
                        resolve(tools)
                      } catch (error) {
                        cleanup()
                        reject(error instanceof Error ? error : new Error(String(error)))
                      }
                    }
                  }, 100)
                }
              }
            }
          }
        } catch (error) {
          console.log("[mcp-tools] SSE failed to parse message:", error)
        }
      }
    }

    // Start SSE connection using fetch (EventSource doesn't support custom headers)
    console.log("[mcp-tools] Opening SSE connection...")
    fetch(sseUrl, {
      method: "GET",
      headers,
      signal: abortController.signal,
    }).then(async response => {
      if (!response.ok) {
        cleanup()
        reject(new Error(`SSE HTTP ${response.status}: ${response.statusText}`))
        return
      }

      if (!response.body) {
        cleanup()
        reject(new Error("SSE response has no body"))
        return
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ""
      let currentEvent = "message"

      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })

          // Process complete lines
          const lines = buffer.split("\n")
          buffer = lines.pop() || "" // Keep incomplete line in buffer

          for (const line of lines) {
            if (line.startsWith("event:")) {
              currentEvent = line.slice(6).trim()
            } else if (line.startsWith("data:")) {
              const data = line.slice(5).trim()
              await handleSseEvent(currentEvent, data)
              currentEvent = "message" // Reset to default
            } else if (line === "") {
              // Empty line signals end of event (SSE spec)
              currentEvent = "message"
            }
          }
        }
      } catch (error) {
        if ((error as Error).name !== "AbortError") {
          console.error("[mcp-tools] SSE read error:", error)
        }
      }
    }).catch(error => {
      if (error.name !== "AbortError") {
        cleanup()
        reject(error instanceof Error ? error : new Error(String(error)))
      }
    })
  })
}

/**
 * Query tools from an HTTP MCP server (non-SSE)
 * Uses fetch to communicate via JSON-RPC over HTTP
 *
 * First attempts to query without authentication (many MCP servers allow
 * listing tools without auth). Falls back to authenticated request if needed.
 */
async function queryHttpMcpServerTools(config: McpServerConfig, mergedEnv: Record<string, string | undefined>): Promise<McpTool[]> {
  // Expand environment variables in the config
  const expandedConfig = expandConfigEnvVars(config, mergedEnv)
  const url = expandedConfig.url

  if (!url) {
    throw new Error("HTTP MCP server config missing URL")
  }

  console.log(`[mcp-tools] Querying HTTP MCP server: ${url}`)

  // Check if we have auth credentials
  // After OAuth flow, MCP_ACCESS_TOKEN is stored in config.env (via injectStoredCredentials)
  // So we need to check both mergedEnv and the expanded config's env
  const accessTokenFromConfig = expandedConfig.env?.["MCP_ACCESS_TOKEN"]
  const accessTokenFromEnv = mergedEnv["MCP_ACCESS_TOKEN"]
  const accessToken = accessTokenFromConfig || accessTokenFromEnv

  if (accessTokenFromConfig) {
    console.log(`[mcp-tools] Found MCP_ACCESS_TOKEN in config.env (${accessTokenFromConfig.slice(0, 8)}...)`)
  } else if (accessTokenFromEnv) {
    console.log(`[mcp-tools] Found MCP_ACCESS_TOKEN in mergedEnv`)
  } else {
    console.log(`[mcp-tools] No MCP_ACCESS_TOKEN found`)
  }

  const hasConfiguredAuth = expandedConfig.headers?.["Authorization"] ||
                            expandedConfig.headers?.["authorization"] ||
                            accessToken

  // Build headers for different auth modes
  function buildHeaders(useAuth: boolean): Record<string, string> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    }

    if (useAuth) {
      // Add configured headers
      if (expandedConfig.headers) {
        Object.assign(headers, expandedConfig.headers)
      }

      // Auto-inject MCP_ACCESS_TOKEN if no auth header already set
      if (!headers["Authorization"] && !headers["authorization"] && accessToken) {
        console.log("[mcp-tools] Injecting MCP_ACCESS_TOKEN into Authorization header")
        headers["Authorization"] = `Bearer ${accessToken}`
      }
    }

    return headers
  }

  // Helper to create request function with specific headers
  function createSendRequest(headers: Record<string, string>) {
    let requestId = 0

    return async function sendRequest(method: string, params?: Record<string, unknown>): Promise<unknown> {
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
  }

  // Helper to send a notification (no response expected)
  // Per JSON-RPC 2.0 spec, notifications MUST NOT have an "id" field
  function createSendNotification(headers: Record<string, string>) {
    return async function sendNotification(method: string, params?: Record<string, unknown>): Promise<void> {
      // JSON-RPC 2.0 notification - no "id" field means server won't send a response
      const notification = {
        jsonrpc: "2.0",
        method,
        params: params || {},
      }

      try {
        await fetch(url!, {
          method: "POST",
          headers,
          body: JSON.stringify(notification),
        })
        // Notifications don't require a response, so we don't check the result
      } catch (error) {
        // Notifications are fire-and-forget, log but don't throw
        console.log(`[mcp-tools] Notification ${method} failed:`, error)
      }
    }
  }

  // Server capabilities response type
  interface InitializeResult {
    protocolVersion?: string
    capabilities?: {
      tools?: Record<string, unknown>
      resources?: Record<string, unknown>
      prompts?: Record<string, unknown>
      logging?: Record<string, unknown>
    }
    serverInfo?: {
      name?: string
      version?: string
    }
  }

  // Helper to query tools with a specific sendRequest function
  async function queryWithRequest(
    sendRequest: (method: string, params?: Record<string, unknown>) => Promise<unknown>,
    sendNotification: (method: string, params?: Record<string, unknown>) => Promise<void>
  ): Promise<McpTool[]> {
    // Initialize the server and capture capabilities
    console.log("[mcp-tools] Sending initialize request to HTTP server...")
    const initResult = await sendRequest("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {
        roots: { listChanged: false },
        sampling: {},
      },
      clientInfo: {
        name: "claw",
        version: "0.1.0",
      },
    }) as InitializeResult

    // Log server info and capabilities for debugging
    const serverName = initResult?.serverInfo?.name || "unknown"
    const serverVersion = initResult?.serverInfo?.version || "unknown"
    const hasToolsCapability = !!initResult?.capabilities?.tools
    console.log(`[mcp-tools] Server: ${serverName} v${serverVersion}`)
    console.log(`[mcp-tools] Server capabilities:`, JSON.stringify(initResult?.capabilities || {}))
    console.log(`[mcp-tools] Server declares tools capability: ${hasToolsCapability}`)

    // CRITICAL: Send 'notifications/initialized' notification after initialize handshake
    // According to MCP protocol, this notification MUST be sent before other requests
    // Many servers (including AWS MCP, Datadog) wait for this before responding to tools/list
    console.log("[mcp-tools] Sending notifications/initialized to HTTP server...")
    await sendNotification("notifications/initialized", {})

    // Small delay to let server process the notification
    await new Promise(resolve => setTimeout(resolve, 100))

    // List tools (even if server didn't declare tools capability - some servers don't advertise properly)
    console.log("[mcp-tools] Requesting tools/list from HTTP server...")
    const result = await sendRequest("tools/list", {}) as { tools?: McpTool[] }
    const tools = result?.tools || []

    console.log(`[mcp-tools] HTTP server returned ${tools.length} tools`)
    return tools
  }

  // First, try without authentication (many servers allow listing tools without auth)
  console.log("[mcp-tools] Attempting to query tools without authentication...")
  try {
    const noAuthHeaders = buildHeaders(false)
    const sendRequestNoAuth = createSendRequest(noAuthHeaders)
    const sendNotificationNoAuth = createSendNotification(noAuthHeaders)
    const tools = await queryWithRequest(sendRequestNoAuth, sendNotificationNoAuth)
    console.log("[mcp-tools] Successfully queried tools without authentication")
    return tools
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    console.log(`[mcp-tools] Unauthenticated query failed: ${errorMessage}`)

    // If we have auth credentials and got an auth-related error, try with auth
    // Some servers return 400 Bad Request instead of 401/403 when auth is missing
    const isAuthError = errorMessage.includes("400") ||
                        errorMessage.includes("401") ||
                        errorMessage.includes("403") ||
                        errorMessage.includes("Unauthorized") ||
                        errorMessage.includes("Bad Request")
    if (hasConfiguredAuth && isAuthError) {
      console.log("[mcp-tools] Retrying with authentication...")
      const authHeaders = buildHeaders(true)
      const sendRequestWithAuth = createSendRequest(authHeaders)
      const sendNotificationWithAuth = createSendNotification(authHeaders)
      return queryWithRequest(sendRequestWithAuth, sendNotificationWithAuth)
    }

    // Re-throw the original error
    throw error
  }
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

  // Check if this is an SSE server (type explicitly set to "sse")
  if (config.type === "sse") {
    return querySseMcpServerTools(config, mergedEnv)
  }

  // Check if this is an HTTP server (has URL, no command)
  if (config.url || config.type === "http") {
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
