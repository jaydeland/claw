import { z } from "zod"
import { router, publicProcedure } from "../index"
import { observable } from "@trpc/server/observable"
import { spawn, exec } from "node:child_process"
import { promisify } from "node:util"
import * as fs from "node:fs"
import * as path from "node:path"
import { app } from "electron"
import * as http from "node:http"

const execAsync = promisify(exec)

// GitNexus API base URL
const GITNEXUS_API_URL = "http://127.0.0.1:4747"

// GitNexus repo type
interface GitNexusRepo {
  name: string
  path: string
  indexedAt: string
  lastCommit: string
  stats: {
    files: number
    nodes: number
    edges: number
    communities: number
    processes: number
  }
}

// Fetch repos from GitNexus API
async function fetchRepos(): Promise<GitNexusRepo[]> {
  return new Promise((resolve) => {
    const req = http.get(`${GITNEXUS_API_URL}/api/repos`, (res) => {
      let data = ""
      res.on("data", (chunk) => (data += chunk))
      res.on("end", () => {
        try {
          const parsed = JSON.parse(data)
          resolve(parsed.repos || [])
        } catch {
          resolve([])
        }
      })
    })
    req.on("error", () => resolve([]))
    req.setTimeout(2000, () => {
      req.destroy()
      resolve([])
    })
  })
}

// Module-level ephemeral process state (not persisted — resets on app restart)
let serveProcess: ReturnType<typeof spawn> | null = null
let webProcess: ReturnType<typeof spawn> | null = null

function getToolsDir(): string {
  return path.join(app.getPath("userData"), "tools", "gitnexus")
}

