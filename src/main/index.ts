import { app, BrowserWindow, Menu } from "electron"
import { join } from "path"
import { readFileSync, existsSync, unlinkSync, readlinkSync } from "fs"
import { initDatabase, closeDatabase } from "./lib/db"
import { createMainWindow, getWindow } from "./windows/main"
import {
  initAutoUpdater,
  checkForUpdates,
  downloadUpdate,
  setupFocusUpdateCheck,
} from "./lib/auto-updater"
import { cleanupGitWatchers } from "./lib/git/watcher"
import { initBackgroundSession, closeBackgroundSession } from "./lib/claude/background-session"
import { taskWatcher, taskEvents, startCleanupScheduler, stopCleanupScheduler, notifyTaskCompleted } from "./lib/background-tasks"
import { terminalManager } from "./lib/terminal/manager"

// Dev mode detection
const IS_DEV = !!process.env.ELECTRON_RENDERER_URL

// Set dev mode userData path BEFORE requestSingleInstanceLock()
// This ensures dev and prod have separate instance locks
if (IS_DEV) {
  const { join } = require("path")
  const devUserData = join(app.getPath("userData"), "..", "Agents Dev")
  app.setPath("userData", devUserData)
  console.log("[Dev] Using separate userData path:", devUserData)
}

// Enable remote debugging for MCP server access (dev mode only)
if (IS_DEV) {
  app.commandLine.appendSwitch("remote-debugging-port", "9223")
  console.log("[Dev] Remote debugging enabled on port 9223")

  // Disable sandbox for dev mode to allow PTY and child process spawning
  // This is needed when running Electron from Nix/Flox environments
  app.commandLine.appendSwitch("no-sandbox")
  console.log("[Dev] Sandbox disabled for development")
}

// Clean up stale lock files from crashed instances
// Returns true if locks were cleaned, false otherwise
function cleanupStaleLocks(): boolean {
  const userDataPath = app.getPath("userData")
  const lockPath = join(userDataPath, "SingletonLock")

  if (!existsSync(lockPath)) return false

  try {
    // SingletonLock is a symlink like "hostname-pid"
    const lockTarget = readlinkSync(lockPath)
    const match = lockTarget.match(/-(\d+)$/)
    if (match) {
      const pid = parseInt(match[1], 10)
      try {
        // Check if process is running (signal 0 doesn't kill, just checks)
        process.kill(pid, 0)
        // Process exists, lock is valid
        console.log("[App] Lock held by running process:", pid)
        return false
      } catch {
        // Process doesn't exist, clean up stale locks
        console.log("[App] Cleaning stale locks (pid", pid, "not running)")
        const filesToRemove = ["SingletonLock", "SingletonSocket", "SingletonCookie"]
        for (const file of filesToRemove) {
          const filePath = join(userDataPath, file)
          if (existsSync(filePath)) {
            try {
              unlinkSync(filePath)
            } catch (e) {
              console.warn("[App] Failed to remove", file, e)
            }
          }
        }
        return true
      }
    }
  } catch (e) {
    console.warn("[App] Failed to check lock file:", e)
  }
  return false
}

// Prevent multiple instances
let gotTheLock = app.requestSingleInstanceLock()

if (!gotTheLock) {
  // Maybe stale lock - try cleanup and retry once
  const cleaned = cleanupStaleLocks()
  if (cleaned) {
    gotTheLock = app.requestSingleInstanceLock()
  }
  if (!gotTheLock) {
    app.quit()
  }
}

