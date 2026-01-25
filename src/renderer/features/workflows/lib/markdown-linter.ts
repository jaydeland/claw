/**
 * Markdown Linter for Workflow Files
 *
 * Validates frontmatter schemas and markdown content for agents, commands, and skills.
 * Based on Claude Code official documentation:
 * - Skills: https://code.claude.com/docs/en/skills
 * - Agents: https://code.claude.com/docs/en/sub-agents
 * - Plugins: https://code.claude.com/docs/en/plugins-reference
 */

export interface LintDiagnostic {
  severity: "error" | "warning" | "info"
  message: string
  field?: string
  line?: number
  column?: number
  suggestion?: string
  /** Whether this issue can be auto-fixed */
  fixable?: boolean
  /** The fix to apply - returns the new content string */
  fix?: (content: string) => string
}

export interface LintResult {
  valid: boolean
  errors: LintDiagnostic[]
  warnings: LintDiagnostic[]
  info: LintDiagnostic[]
}

// Valid model values for Claude Code
const VALID_MODELS = ["sonnet", "opus", "haiku", "inherit"]

// Built-in Claude Code tools
const BUILTIN_TOOLS = [
  "Read",
  "Write",
  "Edit",
  "Grep",
  "Glob",
  "Bash",
  "Task",
  "WebSearch",
  "WebFetch",
  "Skill",
  "NotebookEdit",
  "NotebookRead",
  "TodoWrite",
  "AskUserQuestion",
  "EnterPlanMode",
  "ExitPlanMode",
  "LSP",
  "KillShell",
]

// Tool patterns that are valid (includes MCP tools)
const TOOL_PATTERNS = [
  /^mcp__[\w-]+__[\w-]+\*?$/, // MCP tools: mcp__server__tool or mcp__server__*
  /^Bash\([^)]+\)$/, // Bash with restrictions: Bash(aws:*), Bash(kubectl:*)
]

// Permission modes for subagents
const VALID_PERMISSION_MODES = ["default", "acceptEdits", "dontAsk", "bypassPermissions", "plan"]

// Context values for skills
const VALID_CONTEXT_VALUES = ["fork"]

/**
 * Escape special regex characters in a string
 */
function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

/**
 * Parse YAML frontmatter from markdown content
 */
