/**
 * Built-in VS Code themes with full color definitions
 * 
 * These themes include both UI colors and are compatible with Shiki for syntax highlighting.
 * Each theme has been curated to work well with the app's design system.
 */

import type { VSCodeFullTheme } from "../atoms"
import { CURSOR_DARK, CURSOR_LIGHT, CURSOR_MIDNIGHT } from "./cursor-themes"

/**
 * Claw Dark - Default dark theme with vibrant accents and high contrast
 * Uses colorful accents: blue (#3b82f6), purple (#a855f7), cyan (#06b6d4)
 */
const CLAW_DARK: VSCodeFullTheme = {
  id: "claw-dark",
  name: "Claw Dark",
  type: "dark",
  source: "builtin",
  colors: {
    "editor.background": "#0a0a0a", // Deep black
    "editor.foreground": "#f8fafc", // High contrast white
    "foreground": "#f8fafc",
    "sideBar.background": "#1e293b", // Distinct slate sidebar
    "sideBar.foreground": "#f8fafc",
    "sideBar.border": "#334155", // Slate border for definition
    "activityBar.background": "#1e293b", // Match sidebar
    "activityBar.foreground": "#f8fafc",
    "activityBarBadge.background": "#a855f7", // Purple badge
    "activityBarBadge.foreground": "#ffffff",
    "panel.background": "#1e293b", // Match sidebar
    "panel.border": "#334155",
    "tab.activeBackground": "#0a0a0a",
    "tab.inactiveBackground": "#18181b",
    "tab.inactiveForeground": "#94a3b8", // Lighter inactive text
    "editorGroupHeader.tabsBackground": "#18181b",
    "dropdown.background": "#1e293b", // Slate dropdown
    "dropdown.foreground": "#f8fafc",
    "input.background": "#1e293b",
    "input.border": "#3b82f6", // Blue border
    "input.foreground": "#f8fafc",
    "focusBorder": "#3b82f6", // Blue focus
    "textLink.foreground": "#60a5fa", // Bright blue links
    "textLink.activeForeground": "#a78bfa", // Purple active
    "list.activeSelectionBackground": "#3b82f644",
    "list.hoverBackground": "#1e293b",
    "editor.selectionBackground": "#3b82f655",
    "editorLineNumber.foreground": "#64748b",
    "descriptionForeground": "#94a3b8",
    "errorForeground": "#f87171", // Bright red
    "badge.background": "#a855f7", // Purple badges
    "badge.foreground": "#ffffff",
    "button.background": "#3b82f6", // Blue primary button
    "button.foreground": "#ffffff",
    "button.secondaryBackground": "#475569",
    "button.secondaryForeground": "#f8fafc",
    // Terminal colors - vibrant and high contrast
    "terminal.background": "#0a0a0a",
    "terminal.foreground": "#f8fafc",
    "terminal.ansiBlack": "#1e293b",
    "terminal.ansiRed": "#f87171", // Bright red
    "terminal.ansiGreen": "#4ade80", // Bright green
    "terminal.ansiYellow": "#fbbf24", // Bright yellow
    "terminal.ansiBlue": "#60a5fa", // Bright blue
    "terminal.ansiMagenta": "#c084fc", // Bright purple
    "terminal.ansiCyan": "#22d3ee", // Bright cyan
    "terminal.ansiWhite": "#f8fafc",
    "terminal.ansiBrightBlack": "#64748b",
    "terminal.ansiBrightRed": "#fca5a5",
    "terminal.ansiBrightGreen": "#86efac",
    "terminal.ansiBrightYellow": "#fde047",
    "terminal.ansiBrightBlue": "#93c5fd",
    "terminal.ansiBrightMagenta": "#d8b4fe",
    "terminal.ansiBrightCyan": "#67e8f9",
    "terminal.ansiBrightWhite": "#ffffff",
  },
}

/**
 * Claw Light - Default light theme with vibrant accents and high contrast
 * Uses colorful accents: blue (#2563eb), purple (#9333ea), teal (#0d9488)
 */
