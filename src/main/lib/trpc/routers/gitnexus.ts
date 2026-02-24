import { z } from "zod"
import { router, publicProcedure } from "../index"
import { observable } from "@trpc/server/observable"
import { spawn, exec } from "node:child_process"
import { promisify } from "node:util"
import * as fs from "node:fs"
import * as path from "node:path"
import * as os from "node:os"
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

// Probe whether a port is accepting HTTP connections
async function isPortReady(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.get(`http://127.0.0.1:${port}`, (res) => {
      res.resume() // discard body
      resolve(true)
    })
    req.on("error", () => resolve(false))
    req.setTimeout(1000, () => {
      req.destroy()
      resolve(false)
    })
  })
}

// Build a PATH that includes common locations for node/npm/npx on macOS/Linux
function buildEnv(): NodeJS.ProcessEnv {
  const home = process.env.HOME || ""
  const extraPaths = [
    "/usr/local/bin",
    "/opt/homebrew/bin",
    "/opt/homebrew/sbin",
    `${home}/.nvm/versions/node/current/bin`,
    `${home}/.fnm/current/bin`,
    `${home}/.volta/bin`,
  ].filter(Boolean)
  return {
    ...process.env,
    PATH: [...extraPaths, process.env.PATH].filter(Boolean).join(":"),
  }
}

// Module-level ephemeral process state (not persisted — resets on app restart)
let serveProcess: ReturnType<typeof spawn> | null = null
let webProcess: ReturnType<typeof spawn> | null = null

function getToolsDir(): string {
  return path.join(app.getPath("userData"), "tools", "gitnexus")
}

/**
 * Spawn both the GitNexus API server (port 4747) and web UI server (port 5175).
 * Kills any previously tracked or orphaned processes on those ports first.
 */
async function spawnServers(projectPath: string): Promise<{ success: boolean; error?: string }> {
  const toolsDir = getToolsDir()

  try {
    // Kill tracked processes first (best effort)
    if (serveProcess && serveProcess.exitCode === null) {
      serveProcess.kill()
      serveProcess = null
    }
    if (webProcess && webProcess.exitCode === null) {
      webProcess.kill()
      webProcess = null
    }

    // Kill any orphaned processes still holding our ports
    await execAsync("lsof -ti tcp:4747 | xargs kill -9").catch(() => {})
    await execAsync("lsof -ti tcp:5175 | xargs kill -9").catch(() => {})

    const env = buildEnv()

    // Start API server
    serveProcess = spawn("npx", ["-y", "gitnexus@latest", "serve"], {
      cwd: projectPath,
      stdio: "pipe",
      shell: true,
      detached: false,
      env,
    })
    serveProcess.stdout?.on("data", (data: Buffer) => console.log("[GitNexus] API:", data.toString().trim()))
    serveProcess.stderr?.on("data", (data: Buffer) => console.error("[GitNexus] API err:", data.toString().trim()))
    serveProcess.on("error", (err) => { console.error("[GitNexus] API server error:", err); serveProcess = null })
    serveProcess.on("close", (code) => { console.log("[GitNexus] API server exited with code", code); serveProcess = null })

    // Start web dev server
    const webDir = path.join(toolsDir, "gitnexus-web")
    webProcess = spawn("npm", ["run", "dev", "--", "--port", "5175"], {
      cwd: webDir,
      stdio: "pipe",
      shell: true,
      detached: false,
      env,
    })
    webProcess.stdout?.on("data", (data: Buffer) => console.log("[GitNexus] Web:", data.toString().trim()))
    webProcess.stderr?.on("data", (data: Buffer) => console.error("[GitNexus] Web err:", data.toString().trim()))
    webProcess.on("error", (err) => { console.error("[GitNexus] Web server error:", err); webProcess = null })
    webProcess.on("close", (code) => { console.log("[GitNexus] Web server exited with code", code); webProcess = null })

    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

/**
 * Auto-start GitNexus servers at app startup if:
 * - GitNexus is installed (repo cloned + web deps present)
 * - At least one project has been indexed (has a .gitnexus directory)
 * - Servers aren't already running
 */
export async function autoStartGitNexusIfNeeded(): Promise<void> {
  const toolsDir = getToolsDir()

  // Check installation
  if (!fs.existsSync(toolsDir)) return
  if (!fs.existsSync(path.join(toolsDir, "gitnexus-web", "node_modules"))) return

  // Check if servers are already up
  const [apiRunning, webRunning] = await Promise.all([isPortReady(4747), isPortReady(5175)])
  if (apiRunning && webRunning) {
    console.log("[GitNexus] Servers already running, skipping auto-start")
    return
  }

  // Find the best cwd: prefer an indexed project, fall back to any project, then home dir
  const { getDatabase, projects } = await import("../../db")
  const db = getDatabase()
  const allProjects = db.select().from(projects).all()

  const indexedProject = allProjects.find((p) =>
    p.path && fs.existsSync(path.join(p.path, ".gitnexus"))
  )
  const anyProject = allProjects.find((p) => p.path)
  const cwd = indexedProject?.path ?? anyProject?.path ?? os.homedir()

  console.log(`[GitNexus] Auto-starting servers (cwd: ${cwd})`)
  const result = await spawnServers(cwd)
  if (!result.success) {
    console.error("[GitNexus] Auto-start failed:", result.error)
  }
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
    .query(async ({ input }) => {
      const toolsDir = getToolsDir()
      const repoCloned = fs.existsSync(toolsDir)
      const webDepsInstalled = fs.existsSync(path.join(toolsDir, "gitnexus-web", "node_modules"))
      const apiServerRunning = await isPortReady(4747)
      const webServerRunning = await isPortReady(5175)
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
   * Start both the API server (port 4747) and web server (port 5175)
   */
  startServers: publicProcedure
    .input(z.object({ projectPath: z.string() }))
    .mutation(async ({ input }) => {
      return spawnServers(input.projectPath)
    }),

  /**
   * Stop both servers
   */
  stopServers: publicProcedure.mutation(async () => {
    if (serveProcess && serveProcess.exitCode === null) {
      serveProcess.kill()
      serveProcess = null
    }
    if (webProcess && webProcess.exitCode === null) {
      webProcess.kill()
      webProcess = null
    }
    // Also kill by port to handle orphans from shell:true spawning
    await execAsync("lsof -ti tcp:4747 | xargs kill -9").catch(() => {})
    await execAsync("lsof -ti tcp:5175 | xargs kill -9").catch(() => {})
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