export const gitnexusRouter = router({
  /**
   * List indexed repos from GitNexus API
   */
  listRepos: publicProcedure.query(async () => {
    const repos = await fetchRepos()
    return repos
  }),

  /**
   * Check installation and server status
   */
  checkStatus: publicProcedure
    .input(z.object({ projectPath: z.string() }))
    .query(({ input }) => {
      const toolsDir = getToolsDir()
      const repoCloned = fs.existsSync(toolsDir)
      const webDepsInstalled = fs.existsSync(path.join(toolsDir, "gitnexus-web", "node_modules"))
      const apiServerRunning = serveProcess !== null && serveProcess.exitCode === null
      const webServerRunning = webProcess !== null && webProcess.exitCode === null
      const projectIndexed = input.projectPath
        ? fs.existsSync(path.join(input.projectPath, ".gitnexus"))
        : false

      return {
        repoCloned,
        webDepsInstalled,
        apiServerRunning,
        webServerRunning,
        projectIndexed,
      }
    }),

  /**
   * Install GitNexus: clone repo + npm install in gitnexus-web
   */
  install: publicProcedure.subscription(() => {
    return observable<{ type: "progress" | "done" | "error"; message: string }>((emit) => {
      const toolsDir = getToolsDir()
      const parentDir = path.dirname(toolsDir)

      let isActive = true

      async function run() {
        try {
          // Ensure parent directory exists
          if (!fs.existsSync(parentDir)) {
            fs.mkdirSync(parentDir, { recursive: true })
          }

          // Step 1: Clone repo (if not already cloned)
          if (!fs.existsSync(toolsDir)) {
            if (!isActive) return
            emit.next({ type: "progress", message: "Cloning GitNexus repository..." })

            await new Promise<void>((resolve, reject) => {
              const cloneProc = spawn(
                "git",
                ["clone", "https://github.com/abhigyanpatwari/GitNexus", toolsDir],
                { stdio: "pipe" }
              )

              cloneProc.stdout?.on("data", (data: Buffer) => {
                if (isActive) emit.next({ type: "progress", message: data.toString().trim() })
              })
              cloneProc.stderr?.on("data", (data: Buffer) => {
                const msg = data.toString().trim()
                if (msg && isActive) emit.next({ type: "progress", message: msg })
              })
              cloneProc.on("close", (code) => {
                if (code === 0) resolve()
                else reject(new Error(`git clone failed with code ${code}`))
              })
              cloneProc.on("error", reject)
            })
          } else {
            if (isActive) emit.next({ type: "progress", message: "Repository already cloned, skipping..." })
          }

          // Step 2: npm install in gitnexus-web
          const webDir = path.join(toolsDir, "gitnexus-web")
          if (!fs.existsSync(path.join(webDir, "node_modules"))) {
            if (!isActive) return
            emit.next({ type: "progress", message: "Installing gitnexus-web dependencies (npm install)..." })

            await new Promise<void>((resolve, reject) => {
              const installProc = spawn("npm", ["install"], {
                cwd: webDir,
                stdio: "pipe",
                shell: process.platform === "win32",
              })

              installProc.stdout?.on("data", (data: Buffer) => {
                if (isActive) emit.next({ type: "progress", message: data.toString().trim() })
              })
              installProc.stderr?.on("data", (data: Buffer) => {
                const msg = data.toString().trim()
                if (msg && isActive) emit.next({ type: "progress", message: msg })
              })
              installProc.on("close", (code) => {
                if (code === 0) resolve()
                else reject(new Error(`npm install failed with code ${code}`))
              })
              installProc.on("error", reject)
            })
          } else {
            if (isActive) emit.next({ type: "progress", message: "Dependencies already installed, skipping..." })
          }

          if (isActive) emit.next({ type: "done", message: "GitNexus installed successfully." })
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err)
          if (isActive) emit.next({ type: "error", message })
        }
      }

      run()

      return () => {
        isActive = false
      }
    })
  }),

  /**
   * Start both the API server (port 4747) and web server (port 5173)
   */
  startServers: publicProcedure
    .input(z.object({ projectPath: z.string() }))
    .mutation(({ input }) => {
      const toolsDir = getToolsDir()

      try {
        // Kill existing processes if any
        if (serveProcess && serveProcess.exitCode === null) {
          serveProcess.kill()
          serveProcess = null
        }
        if (webProcess && webProcess.exitCode === null) {
          webProcess.kill()
          webProcess = null
        }

        // Start API server
        serveProcess = spawn("npx", ["-y", "gitnexus@latest", "serve"], {
          cwd: input.projectPath,
          stdio: "pipe",
          shell: process.platform === "win32",
          detached: false,
        })

        serveProcess.on("error", (err) => {
          console.error("[GitNexus] API server error:", err)
          serveProcess = null
        })
        serveProcess.on("close", () => {
          serveProcess = null
        })

        // Start web dev server
        const webDir = path.join(toolsDir, "gitnexus-web")
        webProcess = spawn("npm", ["run", "dev"], {
          cwd: webDir,
          stdio: "pipe",
          shell: process.platform === "win32",
          detached: false,
        })

        webProcess.on("error", (err) => {
          console.error("[GitNexus] Web server error:", err)
          webProcess = null
        })
        webProcess.on("close", () => {
          webProcess = null
        })

        return { success: true }
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err)
        return { success: false, error }
      }
    }),

  /**
   * Stop both servers
   */
  stopServers: publicProcedure.mutation(() => {
    if (serveProcess && serveProcess.exitCode === null) {
      serveProcess.kill()
      serveProcess = null
    }
    if (webProcess && webProcess.exitCode === null) {
      webProcess.kill()
      webProcess = null
    }
    return { success: true }
  }),

  /**
   * Run gitnexus analyze on a project, streaming output
   */
  analyzeProject: publicProcedure
    .input(z.object({ projectPath: z.string() }))
    .subscription(({ input }) => {
      return observable<{ type: "progress" | "done" | "error"; message: string }>((emit) => {
        let isActive = true

        const proc = spawn("npx", ["-y", "gitnexus@latest", "analyze", input.projectPath], {
          cwd: input.projectPath,
          stdio: "pipe",
          shell: process.platform === "win32",
        })

        proc.stdout?.on("data", (data: Buffer) => {
          if (isActive) emit.next({ type: "progress", message: data.toString().trim() })
        })

        proc.stderr?.on("data", (data: Buffer) => {
          const msg = data.toString().trim()
          if (msg && isActive) emit.next({ type: "progress", message: msg })
        })

        proc.on("close", (code) => {
          if (!isActive) return
          if (code === 0) {
            emit.next({ type: "done", message: "Project indexed successfully." })
          } else {
            emit.next({ type: "error", message: `analyze exited with code ${code}` })
          }
        })

        proc.on("error", (err) => {
          if (isActive) emit.next({ type: "error", message: err.message })
        })

        return () => {
          isActive = false
          proc.kill()
        }
      })
    }),

  /**
   * Write (or merge) gitnexus MCP entry into {projectPath}/.mcp.json
   */
  addMcpToProject: publicProcedure
    .input(z.object({ projectPath: z.string() }))
    .mutation(({ input }) => {
      try {
        const mcpPath = path.join(input.projectPath, ".mcp.json")
        let existing: Record<string, unknown> = {}

        if (fs.existsSync(mcpPath)) {
          try {
            existing = JSON.parse(fs.readFileSync(mcpPath, "utf-8"))
          } catch {
            // If parse fails, start fresh
          }
        }

        const mcpServers = (existing.mcpServers as Record<string, unknown>) ?? {}
        mcpServers["gitnexus"] = {
          command: "npx",
          args: ["-y", "gitnexus@latest", "mcp"],
        }

        const merged = { ...existing, mcpServers }
        fs.writeFileSync(mcpPath, JSON.stringify(merged, null, 2), "utf-8")

        return { success: true }
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err)
        return { success: false, error }
      }
    }),
})