const CLAW_LIGHT: VSCodeFullTheme = {
  id: "claw-light",
  name: "Claw Light",
  type: "light",
  source: "builtin",
  colors: {
    "editor.background": "#ffffff",
    "editor.foreground": "#0f172a", // High contrast dark slate
    "foreground": "#0f172a",
    "sideBar.background": "#f1f5f9", // Distinct light slate sidebar
    "sideBar.foreground": "#0f172a",
    "sideBar.border": "#cbd5e1", // Visible border
    "activityBar.background": "#f1f5f9", // Match sidebar
    "activityBar.foreground": "#0f172a",
    "activityBarBadge.background": "#9333ea", // Purple badge
    "activityBarBadge.foreground": "#ffffff",
    "panel.background": "#f1f5f9", // Match sidebar
    "panel.border": "#cbd5e1",
    "tab.activeBackground": "#ffffff",
    "tab.inactiveBackground": "#f1f5f9",
    "tab.inactiveForeground": "#64748b",
    "editorGroupHeader.tabsBackground": "#f1f5f9",
    "dropdown.background": "#ffffff",
    "dropdown.foreground": "#0f172a",
    "input.background": "#f1f5f9",
    "input.border": "#2563eb", // Blue border
    "input.foreground": "#0f172a",
    "focusBorder": "#2563eb", // Blue focus
    "textLink.foreground": "#2563eb", // Bright blue links
    "textLink.activeForeground": "#9333ea", // Purple active
    "list.activeSelectionBackground": "#2563eb22",
    "list.hoverBackground": "#f1f5f9",
    "editor.selectionBackground": "#2563eb33",
    "editorLineNumber.foreground": "#94a3b8",
    "descriptionForeground": "#64748b",
    "errorForeground": "#dc2626", // Bright red
    "badge.background": "#9333ea", // Purple badges
    "badge.foreground": "#ffffff",
    "button.background": "#2563eb", // Blue primary button
    "button.foreground": "#ffffff",
    "button.secondaryBackground": "#cbd5e1",
    "button.secondaryForeground": "#0f172a",
    // Terminal colors - vibrant and high contrast
    "terminal.background": "#f8fafc",
    "terminal.foreground": "#0f172a",
    "terminal.ansiBlack": "#1e293b",
    "terminal.ansiRed": "#dc2626", // Bright red
    "terminal.ansiGreen": "#16a34a", // Bright green
    "terminal.ansiYellow": "#ca8a04", // Bright yellow
    "terminal.ansiBlue": "#2563eb", // Bright blue
    "terminal.ansiMagenta": "#9333ea", // Bright purple
    "terminal.ansiCyan": "#0d9488", // Teal
    "terminal.ansiWhite": "#f1f5f9",
    "terminal.ansiBrightBlack": "#475569",
    "terminal.ansiBrightRed": "#ef4444",
    "terminal.ansiBrightGreen": "#22c55e",
    "terminal.ansiBrightYellow": "#f59e0b",
    "terminal.ansiBrightBlue": "#3b82f6",
    "terminal.ansiBrightMagenta": "#a855f7",
    "terminal.ansiBrightCyan": "#14b8a6",
    "terminal.ansiBrightWhite": "#ffffff",
  },
}


/**
 * Claude Light theme colors
 * Warm, beige tones with orange accent (Claude's signature color)
 */
const CLAUDE_LIGHT: VSCodeFullTheme = {
  id: "claude-light",
  name: "Claude Light",
  type: "light",
  source: "builtin",
  colors: {
    "editor.background": "#FAF9F5",
    "editorPane.background": "#FAF9F5",
    "editor.foreground": "#4a4538",
    "foreground": "#4a4538",
    "sideBar.background": "#FAF9F5",
    "sideBar.foreground": "#4a4538",
    "sideBar.border": "#e5e3de",
    "activityBar.background": "#FAF9F5",
    "activityBar.foreground": "#4a4538",
    "panel.background": "#FAF9F5",
    "panel.border": "#e5e3de",
    "tab.activeBackground": "#FAF9F5",
    "tab.inactiveBackground": "#f5f4f1",
    "tab.inactiveForeground": "#8b8578",
    "editorGroupHeader.tabsBackground": "#f5f4f1",
    "dropdown.background": "#ffffff",
    "dropdown.foreground": "#4a4538",
    "input.background": "#ffffff",
    "input.border": "#d5d3ce",
    "input.foreground": "#4a4538",
    "focusBorder": "#D97857",
    "textLink.foreground": "#D97857",
    "textLink.activeForeground": "#C4684A",
    "list.activeSelectionBackground": "#e8e5dd",
    "list.hoverBackground": "#f0ede7",
    "editor.selectionBackground": "#D9785733",
    "editorLineNumber.foreground": "#a5a193",
    "descriptionForeground": "#8b8578",
    "errorForeground": "#dc2626",
    "button.background": "#D97857",
    "button.foreground": "#ffffff",
    "button.secondaryBackground": "#e8e5dd",
    "button.secondaryForeground": "#4a4538",
    // Terminal colors
    "terminal.background": "#FAF9F5",
    "terminal.foreground": "#4a4538",
    "terminal.ansiBlack": "#4a4538",
    "terminal.ansiRed": "#dc2626",
    "terminal.ansiGreen": "#16a34a",
    "terminal.ansiYellow": "#D97857",
    "terminal.ansiBlue": "#2563eb",
    "terminal.ansiMagenta": "#9333ea",
    "terminal.ansiCyan": "#0891b2",
    "terminal.ansiWhite": "#e5e3de",
    "terminal.ansiBrightBlack": "#8b8578",
    "terminal.ansiBrightRed": "#ef4444",
    "terminal.ansiBrightGreen": "#22c55e",
    "terminal.ansiBrightYellow": "#f59e0b",
    "terminal.ansiBrightBlue": "#3b82f6",
    "terminal.ansiBrightMagenta": "#a855f7",
    "terminal.ansiBrightCyan": "#06b6d4",
    "terminal.ansiBrightWhite": "#FAF9F5",
  },
}

