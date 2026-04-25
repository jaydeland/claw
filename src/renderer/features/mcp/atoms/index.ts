import { atom } from "jotai"

// ============================================
// MCP SIDEBAR STATE
// ============================================

/**
 * Selected MCP category in sidebar
 * null = show chat view, "mcp" = show MCP servers view
 */
export const selectedMcpCategoryAtom = atom<"mcp" | null>(null)

// ============================================
// MCP SERVER SELECTION
// ============================================

/**
 * Currently selected MCP server ID for detail view
 * null = no server selected
 */
export const selectedMcpServerAtom = atom<string | null>(null)

// ============================================
// MCP AUTH MODAL STATE
// ============================================

/**
 * Controls the open/closed state of the MCP auth modal
 */
export const mcpAuthModalOpenAtom = atom<boolean>(false)

/**
 * The server ID for which the auth modal is open
 * null = no server (modal closed)
 */
export const mcpAuthModalServerIdAtom = atom<string | null>(null)

// ============================================
// MCP SEARCH STATE
// ============================================

/**
 * Search query for filtering MCP servers
 */
export const mcpServerSearchAtom = atom<string>("")

// ============================================
// MCP TOOL SELECTION STATE
// ============================================

/**
 * Currently selected MCP tool for schema viewing
 * Format: "serverId:toolName" or null
 */
export const selectedMcpToolAtom = atom<string | null>(null)

// ============================================
// MCP FILE DIALOG STATE
// ============================================

/**
 * Controls the open/closed state of the Add MCP File dialog
 */
export const mcpAddFileDialogOpenAtom = atom<boolean>(false)

// ============================================
// MCP SERVER DIALOG STATE
// ============================================

/**
 * Controls the open/closed state of the Add MCP Server dialog
 */
export const mcpAddServerDialogOpenAtom = atom<boolean>(false)

/**
 * The target config file path for adding a new server
 * null = no target file (dialog closed)
 */
export const mcpAddServerTargetFileAtom = atom<string | null>(null)