function parseFrontmatter(content: string): { data: Record<string, any>; startLine: number; endLine: number } | null {
  const lines = content.split("\n")

  if (lines[0]?.trim() !== "---") {
    return null
  }

  let endIndex = -1
  for (let i = 1; i < lines.length; i++) {
    if (lines[i]?.trim() === "---") {
      endIndex = i
      break
    }
  }

  if (endIndex === -1) {
    return null
  }

  const frontmatterLines = lines.slice(1, endIndex)
  const data: Record<string, any> = {}

  for (let i = 0; i < frontmatterLines.length; i++) {
    const line = frontmatterLines[i]
    if (!line || line.trim() === "" || line.trim().startsWith("#")) continue

    // Simple YAML parsing for single-line values
    const colonIndex = line.indexOf(":")
    if (colonIndex === -1) continue

    const key = line.slice(0, colonIndex).trim()
    let value: any = line.slice(colonIndex + 1).trim()

    // Handle arrays (multi-line YAML arrays)
    if (value === "" || value === undefined) {
      // Check for array items on following lines
      const arrayItems: string[] = []
      let j = i + 1
      while (j < frontmatterLines.length) {
        const nextLine = frontmatterLines[j]
        if (nextLine?.trim().startsWith("-")) {
          arrayItems.push(nextLine.trim().slice(1).trim())
          j++
        } else if (nextLine?.trim() === "" || nextLine?.trim().startsWith("#")) {
          j++
        } else {
          break
        }
      }
      if (arrayItems.length > 0) {
        value = arrayItems
        i = j - 1
      }
    } else if (value.startsWith("[") && value.endsWith("]")) {
      // Inline array
      value = value
        .slice(1, -1)
        .split(",")
        .map((v: string) => v.trim().replace(/^["']|["']$/g, ""))
    } else if (value === "true") {
      value = true
    } else if (value === "false") {
      value = false
    } else if (value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1)
    } else if (value.startsWith("'") && value.endsWith("'")) {
      value = value.slice(1, -1)
    }

    data[key] = value
  }

  return { data, startLine: 1, endLine: endIndex + 1 }
}

/**
 * Check if a tool name is valid
 */
function isValidTool(tool: string): boolean {
  // Check built-in tools (case-insensitive)
  if (BUILTIN_TOOLS.some((t) => t.toLowerCase() === tool.toLowerCase())) {
    return true
  }

  // Check tool patterns
  for (const pattern of TOOL_PATTERNS) {
    if (pattern.test(tool)) {
      return true
    }
  }

  // Allow comma-separated tools in a single string (e.g., "Bash, Read, Grep")
  if (tool.includes(",")) {
    const tools = tool.split(",").map((t) => t.trim())
    return tools.every((t) => isValidTool(t))
  }

  // Allow wildcard at the end for MCP tools
  if (tool.endsWith("*") && tool.startsWith("mcp__")) {
    return true
  }

  return false
}

/**
 * Validate skill/command frontmatter
 * Based on: https://code.claude.com/docs/en/skills
 */
function validateSkillFrontmatter(data: Record<string, any>, _content: string): LintDiagnostic[] {
  const diagnostics: LintDiagnostic[] = []

  // Check name field if present
  if (data.name !== undefined) {
    if (typeof data.name !== "string") {
      diagnostics.push({
        severity: "error",
        field: "name",
        message: "'name' must be a string",
      })
    } else if (!/^[a-z][a-z0-9-]*$/.test(data.name)) {
      const suggestedName = data.name.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/^-+|-+$/g, "").replace(/-+/g, "-")
      diagnostics.push({
        severity: "warning",
        field: "name",
        message: "'name' should use lowercase letters, numbers, and hyphens only",
        suggestion: suggestedName,
        fixable: true,
        fix: (content: string) => {
          return content.replace(
            new RegExp(`(name:\\s*)${escapeRegExp(data.name)}`, "m"),
            `$1${suggestedName}`
          )
        },
      })
    } else if (data.name.length > 64) {
      diagnostics.push({
        severity: "error",
        field: "name",
        message: "'name' must be 64 characters or less",
      })
    }
  }

  // Check description (recommended)
  if (!data.description) {
    diagnostics.push({
      severity: "warning",
      field: "description",
      message: "'description' is recommended so Claude knows when to use the skill",
      suggestion: "Add a description field to the frontmatter",
      fixable: true,
      fix: (content: string) => {
        // Add description after name field, or at the start of frontmatter
        if (content.includes("name:")) {
          return content.replace(
            /(name:[^\n]*\n)/m,
            "$1description: TODO - Add a description for this skill\n"
          )
        } else {
          return content.replace(
            /^---\n/m,
            "---\ndescription: TODO - Add a description for this skill\n"
          )
        }
      },
    })
  } else if (typeof data.description !== "string") {
    diagnostics.push({
      severity: "error",
      field: "description",
      message: "'description' must be a string",
    })
  }

  // Check argument-hint
  if (data["argument-hint"] !== undefined && typeof data["argument-hint"] !== "string") {
    diagnostics.push({
      severity: "error",
      field: "argument-hint",
      message: "'argument-hint' must be a string",
    })
  }

  // Check disable-model-invocation
  if (data["disable-model-invocation"] !== undefined && typeof data["disable-model-invocation"] !== "boolean") {
    diagnostics.push({
      severity: "error",
      field: "disable-model-invocation",
      message: "'disable-model-invocation' must be a boolean (true/false)",
    })
  }

  // Check user-invocable
  if (data["user-invocable"] !== undefined && typeof data["user-invocable"] !== "boolean") {
    diagnostics.push({
      severity: "error",
      field: "user-invocable",
      message: "'user-invocable' must be a boolean (true/false)",
    })
  }

  // Check allowed-tools
  if (data["allowed-tools"] !== undefined) {
    const tools = Array.isArray(data["allowed-tools"])
      ? data["allowed-tools"]
      : typeof data["allowed-tools"] === "string"
        ? data["allowed-tools"].split(",").map((t: string) => t.trim())
        : null

    if (tools === null) {
      diagnostics.push({
        severity: "error",
        field: "allowed-tools",
        message: "'allowed-tools' must be an array or comma-separated string",
      })
    } else {
      for (const tool of tools) {
        if (!isValidTool(tool)) {
          diagnostics.push({
            severity: "warning",
            field: "allowed-tools",
            message: `Unknown tool '${tool}' - check spelling or ensure it's a valid MCP tool`,
          })
        }
      }
    }
  }

  // Check model
  if (data.model !== undefined) {
    if (typeof data.model !== "string") {
      diagnostics.push({
        severity: "error",
        field: "model",
        message: "'model' must be a string",
      })
    } else if (!VALID_MODELS.includes(data.model.toLowerCase())) {
      diagnostics.push({
        severity: "error",
        field: "model",
        message: `Invalid model '${data.model}'. Valid values: ${VALID_MODELS.join(", ")}`,
        suggestion: "sonnet",
        fixable: true,
        fix: (content: string) => {
          return content.replace(
            new RegExp(`(model:\\s*)${escapeRegExp(data.model)}`, "m"),
            "$1sonnet"
          )
        },
      })
    }
  }

  // Check context
  if (data.context !== undefined) {
    if (typeof data.context !== "string") {
      diagnostics.push({
        severity: "error",
        field: "context",
        message: "'context' must be a string",
      })
    } else if (!VALID_CONTEXT_VALUES.includes(data.context)) {
      diagnostics.push({
        severity: "error",
        field: "context",
        message: `Invalid context '${data.context}'. Valid values: ${VALID_CONTEXT_VALUES.join(", ")}`,
        suggestion: "fork",
        fixable: true,
        fix: (content: string) => {
          return content.replace(
            new RegExp(`(context:\\s*)${escapeRegExp(data.context)}`, "m"),
            "$1fork"
          )
        },
      })
    }
  }

  // Check agent (only valid when context: fork)
  if (data.agent !== undefined) {
    if (data.context !== "fork") {
      diagnostics.push({
        severity: "warning",
        field: "agent",
        message: "'agent' field is only used when 'context: fork' is set",
      })
    } else if (typeof data.agent !== "string") {
      diagnostics.push({
        severity: "error",
        field: "agent",
        message: "'agent' must be a string (e.g., 'Explore', 'Plan', 'general-purpose')",
      })
    }
  }

  return diagnostics
}

/**
 * Validate agent/subagent frontmatter
 * Based on: https://code.claude.com/docs/en/sub-agents
 */
function validateAgentFrontmatter(data: Record<string, any>, _content: string): LintDiagnostic[] {
  const diagnostics: LintDiagnostic[] = []

  // Check name (required for agents)
  if (!data.name) {
    diagnostics.push({
      severity: "warning",
      field: "name",
      message: "'name' is recommended for agents",
      suggestion: "Add a name field to the frontmatter",
      fixable: true,
      fix: (content: string) => {
        return content.replace(
          /^---\n/m,
          "---\nname: TODO - Add agent name\n"
        )
      },
    })
  } else if (typeof data.name !== "string") {
    diagnostics.push({
      severity: "error",
      field: "name",
      message: "'name' must be a string",
    })
  } else if (!/^[a-z][a-z0-9-]*$/.test(data.name)) {
    const suggestedName = data.name.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/^-+|-+$/g, "").replace(/-+/g, "-")
    diagnostics.push({
      severity: "warning",
      field: "name",
      message: "'name' should use lowercase letters, numbers, and hyphens only",
      suggestion: suggestedName,
      fixable: true,
      fix: (content: string) => {
        return content.replace(
          new RegExp(`(name:\\s*)${escapeRegExp(data.name)}`, "m"),
          `$1${suggestedName}`
        )
      },
    })
  }

  // Check description (required for agents)
  if (!data.description) {
    diagnostics.push({
      severity: "warning",
      field: "description",
      message: "'description' is recommended - Claude uses it to decide when to delegate tasks",
      suggestion: "Add a description field to the frontmatter",
      fixable: true,
      fix: (content: string) => {
        // Add description after name field, or at the start of frontmatter
        if (content.includes("name:")) {
          return content.replace(
            /(name:[^\n]*\n)/m,
            "$1description: TODO - Add a description for this agent\n"
          )
        } else {
          return content.replace(
            /^---\n/m,
            "---\ndescription: TODO - Add a description for this agent\n"
          )
        }
      },
    })
  } else if (typeof data.description !== "string") {
    diagnostics.push({
      severity: "error",
      field: "description",
      message: "'description' must be a string",
    })
  }

  // Check tools
  if (data.tools !== undefined) {
    const tools = Array.isArray(data.tools)
      ? data.tools
      : typeof data.tools === "string"
        ? data.tools.split(",").map((t: string) => t.trim())
        : null

    if (tools === null) {
      diagnostics.push({
        severity: "error",
        field: "tools",
        message: "'tools' must be an array or comma-separated string",
      })
    } else {
      for (const tool of tools) {
        if (!isValidTool(tool)) {
          diagnostics.push({
            severity: "warning",
            field: "tools",
            message: `Unknown tool '${tool}' - check spelling or ensure it's a valid MCP tool`,
          })
        }
      }
    }
  }

  // Check disallowedTools
  if (data.disallowedTools !== undefined) {
    const tools = Array.isArray(data.disallowedTools)
      ? data.disallowedTools
      : typeof data.disallowedTools === "string"
        ? data.disallowedTools.split(",").map((t: string) => t.trim())
        : null

    if (tools === null) {
      diagnostics.push({
        severity: "error",
        field: "disallowedTools",
        message: "'disallowedTools' must be an array or comma-separated string",
      })
    }
  }

  // Check model
  if (data.model !== undefined) {
    if (typeof data.model !== "string") {
      diagnostics.push({
        severity: "error",
        field: "model",
        message: "'model' must be a string",
      })
    } else if (!VALID_MODELS.includes(data.model.toLowerCase())) {
      diagnostics.push({
        severity: "error",
        field: "model",
        message: `Invalid model '${data.model}'. Valid values: ${VALID_MODELS.join(", ")}`,
        suggestion: "sonnet",
        fixable: true,
        fix: (content: string) => {
          return content.replace(
            new RegExp(`(model:\\s*)${escapeRegExp(data.model)}`, "m"),
            "$1sonnet"
          )
        },
      })
    }
  }

  // Check permissionMode
  if (data.permissionMode !== undefined) {
    if (typeof data.permissionMode !== "string") {
      diagnostics.push({
        severity: "error",
        field: "permissionMode",
        message: "'permissionMode' must be a string",
      })
    } else if (!VALID_PERMISSION_MODES.includes(data.permissionMode)) {
      diagnostics.push({
        severity: "error",
        field: "permissionMode",
        message: `Invalid permissionMode '${data.permissionMode}'. Valid values: ${VALID_PERMISSION_MODES.join(", ")}`,
        suggestion: "default",
        fixable: true,
        fix: (content: string) => {
          return content.replace(
            new RegExp(`(permissionMode:\\s*)${escapeRegExp(data.permissionMode)}`, "m"),
            "$1default"
          )
        },
      })
    }
  }

  // Check skills array
  if (data.skills !== undefined) {
    if (!Array.isArray(data.skills)) {
      diagnostics.push({
        severity: "error",
        field: "skills",
        message: "'skills' must be an array of skill names",
      })
    }
  }

  return diagnostics
}