if (gotTheLock) {
  // Handle second instance launch
  app.on("second-instance", () => {
    const window = getWindow()
    if (window) {
      if (window.isMinimized()) window.restore()
      window.focus()
    }
  })

  // App ready
  app.whenReady().then(async () => {
    // Set dev mode app name (userData path was already set before requestSingleInstanceLock)
    if (IS_DEV) {
      app.name = "Agents Dev"
    }

    // Set app user model ID for Windows (different in dev to avoid taskbar conflicts)
    if (process.platform === "win32") {
      app.setAppUserModelId(IS_DEV ? "com.claw.app.dev" : "com.claw.app")
    }

    console.log(`[App] Starting Claw${IS_DEV ? " (DEV)" : ""}...`)

    // Get Claude Code version for About panel
    let claudeCodeVersion = "unknown"
    try {
      const isDev = !app.isPackaged
      const versionPath = isDev
        ? join(app.getAppPath(), "resources/bin/VERSION")
        : join(process.resourcesPath, "bin/VERSION")

      if (existsSync(versionPath)) {
        const versionContent = readFileSync(versionPath, "utf-8")
        claudeCodeVersion = versionContent.split("\n")[0]?.trim() || "unknown"
      }
    } catch (error) {
      console.warn("[App] Failed to read Claude Code version:", error)
    }

    // Set About panel options with Claude Code version
    app.setAboutPanelOptions({
      applicationName: "Claw",
      applicationVersion: app.getVersion(),
      version: `Claude Code ${claudeCodeVersion}`,
    })

    // Track update availability for menu
    let updateAvailable = false
    let availableVersion: string | null = null

    // Function to build and set application menu
    const buildMenu = () => {
      const template: Electron.MenuItemConstructorOptions[] = [
        {
          label: app.name,
          submenu: [
            { role: "about", label: "About Claw" },
            {
              label: updateAvailable
                ? `Update to v${availableVersion}...`
                : "Check for Updates...",
              click: () => {
                // Send event to renderer to clear dismiss state
                const win = getWindow()
                if (win) {
                  win.webContents.send("update:manual-check")
                }
                // If update is already available, start downloading immediately
                if (updateAvailable) {
                  downloadUpdate()
                } else {
                  checkForUpdates(true)
                }
              },
            },
            { type: "separator" },
            { role: "services" },
            { type: "separator" },
            { role: "hide" },
            { role: "hideOthers" },
            { role: "unhide" },
            { type: "separator" },
            { role: "quit" },
          ],
        },
        {
          label: "File",
          submenu: [
            {
              label: "New Chat",
              accelerator: "CmdOrCtrl+N",
              click: () => {
                console.log("[Menu] New Chat clicked (Cmd+N)")
                const win = getWindow()
                if (win) {
                  console.log("[Menu] Sending shortcut:new-agent to renderer")
                  win.webContents.send("shortcut:new-agent")
                } else {
                  console.log("[Menu] No window found!")
                }
              },
            },
          ],
        },
        {
          label: "Edit",
          submenu: [
            { role: "undo" },
            { role: "redo" },
            { type: "separator" },
            { role: "cut" },
            { role: "copy" },
            { role: "paste" },
            { role: "selectAll" },
          ],
        },
        {
          label: "View",
          submenu: [
            { role: "reload" },
            { role: "forceReload" },
            { role: "toggleDevTools" },
            { type: "separator" },
            { role: "resetZoom" },
            { role: "zoomIn" },
            { role: "zoomOut" },
            { type: "separator" },
            { role: "togglefullscreen" },
          ],
        },
        {
          label: "Window",
          submenu: [
            { role: "minimize" },
            { role: "zoom" },
            { type: "separator" },
            { role: "front" },
          ],
        },
        {
          role: "help",
          submenu: [],
        },
      ]
      Menu.setApplicationMenu(Menu.buildFromTemplate(template))
    }

    // Set update state and rebuild menu
    const setUpdateAvailable = (available: boolean, version?: string) => {
      updateAvailable = available
      availableVersion = version || null
      buildMenu()
    }

    // Expose setUpdateAvailable globally for auto-updater
    ;(global as any).__setUpdateAvailable = setUpdateAvailable

    // Build initial menu
    buildMenu()

    // Initialize database
    try {
      initDatabase()
      console.log("[App] Database initialized")
    } catch (error) {
      console.error("[App] Failed to initialize database:", error)
    }

    // Run data migrations (after database schema is ready)
    try {
      const { getDatabase, appSettings } = await import("./lib/db")
      const { eq } = await import("drizzle-orm")
      const { migrateWorktreeLocations } = await import(
        "./lib/migrations/worktree-location-migration"
      )

      const db = getDatabase()

      // Get or create app settings
      let settings = db.select().from(appSettings).get()
      if (!settings) {
        console.log("[App] Creating initial app settings")
        db.insert(appSettings)
          .values({
            id: "default",
            lastMigrationVersion: null,
            updatedAt: new Date(),
          })
          .run()
        settings = db.select().from(appSettings).get()
      }

      // Check if worktree migration needs to run
      const WORKTREE_MIGRATION_VERSION = "0.1.0"
      if (
        !settings?.lastMigrationVersion ||
        settings.lastMigrationVersion < WORKTREE_MIGRATION_VERSION
      ) {
        console.log("[App] Running worktree location migration...")
        const migratedCount = await migrateWorktreeLocations()

        // Update migration version
        db.update(appSettings)
          .set({
            lastMigrationVersion: WORKTREE_MIGRATION_VERSION,
            updatedAt: new Date(),
          })
          .where(eq(appSettings.id, "default"))
          .run()

        console.log(
          `[App] Worktree migration complete (${migratedCount} chats updated)`,
        )
      } else {
        console.log("[App] Worktree migration already applied, skipping")
      }
    } catch (error) {
      console.error("[App] Failed to run data migrations:", error)
    }

    // Create main window
    createMainWindow()

    // Initialize task watcher and cleanup scheduler (after database init)
    console.log("[App] Starting task watcher...")
    taskWatcher.start()
    startCleanupScheduler()

    // Wire up desktop notifications for task completion
    taskEvents.on("status-change", (update) => {
      notifyTaskCompleted(update, getWindow)
    })

    // Initialize auto-updater (production only)
    if (app.isPackaged) {
      await initAutoUpdater(getWindow)
      // Setup update check on window focus (instead of periodic interval)
      setupFocusUpdateCheck(getWindow)
      // Check for updates 5 seconds after startup (force to bypass interval check)
      setTimeout(() => {
        checkForUpdates(true)
      }, 5000)
    }

    // Warm up MCP cache 3 seconds after startup (background, non-blocking)
    // This populates the cache so all future sessions can use filtered MCP servers
    setTimeout(async () => {
      try {
        const { warmupMcpCache } = await import("./lib/trpc/routers/claude")
        await warmupMcpCache()
      } catch (error) {
        console.error("[App] MCP warmup failed:", error)
      }
    }, 3000)

    // Initialize background Claude session 5 seconds after startup (dev mode only for now)
    // This provides a persistent session for utility tasks like title generation
    if (IS_DEV) {
      setTimeout(async () => {
        try {
          console.log("[App] Initializing background Claude session...")
          await initBackgroundSession()
        } catch (error) {
          console.error("[App] Background session initialization failed:", error)
        }
      }, 5000)
    }

    // macOS: Re-create window when dock icon is clicked
    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createMainWindow()
      }
    })
  })

  // Quit when all windows are closed (except on macOS)
  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
      app.quit()
    }
  })

  // Cleanup before quit
  app.on("before-quit", async () => {
    console.log("[App] Shutting down...")
    taskWatcher.stop()
    stopCleanupScheduler()
    await cleanupGitWatchers()
    await terminalManager.cleanup()
    await closeBackgroundSession()
    await closeDatabase()
  })

  // Handle uncaught exceptions
  process.on("uncaughtException", (error) => {
    console.error("[App] Uncaught exception:", error)
  })

  process.on("unhandledRejection", (reason, promise) => {
    console.error("[App] Unhandled rejection at:", promise, "reason:", reason)
  })
}
