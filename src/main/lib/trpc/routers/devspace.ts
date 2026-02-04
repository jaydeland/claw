/**
 * DevSpace tRPC router for discovering and monitoring active devspace sync processes
 */
import { z } from "zod"
import { exec, spawn } from "child_process"
import { promisify } from "util"
import { readdir, stat, access } from "fs/promises"
import { join } from "path"
import { router, publicProcedure } from "../index"
import { observable } from "@trpc/server/observable"
import { getDatabase, devspaceSettings, devspaceStartedProcesses } from "../../db"
import { eq } from "drizzle-orm"

const execAsync = promisify(exec)

export interface DevSpaceProcess {
  pid: number
  command: string
  workingDir: string
  startTime: string
  isOurs: boolean // Whether this process was started by our app
  serviceName?: string // Service name if started by us
  terminalPaneId?: string // Terminal pane ID if associated
}

export interface DevSpaceLogEntry {
  timestamp: string
  level: "info" | "warn" | "error" | "debug"
  message: string
  raw: string
}

export interface DevspaceService {
  name: string
  path: string
  hasDevConfig: boolean
}

export interface DevspaceSettingsData {
  reposPath: string | null
  configSubPath: string
  startCommand: string
}

/**
 * Parse devspace log line to extract level and structured content
 */
function parseLogLine(line: string): DevSpaceLogEntry | null {
  if (!line.trim()) return null

  const timestamp = new Date().toISOString()
  let level: DevSpaceLogEntry["level"] = "info"
  let message = line

  // DevSpace log format detection
  // Common formats: "[info]", "[warn]", "[error]", "[debug]", or ANSI colored output
  const levelMatch = line.match(/\[(info|warn|warning|error|err|debug)\]/i)
  if (levelMatch) {
    const matchedLevel = levelMatch[1].toLowerCase()
    if (matchedLevel === "warning" || matchedLevel === "warn") {
      level = "warn"
    } else if (matchedLevel === "error" || matchedLevel === "err") {
      level = "error"
    } else if (matchedLevel === "debug") {
      level = "debug"
    } else {
      level = "info"
    }
  }

  // Check for error indicators in content
  if (
    line.toLowerCase().includes("error") ||
    line.toLowerCase().includes("failed") ||
    line.toLowerCase().includes("fatal")
  ) {
    level = "error"
  } else if (line.toLowerCase().includes("warn")) {
    level = "warn"
  }

  return {
    timestamp,
    level,
    message,
    raw: line,
  }
}

/**
 * Get the working directory of a process by PID
 */
async function getProcessWorkingDir(pid: number): Promise<string> {
  try {
    // macOS: use lsof to get cwd
    if (process.platform === "darwin") {
      const { stdout } = await execAsync(`lsof -p ${pid} -Fn | grep '^ncwd' | cut -c5-`)
      return stdout.trim() || "unknown"
    }
    // Linux: read /proc/{pid}/cwd symlink
    const { stdout } = await execAsync(`readlink -f /proc/${pid}/cwd`)
    return stdout.trim() || "unknown"
  } catch {
    return "unknown"
  }
}

/**
 * Get process start time
 */
async function getProcessStartTime(pid: number): Promise<string> {
  try {
    if (process.platform === "darwin") {
      const { stdout } = await execAsync(`ps -p ${pid} -o lstart=`)
      return stdout.trim() || "unknown"
    }
    // Linux
    const { stdout } = await execAsync(`ps -p ${pid} -o lstart=`)
    return stdout.trim() || "unknown"
  } catch {
    return "unknown"
  }
}

/**
 * Check if a directory has devspace configuration at the specified sub path
 */
async function hasDevspaceConfig(dirPath: string, configSubPath: string): Promise<boolean> {
  // Check the configured sub path
  const configPaths = [configSubPath]

  // Also check common fallbacks if the config path is specific
  if (!configSubPath.includes("/")) {
    // It's a single filename, also check deploy/ subdirectory
    configPaths.push(`deploy/${configSubPath}`)
  }

  for (const configPath of configPaths) {
    try {
      await access(join(dirPath, configPath))
      return true
    } catch {
      // File doesn't exist, try next
    }
  }

  return false
}

/**
 * Get devspace settings from database
 */