/**
 * Claude Dark theme colors
 * Warm dark tones with orange accent (Claude's signature color)
 */
const CLAUDE_DARK: VSCodeFullTheme = {
  id: "claude-dark",
  name: "Claude Dark",
  type: "dark",
  source: "builtin",
  colors: {
    "editor.background": "#262624",
    "editorPane.background": "#262624",
    "editor.foreground": "#c9c5bc",
    "foreground": "#c9c5bc",
    "sideBar.background": "#262624",
    "sideBar.foreground": "#c9c5bc",
    "sideBar.border": "#3a3937",
    "activityBar.background": "#262624",
    "activityBar.foreground": "#c9c5bc",
    "panel.background": "#262624",
    "panel.border": "#3d3a36",
    "tab.activeBackground": "#262624",
    "tab.inactiveBackground": "#262624",
    "tab.inactiveForeground": "#8a857c",
    "editorGroupHeader.tabsBackground": "#232120",
    "dropdown.background": "#383633",
    "dropdown.foreground": "#c9c5bc",
    "input.background": "#232120",
    "input.border": "#4a4742",
    "input.foreground": "#c9c5bc",
    "focusBorder": "#D97857",
    "textLink.foreground": "#D97857",
    "textLink.activeForeground": "#E8917A",
    "list.activeSelectionBackground": "#3d3a36",
    "list.hoverBackground": "#353230",
    "editor.selectionBackground": "#D9785744",
    "editorLineNumber.foreground": "#6b6660",
    "descriptionForeground": "#8a857c",
    "errorForeground": "#ef4444",
    "button.background": "#D97857",
    "button.foreground": "#ffffff",
    "button.secondaryBackground": "#3d3a36",
    "button.secondaryForeground": "#c9c5bc",
    // Terminal colors
    "terminal.background": "#262624",
    "terminal.foreground": "#c9c5bc",
    "terminal.ansiBlack": "#232120",
    "terminal.ansiRed": "#ef4444",
    "terminal.ansiGreen": "#22c55e",
    "terminal.ansiYellow": "#D97857",
    "terminal.ansiBlue": "#3b82f6",
    "terminal.ansiMagenta": "#a855f7",
    "terminal.ansiCyan": "#06b6d4",
    "terminal.ansiWhite": "#c9c5bc",
    "terminal.ansiBrightBlack": "#6b6660",
    "terminal.ansiBrightRed": "#f87171",
    "terminal.ansiBrightGreen": "#4ade80",
    "terminal.ansiBrightYellow": "#fbbf24",
    "terminal.ansiBrightBlue": "#60a5fa",
    "terminal.ansiBrightMagenta": "#c084fc",
    "terminal.ansiBrightCyan": "#22d3ee",
    "terminal.ansiBrightWhite": "#e5e3de",
  },
}

/**
 * Cobalt2 - Classic blue theme with yellow accents
 * By Wes Bos - https://github.com/wesbos/cobalt2-vscode
 */
