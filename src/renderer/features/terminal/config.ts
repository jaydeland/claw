import type { ITerminalOptions, ITheme } from "xterm"
import { extractTerminalTheme } from "@/lib/themes/terminal-theme-mapper"

// Nerd Fonts first for shell theme compatibility (Oh My Posh, Powerlevel10k, etc.)
// Geist Mono added for consistency with app font
const TERMINAL_FONT_FAMILY = [
  "Geist Mono",
  "MesloLGM Nerd Font",
  "MesloLGM NF",
  "MesloLGS NF",
  "MesloLGS Nerd Font",
  "Hack Nerd Font",
  "FiraCode Nerd Font",
  "JetBrainsMono Nerd Font",
  "CaskaydiaCove Nerd Font",
  "Menlo",
  "Monaco",
  '"Courier New"',
  "monospace",
].join(", ")

/**
 * Dark terminal theme synchronized with Claw Dark theme.
 * Vibrant colors with high contrast for better visibility.
 */
export const TERMINAL_THEME_DARK: ITheme = {
  background: "#0a0a0a",
  foreground: "#f8fafc",

  cursor: "#f8fafc",
  cursorAccent: "#0a0a0a",

  selectionBackground: "#3b82f655",
  selectionForeground: "#ffffff",

  // ANSI colors - vibrant and high contrast
  black: "#1e293b",
  red: "#f87171",
  green: "#4ade80",
  yellow: "#fbbf24",
  blue: "#60a5fa",
  magenta: "#c084fc",
  cyan: "#22d3ee",
  white: "#f8fafc",

  // Bright variants
  brightBlack: "#64748b",
  brightRed: "#fca5a5",
  brightGreen: "#86efac",
  brightYellow: "#fde047",
  brightBlue: "#93c5fd",
  brightMagenta: "#d8b4fe",
  brightCyan: "#67e8f9",
  brightWhite: "#ffffff",
}

/**
 * Light terminal theme synchronized with Claw Light theme.
 * Vibrant colors with high contrast for better visibility.
 */
export const TERMINAL_THEME_LIGHT: ITheme = {
  background: "#f8fafc",
  foreground: "#0f172a",

  cursor: "#0f172a",
  cursorAccent: "#f8fafc",

  selectionBackground: "#2563eb33",
  selectionForeground: "#0f172a",

  // ANSI colors - vibrant and high contrast
  black: "#1e293b",
  red: "#dc2626",
  green: "#16a34a",
  yellow: "#ca8a04",
  blue: "#2563eb",
  magenta: "#9333ea",
  cyan: "#0d9488",
  white: "#f1f5f9",

  // Bright variants
  brightBlack: "#475569",
  brightRed: "#ef4444",
  brightGreen: "#22c55e",
  brightYellow: "#f59e0b",
  brightBlue: "#3b82f6",
  brightMagenta: "#a855f7",
  brightCyan: "#14b8a6",
  brightWhite: "#ffffff",
}

/** @deprecated Use TERMINAL_THEME_DARK instead */
export const TERMINAL_THEME = TERMINAL_THEME_DARK

/**
 * Get terminal theme based on current app theme
 */
export function getTerminalTheme(isDark: boolean): ITheme {
  return isDark ? TERMINAL_THEME_DARK : TERMINAL_THEME_LIGHT
}

/**
 * Get terminal theme from VS Code theme colors
 * Falls back to default themes if colors are not provided
 */
export function getTerminalThemeFromVSCode(
  themeColors: Record<string, string> | null | undefined,
  isDark: boolean,
): ITheme {
  if (!themeColors) {
    return getTerminalTheme(isDark)
  }
  return extractTerminalTheme(themeColors)
}

export const TERMINAL_OPTIONS: ITerminalOptions = {
  cursorBlink: true,
  // Font size matches app's compact UI (text-xs = 12px, text-sm = 14px)
  fontSize: 13,
  lineHeight: 1.4,
  fontFamily: TERMINAL_FONT_FAMILY,
  theme: TERMINAL_THEME_DARK, // Default, will be overridden dynamically
  allowProposedApi: true,
  scrollback: 10000,
  macOptionIsMeta: true,
  cursorStyle: "block",
  cursorInactiveStyle: "outline",
  fastScrollModifier: "alt",
  fastScrollSensitivity: 5,
  // Better letter spacing for code readability
  letterSpacing: 0,
}

export const RESIZE_DEBOUNCE_MS = 150
