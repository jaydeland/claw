import { BrowserWindow, BrowserView, session, ipcMain } from "electron"

/**
 * Options for starting an OAuth flow
 */
export interface OAuthFlowOptions {
  /** The OAuth authorization URL to load */
  authUrl: string
  /** Regex pattern to match callback URL */
  callbackUrlPattern: string
  /** Server ID for session isolation */
  serverId: string
  /** Window title */
  title?: string
  /** Timeout in milliseconds (default: 5 minutes) */
  timeout?: number
}

/**
 * Result of an OAuth flow
 */
export interface OAuthFlowResult {
  /** True if authentication succeeded */
  success: boolean
  /** Authorization code (if success) */
  code?: string
  /** Full callback URL parameters (if success) */
  params?: Record<string, string>
  /** Error message (if failed) */
  error?: string
  /** Whether user cancelled */
  cancelled?: boolean
}

// Track active OAuth windows by server ID
const activeOAuthWindows = new Map<string, BrowserWindow>()

/**
 * Start an OAuth flow in a new window with embedded BrowserView
 * The window contains controls at the top and the OAuth page in a BrowserView
 */
export function startOAuthFlow(
  parentWindow: BrowserWindow | null,
  options: OAuthFlowOptions
): Promise<OAuthFlowResult> {
  return new Promise((resolve) => {
    const {
      authUrl,
      callbackUrlPattern,
      serverId,
      title = "Sign in",
      timeout = 5 * 60 * 1000, // 5 minutes
    } = options

    // Check if there's already an active OAuth window for this server
    const existingWindow = activeOAuthWindows.get(serverId)
    if (existingWindow && !existingWindow.isDestroyed()) {
      existingWindow.focus()
      resolve({ success: false, error: "OAuth window already open" })
      return
    }

    // Create a new window for OAuth
    const oauthWindow = new BrowserWindow({
      width: 600,
      height: 700,
      parent: parentWindow || undefined,
      modal: !!parentWindow,
      show: false,
      title,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
      },
    })

    activeOAuthWindows.set(serverId, oauthWindow)

    // Create isolated session for OAuth to prevent cookie leakage
    const oauthSession = session.fromPartition(`mcp-oauth-${serverId}`)

    // Create BrowserView for the OAuth content
    const view = new BrowserView({
      webPreferences: {
        session: oauthSession,
        nodeIntegration: false,
        contextIsolation: true,
      },
    })

    oauthWindow.setBrowserView(view)

    // Position the BrowserView to fill the window
    const updateViewBounds = () => {
      const bounds = oauthWindow.getContentBounds()
      view.setBounds({
        x: 0,
        y: 0,
        width: bounds.width,
        height: bounds.height,
      })
    }

    updateViewBounds()
    oauthWindow.on("resize", updateViewBounds)

    // Set up timeout
    const timeoutHandle = setTimeout(() => {
      cleanup()
      resolve({ success: false, error: "OAuth timeout - authentication took too long" })
    }, timeout)

    // Cleanup function
    const cleanup = () => {
      clearTimeout(timeoutHandle)
      activeOAuthWindows.delete(serverId)

      if (!oauthWindow.isDestroyed()) {
        oauthWindow.removeBrowserView(view)
        view.webContents.destroy()
        oauthWindow.close()
      }
    }

    // Handle window close (user cancelled)
    oauthWindow.on("closed", () => {
      clearTimeout(timeoutHandle)
      activeOAuthWindows.delete(serverId)
      resolve({ success: false, cancelled: true })
    })

    // Compile callback pattern
    const callbackRegex = new RegExp(callbackUrlPattern)

    // Intercept navigation to detect OAuth callback
    view.webContents.on("will-navigate", (event, url) => {
      if (callbackRegex.test(url)) {
        event.preventDefault()
        handleCallback(url)
      }
    })

    view.webContents.on("will-redirect", (event, url) => {
      if (callbackRegex.test(url)) {
        event.preventDefault()
        handleCallback(url)
      }
    })

    // Handle callback URL
    const handleCallback = (url: string) => {
      try {
        const urlObj = new URL(url)
        const code = urlObj.searchParams.get("code")
        const error = urlObj.searchParams.get("error")
        const errorDescription = urlObj.searchParams.get("error_description")

        // Extract all params
        const params: Record<string, string> = {}
        urlObj.searchParams.forEach((value, key) => {
          params[key] = value
        })

        cleanup()

        if (error) {
          resolve({
            success: false,
            error: errorDescription || error,
            params,
          })
        } else if (code) {
          resolve({
            success: true,
            code,
            params,
          })
        } else {
          resolve({
            success: false,
            error: "No authorization code received",
            params,
          })
        }
      } catch (err) {
        cleanup()
        resolve({
          success: false,
          error: `Failed to parse callback URL: ${err}`,
        })
      }
    }

    // Handle page load errors
    view.webContents.on("did-fail-load", (_event, errorCode, errorDescription) => {
      // Ignore cancelled loads (happens during redirects)
      if (errorCode === -3) return

      console.error(`[oauth-window] Page load failed: ${errorDescription} (${errorCode})`)
    })

    // Show window when BrowserView starts loading the OAuth page
    // Note: We use did-start-loading instead of ready-to-show because
    // the BrowserWindow itself doesn't load any content - only the BrowserView does.
    // ready-to-show fires based on the BrowserWindow's own webContents, which is empty.
    view.webContents.once("did-start-loading", () => {
      oauthWindow.show()
    })

    // Load the OAuth URL
    console.log(`[oauth-window] Loading OAuth URL for ${serverId}`)
    view.webContents.loadURL(authUrl).catch((err) => {
      console.error(`[oauth-window] Failed to load OAuth URL:`, err)
      cleanup()
      resolve({
        success: false,
        error: `Failed to load OAuth page: ${err.message}`,
      })
    })
  })
}

/**
 * Close any active OAuth window for a server
 */
export function closeOAuthWindow(serverId: string): void {
  const window = activeOAuthWindows.get(serverId)
  if (window && !window.isDestroyed()) {
    window.close()
  }
  activeOAuthWindows.delete(serverId)
}

/**
 * Check if an OAuth window is open for a server
 */
export function hasActiveOAuthWindow(serverId: string): boolean {
  const window = activeOAuthWindows.get(serverId)
  return window !== undefined && !window.isDestroyed()
}