const COBALT2: VSCodeFullTheme = {
  id: "cobalt2",
  name: "Cobalt2",
  type: "dark",
  source: "builtin",
  colors: {
    "editor.background": "#193549",
    "editor.foreground": "#ffffff",
    "foreground": "#ffffff",
    "sideBar.background": "#122738",
    "sideBar.foreground": "#ffffff",
    "sideBar.border": "#0d3a58",
    "activityBar.background": "#122738",
    "activityBar.foreground": "#ffffff",
    "activityBar.border": "#0d3a58",
    "activityBarBadge.background": "#ffc600",
    "activityBarBadge.foreground": "#000000",
    "panel.background": "#193549",
    "panel.border": "#0d3a58",
    "tab.activeBackground": "#193549",
    "tab.inactiveBackground": "#122738",
    "tab.inactiveForeground": "#aaaaaa",
    "editorGroupHeader.tabsBackground": "#122738",
    "dropdown.background": "#193549",
    "dropdown.foreground": "#ffffff",
    "input.background": "#0d3a58",
    "input.border": "#0088ff",
    "input.foreground": "#ffffff",
    "focusBorder": "#0088ff",
    "textLink.foreground": "#0088ff",
    "textLink.activeForeground": "#ff9d00",
    "list.activeSelectionBackground": "#0050a4",
    "list.hoverBackground": "#1f4662",
    "editor.selectionBackground": "#0050a4",
    "editor.lineHighlightBackground": "#1f4662",
    "editor.findMatchBackground": "#ff720066",
    "editor.findMatchHighlightBackground": "#cad40f66",
    "editorLineNumber.foreground": "#627e99",
    "descriptionForeground": "#aaaaaa",
    "errorForeground": "#ff5630",
    "badge.background": "#ffc600",
    "badge.foreground": "#000000",
    "button.background": "#0088ff",
    "button.foreground": "#ffffff",
    "button.secondaryBackground": "#0d3a58",
    "button.secondaryForeground": "#ffffff",
    // Terminal colors - Cobalt inspired
    "terminal.background": "#122738",
    "terminal.foreground": "#ffffff",
    "terminal.ansiBlack": "#000000",
    "terminal.ansiRed": "#ff0000",
    "terminal.ansiGreen": "#37dd21",
    "terminal.ansiYellow": "#fee409",
    "terminal.ansiBlue": "#1460d2",
    "terminal.ansiMagenta": "#ff005d",
    "terminal.ansiCyan": "#00bbbb",
    "terminal.ansiWhite": "#bbbbbb",
    "terminal.ansiBrightBlack": "#555555",
    "terminal.ansiBrightRed": "#f92672",
    "terminal.ansiBrightGreen": "#a6e22e",
    "terminal.ansiBrightYellow": "#ffc600",
    "terminal.ansiBrightBlue": "#58d1eb",
    "terminal.ansiBrightMagenta": "#9d65ff",
    "terminal.ansiBrightCyan": "#80fcff",
    "terminal.ansiBrightWhite": "#ffffff",
  },
}

/**
 * Dracula - Popular dark theme with purple/pink accents
 * By Zeno Rocha - https://draculatheme.com/
 */
const DRACULA: VSCodeFullTheme = {
  id: "dracula",
  name: "Dracula",
  type: "dark",
  source: "builtin",
  colors: {
    "editor.background": "#282a36",
    "editor.foreground": "#f8f8f2",
    "foreground": "#f8f8f2",
    "sideBar.background": "#21222c",
    "sideBar.foreground": "#f8f8f2",
    "sideBar.border": "#191a21",
    "activityBar.background": "#21222c",
    "activityBar.foreground": "#f8f8f2",
    "activityBarBadge.background": "#ff79c6",
    "activityBarBadge.foreground": "#282a36",
    "panel.background": "#21222c",
    "panel.border": "#191a21",
    "tab.activeBackground": "#282a36",
    "tab.inactiveBackground": "#21222c",
    "tab.inactiveForeground": "#6272a4",
    "editorGroupHeader.tabsBackground": "#21222c",
    "dropdown.background": "#282a36",
    "dropdown.foreground": "#f8f8f2",
    "input.background": "#282a36",
    "input.border": "#6272a4",
    "input.foreground": "#f8f8f2",
    "focusBorder": "#bd93f9",
    "textLink.foreground": "#8be9fd",
    "textLink.activeForeground": "#ff79c6",
    "list.activeSelectionBackground": "#44475a",
    "list.hoverBackground": "#343746",
    "editor.selectionBackground": "#44475a",
    "editor.lineHighlightBackground": "#44475a75",
    "editorLineNumber.foreground": "#6272a4",
    "descriptionForeground": "#6272a4",
    "errorForeground": "#ff5555",
    "badge.background": "#ff79c6",
    "badge.foreground": "#282a36",
    "button.background": "#bd93f9",
    "button.foreground": "#282a36",
    "button.secondaryBackground": "#44475a",
    "button.secondaryForeground": "#f8f8f2",
    // Terminal colors - Dracula palette
    "terminal.background": "#282a36",
    "terminal.foreground": "#f8f8f2",
    "terminal.ansiBlack": "#21222c",
    "terminal.ansiRed": "#ff5555",
    "terminal.ansiGreen": "#50fa7b",
    "terminal.ansiYellow": "#f1fa8c",
    "terminal.ansiBlue": "#bd93f9",
    "terminal.ansiMagenta": "#ff79c6",
    "terminal.ansiCyan": "#8be9fd",
    "terminal.ansiWhite": "#f8f8f2",
    "terminal.ansiBrightBlack": "#6272a4",
    "terminal.ansiBrightRed": "#ff6e6e",
    "terminal.ansiBrightGreen": "#69ff94",
    "terminal.ansiBrightYellow": "#ffffa5",
    "terminal.ansiBrightBlue": "#d6acff",
    "terminal.ansiBrightMagenta": "#ff92df",
    "terminal.ansiBrightCyan": "#a4ffff",
    "terminal.ansiBrightWhite": "#ffffff",
  },
}

/**
 * Kiwi - A vibrant dark theme with green/yellow accents
 * Inspired by fresh, energetic green colors on dark backgrounds
 */
