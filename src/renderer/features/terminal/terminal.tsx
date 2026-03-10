import { useEffect, useRef, useState, useCallback, useMemo } from "react"
import type { Terminal as XTerm } from "xterm"
import type { FitAddon } from "@xterm/addon-fit"
import type { SearchAddon } from "@xterm/addon-search"
import type { SerializeAddon } from "@xterm/addon-serialize"
import { useTheme } from "next-themes"
import { useSetAtom, useAtomValue } from "jotai"
import { trpc } from "@/lib/trpc"
import { terminalCwdAtom, terminalWordWrapAtom, terminalSearchAddonAtom } from "./atoms"
import { fullThemeDataAtom } from "@/lib/atoms"
import {
  createTerminalInstance,
  getDefaultTerminalBg,
  setupClickToMoveCursor,
  setupFocusListener,
  setupKeyboardHandler,
  setupPasteHandler,
  setupResizeHandlers,
} from "./helpers"
import { getTerminalTheme, getTerminalThemeFromVSCode } from "./config"
import { parseCwd } from "./parseCwd"
import { sanitizeForTitle } from "./commandBuffer"
import { shellEscapePaths } from "./utils"
import { TerminalSearch } from "./TerminalSearch"
import type { TerminalProps, TerminalStreamEvent } from "./types"
import "xterm/css/xterm.css"

