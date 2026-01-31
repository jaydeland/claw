/**
 * DevSpace tRPC router for discovering and monitoring active devspace sync processes
 */
import { z } from "zod"
import { exec, spawn } from "child_process"
import { promisify } from "util"
import { router, publicProcedure } from "../index"
import { observable } from "@trpc/server/observable"

const execAsync = promisify(exec)

export interface DevSpaceProcess {
  pid: number
  command: string
  workingDir: string
  startTime: string
}

export interface DevSpaceLogEntry {
  timestamp: string
  level: "info" | "warn" | "error" | "debug"
  message: string
  raw: string
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

export const devspaceRouter = router({
  /**
   * List all active devspace processes on the system
   */
  listProcesses: publicProcedure.query(async (): Promise<DevSpaceProcess[]> => {
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

        processes.push({
          pid,
          command,
          workingDir,
          startTime,
        })
      }

      return processes
    } catch (error) {
      console.error("[devspace] Failed to list processes:", error)
      return []
    }
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
})