function getDevspaceSettingsFromDb(): DevspaceSettingsData {
  const db = getDatabase()
  let settings = db
    .select()
    .from(devspaceSettings)
    .where(eq(devspaceSettings.id, "default"))
    .get()

  if (!settings) {
    // Create default settings
    db.insert(devspaceSettings)
      .values({
        id: "default",
        reposPath: null,
        configSubPath: "devspace.yaml",
        startCommand: "devspace dev",
      })
      .run()
    settings = {
      id: "default",
      reposPath: null,
      configSubPath: "devspace.yaml",
      startCommand: "devspace dev",
      updatedAt: new Date(),
    }
  }

  return {
    reposPath: settings.reposPath,
    configSubPath: settings.configSubPath,
    startCommand: settings.startCommand,
  }
}

/**
 * Get repos path from settings, falling back to $VIDYARD_PATH for backward compatibility
 */
async function getReposPath(): Promise<string | null> {
  const settings = getDevspaceSettingsFromDb()

  // If settings has a repos path, use it
  if (settings.reposPath) {
    return settings.reposPath
  }

  // Fallback: try environment variable for backward compatibility
  if (process.env.VIDYARD_PATH) {
    return process.env.VIDYARD_PATH
  }

  // Try to get from user's shell
  try {
    const { stdout } = await execAsync(
      'bash -ilc "echo $VIDYARD_PATH"',
      { timeout: 5000 }
    )
    const path = stdout.trim()
    if (path && path !== "$VIDYARD_PATH") {
      return path
    }
  } catch {
    // Ignore errors
  }

  return null
}

/**
 * List available services from configured repos path
 */
async function listDevspaceServices(): Promise<DevspaceService[]> {
  const reposPath = await getReposPath()

  if (!reposPath) {
    return []
  }

  const settings = getDevspaceSettingsFromDb()

  try {
    const entries = await readdir(reposPath, { withFileTypes: true })
    const services: DevspaceService[] = []

    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith(".")) {
        continue
      }

      const servicePath = join(reposPath, entry.name)
      const hasConfig = await hasDevspaceConfig(servicePath, settings.configSubPath)

      services.push({
        name: entry.name,
        path: servicePath,
        hasDevConfig: hasConfig,
      })
    }

    // Sort by name
    services.sort((a, b) => a.name.localeCompare(b.name))

    return services
  } catch (error) {
    console.error("[devspace] Failed to list services:", error)
    return []
  }
}

/**
 * Check if a process is still running
 */
async function isProcessRunning(pid: number): Promise<boolean> {
  try {
    await execAsync(`kill -0 ${pid}`)
    return true
  } catch {
    return false
  }
}

/**
 * Clean up stale process records (processes that are no longer running)
 */
async function cleanupStaleProcesses() {
  const db = getDatabase()
  const processes = db.select().from(devspaceStartedProcesses).all()

  for (const proc of processes) {
    const running = await isProcessRunning(proc.pid)
    if (!running) {
      db.delete(devspaceStartedProcesses)
        .where(eq(devspaceStartedProcesses.id, proc.id))
        .run()
    }
  }
}