const KIWI: VSCodeFullTheme = {
  id: "kiwi",
  name: "Kiwi",
  type: "dark",
  source: "builtin",
  colors: {
    "editor.background": "#1a1a1a",
    "editor.foreground": "#fafafa",
    "foreground": "#fafafa",
    "sideBar.background": "#252525",
    "sideBar.foreground": "#fafafa",
    "sideBar.border": "#333333",
    "activityBar.background": "#252525",
    "activityBar.foreground": "#fafafa",
    "activityBarBadge.background": "#a3e635",
    "activityBarBadge.foreground": "#1a1a1a",
    "panel.background": "#252525",
    "panel.border": "#333333",
    "tab.activeBackground": "#1a1a1a",
    "tab.inactiveBackground": "#252525",
    "tab.inactiveForeground": "#a3a3a3",
    "editorGroupHeader.tabsBackground": "#252525",
    "dropdown.background": "#252525",
    "dropdown.foreground": "#fafafa",
    "input.background": "#333333",
    "input.border": "#a3e635",
    "input.foreground": "#fafafa",
    "focusBorder": "#a3e635",
    "textLink.foreground": "#a3e635",
    "textLink.activeForeground": "#fde047",
    "list.activeSelectionBackground": "#a3e63533",
    "list.hoverBackground": "#333333",
    "editor.selectionBackground": "#a3e63533",
    "editorLineNumber.foreground": "#737373",
    "descriptionForeground": "#a3a3a3",
    "errorForeground": "#f87171",
    "badge.background": "#a3e635",
    "badge.foreground": "#1a1a1a",
    "button.background": "#a3e635",
    "button.foreground": "#1a1a1a",
    "button.secondaryBackground": "#404040",
    "button.secondaryForeground": "#fafafa",
    // Terminal colors
    "terminal.background": "#1a1a1a",
    "terminal.foreground": "#fafafa",
    "terminal.ansiBlack": "#252525",
    "terminal.ansiRed": "#f87171",
    "terminal.ansiGreen": "#a3e635",
    "terminal.ansiYellow": "#fde047",
    "terminal.ansiBlue": "#60a5fa",
    "terminal.ansiMagenta": "#c084fc",
    "terminal.ansiCyan": "#22d3ee",
    "terminal.ansiWhite": "#e5e5e5",
    "terminal.ansiBrightBlack": "#525252",
    "terminal.ansiBrightRed": "#fca5a5",
    "terminal.ansiBrightGreen": "#bef264",
    "terminal.ansiBrightYellow": "#fef08a",
    "terminal.ansiBrightBlue": "#93c5fd",
    "terminal.ansiBrightMagenta": "#d8b4fe",
    "terminal.ansiBrightCyan": "#67e8f9",
    "terminal.ansiBrightWhite": "#ffffff",
  },
}

/**
 * Macchiato - Catppuccin Macchiato theme
 * Warm dark theme with soft pastels
 * https://github.com/catppuccin/catppuccin
 */
const MACCHIATO: VSCodeFullTheme = {
  id: "macchiato",
  name: "Macchiato",
  type: "dark",
  source: "builtin",
  colors: {
    "editor.background": "#24273a",
    "editor.foreground": "#cad3f5",
    "foreground": "#cad3f5",
    "sideBar.background": "#1e2030",
    "sideBar.foreground": "#cad3f5",
    "sideBar.border": "#363a4f",
    "activityBar.background": "#1e2030",
    "activityBar.foreground": "#cad3f5",
    "activityBarBadge.background": "#b7bdf8",
    "activityBarBadge.foreground": "#24273a",
    "panel.background": "#1e2030",
    "panel.border": "#363a4f",
    "tab.activeBackground": "#24273a",
    "tab.inactiveBackground": "#1e2030",
    "tab.inactiveForeground": "#6e738d",
    "editorGroupHeader.tabsBackground": "#1e2030",
    "dropdown.background": "#363a4f",
    "dropdown.foreground": "#cad3f5",
    "input.background": "#363a4f",
    "input.border": "#6e738d",
    "input.foreground": "#cad3f5",
    "focusBorder": "#b7bdf8",
    "textLink.foreground": "#8aadf4",
    "textLink.activeForeground": "#b7bdf8",
    "list.activeSelectionBackground": "#363a4f",
    "list.hoverBackground": "#363a4f99",
    "editor.selectionBackground": "#5b607844",
    "editorLineNumber.foreground": "#6e738d",
    "descriptionForeground": "#6e738d",
    "errorForeground": "#ed8796",
    "badge.background": "#b7bdf8",
    "badge.foreground": "#24273a",
    "button.background": "#8aadf4",
    "button.foreground": "#24273a",
    "button.secondaryBackground": "#363a4f",
    "button.secondaryForeground": "#cad3f5",
    // Terminal colors - Catppuccin Macchiato palette
    "terminal.background": "#24273a",
    "terminal.foreground": "#cad3f5",
    "terminal.ansiBlack": "#494d64",
    "terminal.ansiRed": "#ed8796",
    "terminal.ansiGreen": "#a6da95",
    "terminal.ansiYellow": "#eed49f",
    "terminal.ansiBlue": "#8aadf4",
    "terminal.ansiMagenta": "#c6a0f6",
    "terminal.ansiCyan": "#8bd5ca",
    "terminal.ansiWhite": "#b8c0e0",
    "terminal.ansiBrightBlack": "#5b6078",
    "terminal.ansiBrightRed": "#ec7486",
    "terminal.ansiBrightGreen": "#8ccf7f",
    "terminal.ansiBrightYellow": "#f0d5a6",
    "terminal.ansiBrightBlue": "#78a1f6",
    "terminal.ansiBrightMagenta": "#b680f6",
    "terminal.ansiBrightCyan": "#6ec6c4",
    "terminal.ansiBrightWhite": "#a5adcb",
  },
}