/**
 * Validate markdown content structure
 */
function validateMarkdownContent(content: string): LintDiagnostic[] {
  const diagnostics: LintDiagnostic[] = []
  const lines = content.split("\n")

  // Find where frontmatter ends
  let contentStartLine = 0
  if (lines[0]?.trim() === "---") {
    for (let i = 1; i < lines.length; i++) {
      if (lines[i]?.trim() === "---") {
        contentStartLine = i + 1
        break
      }
    }
  }

  // Check for headings
  let hasH1 = false
  let lastHeadingLevel = 0
  const headingLevels: { level: number; line: number }[] = []

  for (let i = contentStartLine; i < lines.length; i++) {
    const line = lines[i]
    if (!line) continue

    const headingMatch = line.match(/^(#{1,6})\s+/)
    if (headingMatch) {
      const level = headingMatch[1].length
      headingLevels.push({ level, line: i + 1 })

      if (level === 1) {
        if (hasH1) {
          diagnostics.push({
            severity: "warning",
            line: i + 1,
            message: "Multiple H1 headings found - consider using only one main heading",
          })
        }
        hasH1 = true
      }

      // Check heading hierarchy (shouldn't skip levels)
      if (lastHeadingLevel > 0 && level > lastHeadingLevel + 1) {
        diagnostics.push({
          severity: "info",
          line: i + 1,
          message: `Heading jumps from H${lastHeadingLevel} to H${level} - consider not skipping heading levels`,
        })
      }

      lastHeadingLevel = level
    }

    // Check for unclosed code blocks
    if (line.trim().startsWith("```")) {
      let blockClosed = false
      for (let j = i + 1; j < lines.length; j++) {
        if (lines[j]?.trim() === "```") {
          blockClosed = true
          break
        }
      }
      if (!blockClosed && !line.includes("```\n")) {
        // Skip if we're looking at a closing block
        const nextCodeBlock = lines.slice(i + 1).findIndex((l) => l?.trim().startsWith("```"))
        if (nextCodeBlock === -1) {
          diagnostics.push({
            severity: "warning",
            line: i + 1,
            message: "Unclosed code block",
          })
        }
      }
    }
  }

  return diagnostics
}

/**
 * Main linting function
 */
export function lintWorkflowFile(
  content: string,
  type: "agent" | "command" | "skill"
): LintResult {
  const result: LintResult = {
    valid: true,
    errors: [],
    warnings: [],
    info: [],
  }

  // Check for frontmatter
  const frontmatter = parseFrontmatter(content)

  if (!frontmatter) {
    // Missing frontmatter is a warning for skills/commands, error context
    if (!content.trim().startsWith("---")) {
      result.warnings.push({
        severity: "warning",
        field: "frontmatter",
        message: "Missing frontmatter delimiter '---' at start of file",
        suggestion: "Add YAML frontmatter between --- delimiters at the top of the file",
      })
    }
  } else {
    // Validate frontmatter based on type
    let frontmatterDiagnostics: LintDiagnostic[] = []

    if (type === "agent") {
      frontmatterDiagnostics = validateAgentFrontmatter(frontmatter.data, content)
    } else {
      // Both commands and skills use the same schema
      frontmatterDiagnostics = validateSkillFrontmatter(frontmatter.data, content)
    }

    // Categorize diagnostics
    for (const diagnostic of frontmatterDiagnostics) {
      if (diagnostic.severity === "error") {
        result.errors.push(diagnostic)
      } else if (diagnostic.severity === "warning") {
        result.warnings.push(diagnostic)
      } else {
        result.info.push(diagnostic)
      }
    }
  }

  // Validate markdown content
  const markdownDiagnostics = validateMarkdownContent(content)
  for (const diagnostic of markdownDiagnostics) {
    if (diagnostic.severity === "error") {
      result.errors.push(diagnostic)
    } else if (diagnostic.severity === "warning") {
      result.warnings.push(diagnostic)
    } else {
      result.info.push(diagnostic)
    }
  }

  // Set valid flag
  result.valid = result.errors.length === 0

  return result
}

/**
 * Get a summary status string
 */
export function getLintStatusSummary(result: LintResult): {
  status: "valid" | "warnings" | "errors"
  text: string
} {
  if (result.errors.length > 0) {
    const count = result.errors.length
    return {
      status: "errors",
      text: `${count} error${count !== 1 ? "s" : ""}`,
    }
  }

  if (result.warnings.length > 0) {
    const count = result.warnings.length
    return {
      status: "warnings",
      text: `${count} warning${count !== 1 ? "s" : ""}`,
    }
  }

  return {
    status: "valid",
    text: "Valid",
  }
}