export const devspaceRouter = router({
  // ============ SETTINGS ============

  /**
   * Get devspace settings
   */
  getSettings: publicProcedure.query(async (): Promise<DevspaceSettingsData & { effectiveReposPath: string | null }> => {
    const settings = getDevspaceSettingsFromDb()
    const effectiveReposPath = await getReposPath()

    return {
      ...settings,
      effectiveReposPath,
    }
  }),

  /**
   * Update devspace settings
   */
  updateSettings: publicProcedure
    .input(
      z.object({
        reposPath: z.string().nullable().optional(),
        configSubPath: z.string().optional(),
        startCommand: z.string().optional(),
      })
    )
    .mutation(({ input }) => {
      const db = getDatabase()

      // Check if settings exist
      const existing = db
        .select()
        .from(devspaceSettings)
        .where(eq(devspaceSettings.id, "default"))
        .get()

      if (existing) {
        db.update(devspaceSettings)
          .set({
            ...(input.reposPath !== undefined && { reposPath: input.reposPath }),
            ...(input.configSubPath !== undefined && { configSubPath: input.configSubPath }),
            ...(input.startCommand !== undefined && { startCommand: input.startCommand }),
            updatedAt: new Date(),
          })
          .where(eq(devspaceSettings.id, "default"))
          .run()
      } else {
        db.insert(devspaceSettings)
          .values({
            id: "default",
            reposPath: input.reposPath ?? null,
            configSubPath: input.configSubPath ?? "devspace.yaml",
            startCommand: input.startCommand ?? "devspace dev",
          })
          .run()
      }

      return { success: true }
    }),

  // ============ PROCESS MANAGEMENT ============

  /**
   * List all active devspace processes on the system
   * Marks processes started by our app with isOurs=true
   */
  listProcesses: publicProcedure.query(async (): Promise<DevSpaceProcess[]> => {
    // First, clean up stale process records
    await cleanupStaleProcesses()

    // Get our started processes from DB
    const db = getDatabase()
    const ourProcesses = db.select().from(devspaceStartedProcesses).all()
    const ourPids = new Set(ourProcesses.map(p => p.pid))

    try {
      // Find devspace processes - look for "devspace" command with sync-related args
      const { stdout } = await execAsync(
        `ps aux | grep -E '[d]evspace.*(sync|dev|deploy)' | grep -v grep || true`
      )

      if (!stdout.trim()) {
        return []
      }

      const processes: DevSpaceProcess[] = []
      const lines = stdout.trim().split("\n")

      for (const line of lines) {
        if (!line.trim()) continue

        // Parse ps aux output: USER PID %CPU %MEM VSZ RSS TTY STAT START TIME COMMAND
        const parts = line.trim().split(/\s+/)
        if (parts.length < 11) continue

        const pid = parseInt(parts[1], 10)
        if (isNaN(pid)) continue

        // Get full command (everything after column 10)
        const command = parts.slice(10).join(" ")

        // Get working directory and start time in parallel
        const [workingDir, startTime] = await Promise.all([
          getProcessWorkingDir(pid),
          getProcessStartTime(pid),
        ])

        // Check if this is one of our processes
        const ourProcess = ourProcesses.find(p => p.pid === pid)

        processes.push({
          pid,
          command,
          workingDir,
          startTime,
          isOurs: ourPids.has(pid),
          serviceName: ourProcess?.serviceName,
          terminalPaneId: ourProcess?.terminalPaneId || undefined,
        })
      }

      return processes
    } catch (error) {
      console.error("[devspace] Failed to list processes:", error)
      return []
    }
  }),

  /**
   * List only processes started by our app
   */
  listOurProcesses: publicProcedure.query(async (): Promise<DevSpaceProcess[]> => {
    // First, clean up stale process records
    await cleanupStaleProcesses()

    const db = getDatabase()
    const ourProcesses = db.select().from(devspaceStartedProcesses).all()

    const processes: DevSpaceProcess[] = []

    for (const proc of ourProcesses) {
      const running = await isProcessRunning(proc.pid)
      if (!running) continue

      const [workingDir, startTime] = await Promise.all([
        getProcessWorkingDir(proc.pid),
        getProcessStartTime(proc.pid),
      ])

      processes.push({
        pid: proc.pid,
        command: `devspace dev (${proc.serviceName})`,
        workingDir,
        startTime,
        isOurs: true,
        serviceName: proc.serviceName,
        terminalPaneId: proc.terminalPaneId || undefined,
      })
    }

    return processes
  }),

  /**
   * Register a started process (called after terminal creates the process)
   */
  registerStartedProcess: publicProcedure
    .input(
      z.object({
        pid: z.number(),
        serviceName: z.string(),
        servicePath: z.string(),
        terminalPaneId: z.string().optional(),
      })
    )
    .mutation(({ input }) => {
      const db = getDatabase()

      // Check if already registered
      const existing = db
        .select()
        .from(devspaceStartedProcesses)
        .where(eq(devspaceStartedProcesses.pid, input.pid))
        .get()

      if (!existing) {
        db.insert(devspaceStartedProcesses)
          .values({
            pid: input.pid,
            serviceName: input.serviceName,
            servicePath: input.servicePath,
            terminalPaneId: input.terminalPaneId,
          })
          .run()
      }

      return { success: true }
    }),

  /**
   * Unregister a process (called when process exits)
   */
  unregisterProcess: publicProcedure
    .input(z.object({ pid: z.number() }))
    .mutation(({ input }) => {
      const db = getDatabase()
      db.delete(devspaceStartedProcesses)
        .where(eq(devspaceStartedProcesses.pid, input.pid))
        .run()
      return { success: true }
    }),

  /**
   * Stream logs from a specific devspace process
   */
  streamLogs: publicProcedure
    .input(
      z.object({
        pid: z.number(),
      })
    )
    .subscription(({ input }) => {
      return observable<DevSpaceLogEntry>((emit) => {
        let cleanup: (() => void) | null = null
        let isActive = true

        const startStreaming = async () => {
          try {
            // Verify process exists
            try {
              await execAsync(`kill -0 ${input.pid}`)
            } catch {
              emit.error(new Error(`Process ${input.pid} is not running`))
              return
            }

            // Use dtrace/strace to capture stdout/stderr of the process
            // This is complex and requires elevated permissions
            // Alternative: Use devspace's log file if available

            // For now, we'll attempt to capture via lsof + tail approach
            // First, check if devspace writes to a log file
            const workingDir = await getProcessWorkingDir(input.pid)

            // Check for common devspace log locations
            const logPaths = [
              `${workingDir}/.devspace/logs/sync.log`,
              `${workingDir}/.devspace/logs/dev.log`,
              `${workingDir}/.devspace/dev.log`,
            ]

            let logPath: string | null = null
            for (const path of logPaths) {
              try {
                await execAsync(`test -f "${path}"`)
                logPath = path
                break
              } catch {
                // File doesn't exist, try next
              }
            }

            if (logPath) {
              // Tail the log file
              const tail = spawn("tail", ["-f", "-n", "100", logPath])

              tail.stdout.on("data", (data: Buffer) => {
                if (!isActive) return
                const lines = data.toString().split("\n")
                for (const line of lines) {
                  const entry = parseLogLine(line)
                  if (entry) {
                    emit.next(entry)
                  }
                }
              })

              tail.stderr.on("data", (data: Buffer) => {
                if (!isActive) return
                const entry = parseLogLine(data.toString())
                if (entry) {
                  entry.level = "error"
                  emit.next(entry)
                }
              })

              tail.on("error", (error) => {
                emit.error(error)
              })

              tail.on("close", () => {
                if (isActive) {
                  emit.complete()
                }
              })

              cleanup = () => {
                isActive = false
                tail.kill()
              }
            } else {
              // No log file found - try to attach to process stdout
              // On macOS, we can use `script` command or dtrace
              // For simplicity, we'll poll process status and emit synthetic logs

              const pollInterval = setInterval(async () => {
                if (!isActive) {
                  clearInterval(pollInterval)
                  return
                }

                try {
                  // Check if process is still running
                  await execAsync(`kill -0 ${input.pid}`)

                  // Emit a heartbeat message
                  emit.next({
                    timestamp: new Date().toISOString(),
                    level: "info",
                    message: `DevSpace process ${input.pid} is running (no log file detected)`,
                    raw: `[info] Process ${input.pid} active`,
                  })
                } catch {
                  // Process ended
                  emit.next({
                    timestamp: new Date().toISOString(),
                    level: "warn",
                    message: `DevSpace process ${input.pid} has stopped`,
                    raw: `[warn] Process ${input.pid} stopped`,
                  })
                  clearInterval(pollInterval)
                  emit.complete()
                }
              }, 5000)

              cleanup = () => {
                isActive = false
                clearInterval(pollInterval)
              }

              // Emit initial message
              emit.next({
                timestamp: new Date().toISOString(),
                level: "info",
                message: `Connected to DevSpace process ${input.pid}. No log file found - showing process status.`,
                raw: `[info] Monitoring process ${input.pid}`,
              })
            }
          } catch (error) {
            console.error("[devspace] Stream error:", error)
            emit.error(error instanceof Error ? error : new Error(String(error)))
          }
        }

        startStreaming()

        return () => {
          isActive = false
          if (cleanup) {
            cleanup()
          }
        }
      })
    }),

  // ============ SERVICES ============

  /**
   * Check if devspace CLI is available
   */
  isAvailable: publicProcedure.query(async (): Promise<boolean> => {
    try {
      await execAsync("which devspace")
      return true
    } catch {
      return false
    }
  }),

  /**
   * Get devspace version
   */
  getVersion: publicProcedure.query(async (): Promise<string | null> => {
    try {
      const { stdout } = await execAsync("devspace version")
      return stdout.trim()
    } catch {
      return null
    }
  }),

  /**
   * List available services from configured repos path
   */
  listDevspaceServices: publicProcedure.query(
    async (): Promise<DevspaceService[]> => {
      return listDevspaceServices()
    }
  ),

  /**
   * Get service info for starting
   */
  getServiceInfo: publicProcedure
    .input(
      z.object({
        serviceName: z.string(),
      })
    )
    .query(
      async ({
        input,
      }): Promise<{ path: string; command: string } | null> => {
        const reposPath = await getReposPath()

        if (!reposPath) {
          return null
        }

        const settings = getDevspaceSettingsFromDb()
        const servicePath = join(reposPath, input.serviceName)

        try {
          const stats = await stat(servicePath)
          if (!stats.isDirectory()) {
            return null
          }

          return {
            path: servicePath,
            command: settings.startCommand,
          }
        } catch {
          return null
        }
      }
    ),

  /**
   * List git branches for a service directory
   * Handles both regular git repos and git worktrees
   */
  listBranches: publicProcedure
    .input(
      z.object({
        servicePath: z.string(),
      })
    )
    .query(async ({ input }): Promise<{ branches: string[]; currentBranch: string | null; error?: string }> => {
      console.log("[devspace] listBranches called with servicePath:", input.servicePath)

      try {
        // First check if the path exists and is a git repo (or worktree)
        let gitDir: string
        try {
          const { stdout } = await execAsync(`git -C "${input.servicePath}" rev-parse --git-dir`, { timeout: 5000 })
          gitDir = stdout.trim()
          console.log("[devspace] Git dir:", gitDir)
        } catch (gitCheckError) {
          console.error("[devspace] Not a git repository:", input.servicePath, gitCheckError)
          return { branches: [], currentBranch: null, error: `Not a git repository: ${input.servicePath}` }
        }

        // Get current branch
        const { stdout: currentStdout } = await execAsync(
          `git -C "${input.servicePath}" rev-parse --abbrev-ref HEAD`,
          { timeout: 5000 }
        )
        const currentBranch = currentStdout.trim()
        console.log("[devspace] Current branch:", currentBranch)

        // Get all local branches using git for-each-ref (more reliable for worktrees)
        const { stdout: branchesStdout } = await execAsync(
          `git -C "${input.servicePath}" for-each-ref --format="%(refname:short)" refs/heads/`,
          { timeout: 5000 }
        )

        let branches = branchesStdout
          .trim()
          .split("\n")
          .filter(b => b.length > 0)

        // If no local branches found, try fetching remote branches as fallback
        if (branches.length === 0) {
          console.log("[devspace] No local branches found, trying remote refs")
          try {
            const { stdout: remoteStdout } = await execAsync(
              `git -C "${input.servicePath}" for-each-ref --format="%(refname:short)" refs/remotes/origin/ | sed 's|origin/||'`,
              { timeout: 5000 }
            )
            branches = remoteStdout
              .trim()
              .split("\n")
              .filter(b => b.length > 0 && b !== "HEAD")
          } catch {
            console.log("[devspace] No remote branches either")
          }
        }

        // Sort branches
        branches.sort((a, b) => {
          // Put current branch first, then main/master, then alphabetical
          if (a === currentBranch) return -1
          if (b === currentBranch) return 1
          if (a === "main" || a === "master") return -1
          if (b === "main" || b === "master") return 1
          return a.localeCompare(b)
        })

        console.log("[devspace] Found branches:", branches.length, branches.slice(0, 5))
        return { branches, currentBranch }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        console.error("[devspace] Failed to list branches:", errorMessage)
        return { branches: [], currentBranch: null, error: errorMessage }
      }
    }),

  // Keep old alias for backward compatibility
  getDevyardServiceInfo: publicProcedure
    .input(
      z.object({
        serviceName: z.string(),
      })
    )
    .query(
      async ({
        input,
      }): Promise<{ path: string; command: string } | null> => {
        const reposPath = await getReposPath()

        if (!reposPath) {
          return null
        }

        const settings = getDevspaceSettingsFromDb()
        const servicePath = join(reposPath, input.serviceName)

        try {
          const stats = await stat(servicePath)
          if (!stats.isDirectory()) {
            return null
          }

          return {
            path: servicePath,
            command: settings.startCommand,
          }
        } catch {
          return null
        }
      }
    ),
})