/**
 * Tokyo Night - Dark blue/purple theme
 * Inspired by the vibrant lights of Tokyo at night
 * https://github.com/enkia/tokyo-night-vscode-theme
 */
const TOKYO_NIGHT: VSCodeFullTheme = {
  id: "tokyo-night",
  name: "Tokyo Night",
  type: "dark",
  source: "builtin",
  colors: {
    "editor.background": "#1a1b26",
    "editor.foreground": "#a9b1d6",
    "foreground": "#a9b1d6",
    "sideBar.background": "#16161e",
    "sideBar.foreground": "#a9b1d6",
    "sideBar.border": "#24283b",
    "activityBar.background": "#16161e",
    "activityBar.foreground": "#a9b1d6",
    "activityBarBadge.background": "#bb9af7",
    "activityBarBadge.foreground": "#1a1b26",
    "panel.background": "#16161e",
    "panel.border": "#24283b",
    "tab.activeBackground": "#1a1b26",
    "tab.inactiveBackground": "#16161e",
    "tab.inactiveForeground": "#565f89",
    "editorGroupHeader.tabsBackground": "#16161e",
    "dropdown.background": "#24283b",
    "dropdown.foreground": "#a9b1d6",
    "input.background": "#24283b",
    "input.border": "#565f89",
    "input.foreground": "#a9b1d6",
    "focusBorder": "#7aa2f7",
    "textLink.foreground": "#7aa2f7",
    "textLink.activeForeground": "#bb9af7",
    "list.activeSelectionBackground": "#283457",
    "list.hoverBackground": "#24283b",
    "editor.selectionBackground": "#283457",
    "editorLineNumber.foreground": "#565f89",
    "descriptionForeground": "#565f89",
    "errorForeground": "#f7768e",
    "badge.background": "#bb9af7",
    "badge.foreground": "#1a1b26",
    "button.background": "#7aa2f7",
    "button.foreground": "#1a1b26",
    "button.secondaryBackground": "#414868",
    "button.secondaryForeground": "#a9b1d6",
    // Terminal colors - Tokyo Night palette
    "terminal.background": "#1a1b26",
    "terminal.foreground": "#a9b1d6",
    "terminal.ansiBlack": "#414868",
    "terminal.ansiRed": "#f7768e",
    "terminal.ansiGreen": "#9ece6a",
    "terminal.ansiYellow": "#e0af68",
    "terminal.ansiBlue": "#7aa2f7",
    "terminal.ansiMagenta": "#bb9af7",
    "terminal.ansiCyan": "#7dcfff",
    "terminal.ansiWhite": "#c0caf5",
    "terminal.ansiBrightBlack": "#565f89",
    "terminal.ansiBrightRed": "#ff7a93",
    "terminal.ansiBrightGreen": "#b9f27c",
    "terminal.ansiBrightYellow": "#ff9e64",
    "terminal.ansiBrightBlue": "#7da6ff",
    "terminal.ansiBrightMagenta": "#d0a9f5",
    "terminal.ansiBrightCyan": "#a9b1d6",
    "terminal.ansiBrightWhite": "#c0caf5",
  },
}

/**
 * Noctis - Dark theme with blue/cyan accents
 * https://github.com/liviuschera/noctis
 */