export function Terminal({
  paneId,
  cwd,
  workspaceId,
  tabId,
  initialCommands,
  initialCwd,
}: TerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const xtermRef = useRef<XTerm | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const searchAddonRef = useRef<SearchAddon | null>(null)
  const serializeAddonRef = useRef<SerializeAddon | null>(null)
  const isExitedRef = useRef(false)
  const commandBufferRef = useRef("")

  const [isSearchOpen, setIsSearchOpen] = useState(false)
  const [terminalCwd, setTerminalCwd] = useState<string | null>(
    initialCwd || cwd || null,
  )
  const [initRetry, setInitRetry] = useState(0)
  const setGlobalCwds = useSetAtom(terminalCwdAtom)
  const setSearchAddons = useSetAtom(terminalSearchAddonAtom)

  // Word wrap setting (global)
  const wordWrap = useAtomValue(terminalWordWrapAtom)

  // Theme detection
  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme === "dark"
  
  // VS Code theme data (if a full theme is selected)
  const fullThemeData = useAtomValue(fullThemeDataAtom)

  // Ref for terminalCwd to avoid effect re-runs when cwd changes
  const terminalCwdRef = useRef(terminalCwd)
  terminalCwdRef.current = terminalCwd

  // Ref for paneId to use in callbacks
  const paneIdRef = useRef(paneId)
  paneIdRef.current = paneId

  // Ref for wordWrap to use in resize handlers (avoids effect re-runs)
  const wordWrapRef = useRef(wordWrap)
  wordWrapRef.current = wordWrap

  // Mutations
  const createOrAttachMutation = trpc.terminal.createOrAttach.useMutation()
  const writeMutation = trpc.terminal.write.useMutation()
  const resizeMutation = trpc.terminal.resize.useMutation()
  const detachMutation = trpc.terminal.detach.useMutation()
  const clearScrollbackMutation = trpc.terminal.clearScrollback.useMutation()

  // Refs for mutations to avoid effect re-runs
  const createOrAttachRef = useRef(createOrAttachMutation.mutate)
  const writeRef = useRef(writeMutation.mutate)
  const resizeRef = useRef(resizeMutation.mutate)
  const detachRef = useRef(detachMutation.mutate)
  const clearScrollbackRef = useRef(clearScrollbackMutation.mutate)
  createOrAttachRef.current = createOrAttachMutation.mutate
  writeRef.current = writeMutation.mutate
  resizeRef.current = resizeMutation.mutate
  detachRef.current = detachMutation.mutate
  clearScrollbackRef.current = clearScrollbackMutation.mutate

  // Parse terminal data for cwd (OSC 7 sequences)
  const updateCwdFromData = useCallback(
    (data: string) => {
      const parsedCwd = parseCwd(data)
      if (parsedCwd !== null) {
        console.log("[Terminal] Parsed cwd from OSC-7:", parsedCwd)
        setTerminalCwd(parsedCwd)
        // Also update global atom for the tabs to show
        setGlobalCwds((prev) => ({
          ...prev,
          [paneIdRef.current]: parsedCwd,
        }))
      }
    },
    [setGlobalCwds],
  )

  const updateCwdRef = useRef(updateCwdFromData)
  updateCwdRef.current = updateCwdFromData

  // Handle stream data
  const handleStreamData = useCallback((event: TerminalStreamEvent) => {
    if (!xtermRef.current) return

    if (event.type === "data" && event.data) {
      xtermRef.current.write(event.data)
      updateCwdRef.current(event.data)
    } else if (event.type === "exit") {
      isExitedRef.current = true
      xtermRef.current.writeln(
        `\r\n\r\n[Process exited with code ${event.exitCode}]`,
      )
      xtermRef.current.writeln("[Press any key to restart]")
    }
  }, [])

  // Subscribe to terminal output
  trpc.terminal.stream.useSubscription(paneId, {
    onData: handleStreamData,
    onError: (err) => {
      console.error("[Terminal] Stream error:", err)
      xtermRef.current?.write(
        `\r\n\x1b[31m[Connection error: ${err.message}]\x1b[0m\r\n`,
      )
    },
    enabled: true,
  })

  // Track visibility using IntersectionObserver
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsVisible(entry.isIntersecting)
      },
      { threshold: 0 }
    )

    observer.observe(container)
    return () => observer.disconnect()
  }, [])

  // Initialize terminal
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    // Skip initialization if container is not visible
    if (!isVisible) {
      console.log("[Terminal:useEffect] Container not visible, skipping initialization")
      return
    }

    console.log("[Terminal:useEffect] MOUNT - paneId:", paneId)

    const rect = container.getBoundingClientRect()
    console.log("[Terminal:useEffect] Container rect:", rect)

    // Wait for container to have dimensions before creating terminal
    // This prevents initialization issues when container isn't fully laid out yet
    if (rect.width === 0 || rect.height === 0) {
      if (initRetry < 3) {
        console.warn("[Terminal:useEffect] Container has no dimensions, retrying (attempt", initRetry + 1, ")")

        // Use RAF to wait for layout to complete, then trigger retry
        const rafId = requestAnimationFrame(() => {
          setInitRetry(prev => prev + 1)
        })

        return () => cancelAnimationFrame(rafId)
      } else {
        console.error("[Terminal:useEffect] Container still has no dimensions after 3 retries")
        return
      }
    }

    let isUnmounted = false

    // Create xterm instance
    console.log("[Terminal:useEffect] Creating terminal instance...", {
      isDark,
    })
    const { xterm, fitAddon, serializeAddon, cleanup } = createTerminalInstance(
      container,
      {
        cwd: terminalCwdRef.current || cwd,
        isDark,
        onFileLinkClick: (path, line, column) => {
          console.log("[Terminal] File link clicked:", path, line, column)
          // TODO: Open file in editor
        },
        onUrlClick: (url) => {
          console.log("[Terminal] URL clicked:", url)
          window.desktopApi.openExternal(url)
        },
      },
    )

    xtermRef.current = xterm
    fitAddonRef.current = fitAddon
    serializeAddonRef.current = serializeAddon
    isExitedRef.current = false

    // Lazy load search addon and register in global atom
    import("@xterm/addon-search").then(({ SearchAddon }) => {
      if (isUnmounted || !xtermRef.current) return
      const searchAddon = new SearchAddon()
      xtermRef.current.loadAddon(searchAddon)
      searchAddonRef.current = searchAddon
      // Register in global atom for tab bar access
      setSearchAddons((prev) => ({ ...prev, [paneId]: searchAddon }))
    })

    // Apply serialized state from server
    const applySerializedState = (serializedState: string) => {
      if (serializedState) {
        xterm.write(serializedState)
      }
    }

    // Restart terminal after exit
    const restartTerminal = () => {
      isExitedRef.current = false
      xterm.clear()
      createOrAttachRef.current(
        {
          paneId,
          tabId,
          workspaceId,
          cols: xterm.cols,
          rows: xterm.rows,
          cwd: terminalCwdRef.current || cwd,
        },
        {
          onSuccess: (result) => {
            applySerializedState(result.serializedState)
          },
        },
      )
    }

    // Input handler
    const handleTerminalInput = (data: string) => {
      if (isExitedRef.current) {
        restartTerminal()
        return
      }
      writeRef.current({ paneId, data })
    }

    // Key handler for command buffer (tab title)
    const handleKeyPress = (event: {
      key: string
      domEvent: KeyboardEvent
    }) => {
      const { domEvent } = event
      if (domEvent.key === "Enter") {
        const title = sanitizeForTitle(commandBufferRef.current)
        if (title) {
          // TODO: Set tab title
        }
        commandBufferRef.current = ""
      } else if (domEvent.key === "Backspace") {
        commandBufferRef.current = commandBufferRef.current.slice(0, -1)
      } else if (domEvent.key === "c" && domEvent.ctrlKey) {
        commandBufferRef.current = ""
      } else if (
        domEvent.key.length === 1 &&
        !domEvent.ctrlKey &&
        !domEvent.metaKey
      ) {
        commandBufferRef.current += domEvent.key
      }
    }

    // Create or attach to session
    createOrAttachRef.current(
      {
        paneId,
        tabId,
        workspaceId,
        cols: xterm.cols,
        rows: xterm.rows,
        cwd: initialCwd || cwd,
        initialCommands,
      },
      {
        onSuccess: (result) => {
          applySerializedState(result.serializedState)
          xterm.focus()
        },
        onError: (err) => {
          xterm.write(
            `\x1b[31m[Failed to start terminal: ${err.message}]\x1b[0m\r\n`,
          )
        },
      },
    )

    // Set up handlers
    const inputDisposable = xterm.onData(handleTerminalInput)
    const keyDisposable = xterm.onKey(handleKeyPress)

    const handleClear = () => {
      xterm.clear()
      clearScrollbackRef.current({ paneId })
    }

    const handleWrite = (data: string) => {
      if (!isExitedRef.current) {
        writeRef.current({ paneId, data })
      }
    }

    const cleanupKeyboard = setupKeyboardHandler(xterm, {
      onShiftEnter: () => handleWrite("\x1b\r"), // ESC + CR for line continuation
      onClear: handleClear,
    })

    const cleanupClickToMove = setupClickToMoveCursor(xterm, {
      onWrite: handleWrite,
    })

    const cleanupFocus = setupFocusListener(xterm, () => {
      // TODO: Set focused pane
    })

    const cleanupResize = setupResizeHandlers(
      container,
      xterm,
      fitAddon,
      (cols, rows) => {
        resizeRef.current({ paneId, cols, rows })
      },
      {
        getWordWrap: () => wordWrapRef.current,
      },
    )

    const cleanupPaste = setupPasteHandler(xterm, {
      onPaste: (text) => {
        commandBufferRef.current += text
      },
    })

    // Cleanup on unmount
    return () => {
      console.log("[Terminal:useEffect] UNMOUNT - paneId:", paneId)
      isUnmounted = true
      inputDisposable.dispose()
      keyDisposable.dispose()
      cleanupKeyboard()
      cleanupClickToMove()
      cleanupFocus?.()
      cleanupResize()
      cleanupPaste()
      cleanup()

      // Serialize terminal state before detaching
      console.log("[Terminal:useEffect] Serializing state before detach...")
      const serializedState = serializeAddon.serialize()

      // Detach instead of kill - keeps session alive for reattach
      detachRef.current({ paneId, serializedState })

      // Remove SearchAddon from global atom
      setSearchAddons((prev) => {
        const { [paneId]: _, ...rest } = prev
        return rest
      })

      console.log("[Terminal:useEffect] Disposing xterm...")
      xterm.dispose()
      xtermRef.current = null
      fitAddonRef.current = null
      searchAddonRef.current = null
      serializeAddonRef.current = null
      console.log("[Terminal:useEffect] UNMOUNT complete")
    }
    // Note: terminalCwd is accessed via ref to avoid remounting on cwd changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paneId, cwd, workspaceId, tabId, initialCwd, initialCommands, isDark, initRetry, isVisible])

  // Update theme when isDark changes or VS Code theme changes (without recreating terminal)
  useEffect(() => {
    if (xtermRef.current) {
      const newTheme = getTerminalThemeFromVSCode(fullThemeData?.colors, isDark)
      xtermRef.current.options.theme = newTheme
    }
  }, [isDark, fullThemeData])

  // Update word wrap when setting changes
  // xterm.js doesn't have a wordWrap option - we control wrapping by adjusting columns:
  // - wordWrap=true: fit terminal to container width (normal behavior)
  // - wordWrap=false: set very large column count to allow horizontal scrolling
  useEffect(() => {
    if (!xtermRef.current || !fitAddonRef.current) return

    if (wordWrap) {
      // Wrap mode: fit terminal to container width
      try {
        fitAddonRef.current.fit()
      } catch {
        // Ignore resize errors when terminal is disposed
      }
    } else {
      // No wrap mode: set a large column count to enable horizontal scrolling
      // We still need the fit addon to calculate row height correctly
      try {
        const currentRows = xtermRef.current.rows
        // Use a very large column count (9999) so content doesn't wrap
        xtermRef.current.resize(9999, currentRows)
      } catch {
        // Ignore resize errors when terminal is disposed or not ready
      }
    }
  }, [wordWrap])

  // Keyboard shortcut for search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "f" && e.metaKey && !e.shiftKey) {
        e.preventDefault()
        setIsSearchOpen((prev) => !prev)
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [])

  // Drag and drop files
  const handleDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault()
    event.dataTransfer.dropEffect = "copy"
  }, [])

  const handleDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault()

      const files = Array.from(event.dataTransfer.files)
      if (files.length === 0) return

      // Get file paths (Electron exposes webUtils)
      const paths = files.map((file) => {
        // @ts-expect-error - Electron's webUtils API
        return window.webUtils?.getPathForFile?.(file) || file.name
      })
      const text = shellEscapePaths(paths)

      if (!isExitedRef.current) {
        writeRef.current({ paneId, data: text })
      }
    },
    [paneId],
  )

  const terminalBg = useMemo(() => {
    // Use VS Code theme terminal background if available
    if (fullThemeData?.colors?.["terminal.background"]) {
      return fullThemeData.colors["terminal.background"]
    }
    if (fullThemeData?.colors?.["editor.background"]) {
      return fullThemeData.colors["editor.background"]
    }
    return getDefaultTerminalBg(isDark)
  }, [isDark, fullThemeData])

  return (
    <div
      role="application"
      className={`relative h-full w-full ${wordWrap ? "overflow-hidden" : "overflow-x-auto overflow-y-hidden"}`}
      style={{ backgroundColor: terminalBg }}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <TerminalSearch
        searchAddon={searchAddonRef.current}
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
      />
      <div
        ref={containerRef}
        className="h-full"
        style={{
          padding: "8px",
          // When no wrap, allow container to expand horizontally
          width: wordWrap ? "100%" : "fit-content",
          minWidth: "100%",
        }}
      />
    </div>
  )
}