const NOCTIS: VSCodeFullTheme = {
  id: "noctis",
  name: "Noctis",
  type: "dark",
  source: "builtin",
  colors: {
    "editor.background": "#1e293b",
    "editor.foreground": "#cbd5e1",
    "foreground": "#cbd5e1",
    "sideBar.background": "#0f172a",
    "sideBar.foreground": "#cbd5e1",
    "sideBar.border": "#334155",
    "activityBar.background": "#0f172a",
    "activityBar.foreground": "#cbd5e1",
    "activityBarBadge.background": "#00d9ff",
    "activityBarBadge.foreground": "#0f172a",
    "panel.background": "#0f172a",
    "panel.border": "#334155",
    "tab.activeBackground": "#1e293b",
    "tab.inactiveBackground": "#0f172a",
    "tab.inactiveForeground": "#64748b",
    "editorGroupHeader.tabsBackground": "#0f172a",
    "dropdown.background": "#334155",
    "dropdown.foreground": "#cbd5e1",
    "input.background": "#334155",
    "input.border": "#475569",
    "input.foreground": "#cbd5e1",
    "focusBorder": "#00d9ff",
    "textLink.foreground": "#38bdf8",
    "textLink.activeForeground": "#00d9ff",
    "list.activeSelectionBackground": "#334155",
    "list.hoverBackground": "#33415599",
    "editor.selectionBackground": "#38bdf833",
    "editorLineNumber.foreground": "#64748b",
    "descriptionForeground": "#94a3b8",
    "errorForeground": "#f87171",
    "badge.background": "#00d9ff",
    "badge.foreground": "#0f172a",
    "button.background": "#00d9ff",
    "button.foreground": "#0f172a",
    "button.secondaryBackground": "#334155",
    "button.secondaryForeground": "#cbd5e1",
    // Terminal colors - Noctis palette
    "terminal.background": "#1e293b",
    "terminal.foreground": "#cbd5e1",
    "terminal.ansiBlack": "#334155",
    "terminal.ansiRed": "#f87171",
    "terminal.ansiGreen": "#69db7c",
    "terminal.ansiYellow": "#ffd43b",
    "terminal.ansiBlue": "#5c7cfa",
    "terminal.ansiMagenta": "#da77f2",
    "terminal.ansiCyan": "#00d9ff",
    "terminal.ansiWhite": "#e2e8f0",
    "terminal.ansiBrightBlack": "#475569",
    "terminal.ansiBrightRed": "#fca5a5",
    "terminal.ansiBrightGreen": "#86efac",
    "terminal.ansiBrightYellow": "#fde047",
    "terminal.ansiBrightBlue": "#818cf8",
    "terminal.ansiBrightMagenta": "#e879f9",
    "terminal.ansiBrightCyan": "#67e8f9",
    "terminal.ansiBrightWhite": "#f8fafc",
  },
}

/**
 * Shades of Purple - Bold dark theme with vibrant purple accents
 * By Ahmad Awais - https://github.com/ahmadawais/shades-of-purple-vscode
 */
const SHADES_OF_PURPLE: VSCodeFullTheme = {
  id: "shades-of-purple",
  name: "Shades of Purple",
  type: "dark",
  source: "builtin",
  colors: {
    "editor.background": "#2d2b55",
    "editor.foreground": "#ffffff",
    "foreground": "#ffffff",
    "sideBar.background": "#252340",
    "sideBar.foreground": "#ffffff",
    "sideBar.border": "#1e1b41",
    "activityBar.background": "#252340",
    "activityBar.foreground": "#ffffff",
    "activityBarBadge.background": "#b362ff",
    "activityBarBadge.foreground": "#ffffff",
    "panel.background": "#252340",
    "panel.border": "#1e1b41",
    "tab.activeBackground": "#2d2b55",
    "tab.inactiveBackground": "#252340",
    "tab.inactiveForeground": "#a599e9",
    "editorGroupHeader.tabsBackground": "#252340",
    "dropdown.background": "#2d2b55",
    "dropdown.foreground": "#ffffff",
    "input.background": "#1e1b41",
    "input.border": "#b362ff",
    "input.foreground": "#ffffff",
    "focusBorder": "#b362ff",
    "textLink.foreground": "#b362ff",
    "textLink.activeForeground": "#ff00ff",
    "list.activeSelectionBackground": "#1e1b41",
    "list.hoverBackground": "#383569",
    "editor.selectionBackground": "#b362ff44",
    "editorLineNumber.foreground": "#637599",
    "descriptionForeground": "#a599e9",
    "errorForeground": "#ff0000",
    "badge.background": "#b362ff",
    "badge.foreground": "#ffffff",
    "button.background": "#b362ff",
    "button.foreground": "#ffffff",
    "button.secondaryBackground": "#1e1b41",
    "button.secondaryForeground": "#ffffff",
    // Terminal colors - Shades of Purple palette
    "terminal.background": "#2d2b55",
    "terminal.foreground": "#ffffff",
    "terminal.ansiBlack": "#2d2b55",
    "terminal.ansiRed": "#d90429",
    "terminal.ansiGreen": "#3ad900",
    "terminal.ansiYellow": "#ffc600",
    "terminal.ansiBlue": "#6891f8",
    "terminal.ansiMagenta": "#ff00ff",
    "terminal.ansiCyan": "#80fcff",
    "terminal.ansiWhite": "#c7c7c7",
    "terminal.ansiBrightBlack": "#686868",
    "terminal.ansiBrightRed": "#f92a1c",
    "terminal.ansiBrightGreen": "#43d426",
    "terminal.ansiBrightYellow": "#f1d000",
    "terminal.ansiBrightBlue": "#6871ff",
    "terminal.ansiBrightMagenta": "#ff77ff",
    "terminal.ansiBrightCyan": "#79e0fa",
    "terminal.ansiBrightWhite": "#ffffff",
  },
}

/**
 * Bluloco Light - Clean light theme with blue accents
 * https://github.com/uloco/bluloco.nvim
 */
const BLULOCO_LIGHT: VSCodeFullTheme = {
  id: "bluloco-light",
  name: "Bluloco Light",
  type: "light",
  source: "builtin",
  colors: {
    "editor.background": "#f9f9f9",
    "editor.foreground": "#2a2d37",
    "foreground": "#2a2d37",
    "sideBar.background": "#f0f0f0",
    "sideBar.foreground": "#2a2d37",
    "sideBar.border": "#e0e0e0",
    "activityBar.background": "#f0f0f0",
    "activityBar.foreground": "#2a2d37",
    "activityBarBadge.background": "#0099e6",
    "activityBarBadge.foreground": "#ffffff",
    "panel.background": "#f0f0f0",
    "panel.border": "#e0e0e0",
    "tab.activeBackground": "#f9f9f9",
    "tab.inactiveBackground": "#f0f0f0",
    "tab.inactiveForeground": "#7f8c8d",
    "editorGroupHeader.tabsBackground": "#f0f0f0",
    "dropdown.background": "#ffffff",
    "dropdown.foreground": "#2a2d37",
    "input.background": "#ffffff",
    "input.border": "#0099e6",
    "input.foreground": "#2a2d37",
    "focusBorder": "#0099e6",
    "textLink.foreground": "#0099e6",
    "textLink.activeForeground": "#7a82da",
    "list.activeSelectionBackground": "#0099e622",
    "list.hoverBackground": "#e8e8e8",
    "editor.selectionBackground": "#0099e633",
    "editorLineNumber.foreground": "#b4b4b4",
    "descriptionForeground": "#7f8c8d",
    "errorForeground": "#de3d3b",
    "badge.background": "#0099e6",
    "badge.foreground": "#ffffff",
    "button.background": "#0099e6",
    "button.foreground": "#ffffff",
    "button.secondaryBackground": "#e0e0e0",
    "button.secondaryForeground": "#2a2d37",
    // Terminal colors - Bluloco Light palette
    "terminal.background": "#f9f9f9",
    "terminal.foreground": "#2a2d37",
    "terminal.ansiBlack": "#2a2d37",
    "terminal.ansiRed": "#de3d3b",
    "terminal.ansiGreen": "#3db451",
    "terminal.ansiYellow": "#ffcc00",
    "terminal.ansiBlue": "#0099e6",
    "terminal.ansiMagenta": "#d4acff",
    "terminal.ansiCyan": "#00c3cc",
    "terminal.ansiWhite": "#b4b4b4",
    "terminal.ansiBrightBlack": "#666666",
    "terminal.ansiBrightRed": "#ff5a52",
    "terminal.ansiBrightGreen": "#58d645",
    "terminal.ansiBrightYellow": "#ffcc00",
    "terminal.ansiBrightBlue": "#00b3ff",
    "terminal.ansiBrightMagenta": "#e5a5ff",
    "terminal.ansiBrightCyan": "#00d0d9",
    "terminal.ansiBrightWhite": "#ffffff",
  },
}

/**
 * All built-in themes
 */
export const BUILTIN_THEMES: VSCodeFullTheme[] = [
  // Claw Default themes (first)
  CLAW_DARK,
  CLAW_LIGHT,
  // Cursor themes
  CURSOR_DARK,
  CURSOR_LIGHT,
  CURSOR_MIDNIGHT,
  // Dark themes
  CLAUDE_DARK,
  COBALT2,
  DRACULA,
  KIWI,
  MACCHIATO,
  TOKYO_NIGHT,
  NOCTIS,
  SHADES_OF_PURPLE,
  // Light themes
  CLAUDE_LIGHT,
  BLULOCO_LIGHT,
]

/**
 * Get theme by ID
 */
export function getBuiltinThemeById(id: string): VSCodeFullTheme | undefined {
  return BUILTIN_THEMES.find((theme) => theme.id === id)
}

/**
 * Get themes by type
 */
export function getBuiltinThemesByType(type: "light" | "dark"): VSCodeFullTheme[] {
  return BUILTIN_THEMES.filter((theme) => theme.type === type)
}

/**
 * Default theme IDs for light/dark modes
 */
export const DEFAULT_LIGHT_THEME_ID = "21st-light"
export const DEFAULT_DARK_THEME_ID = "21st-dark"
