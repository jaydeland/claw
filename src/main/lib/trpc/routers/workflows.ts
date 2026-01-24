import { z } from "zod"
import { router, publicProcedure } from "../index"
import * as fs from "fs/promises"
import * as path from "path"
import * as os from "os"
import matter from "gray-matter"
import { getDatabase, claudeCodeSettings } from "../../db"
import { eq } from "drizzle-orm"

// ============ TYPES ============

interface ValidationError {
  field: string
  message: string
  severity: "error" | "warning"
}

interface AgentMetadata {
  id: string
  name: string
  description: string
  tools: string[]
  model: string
  sourcePath: string
  validationErrors?: ValidationError[]
}

interface CommandMetadata {
  id: string
  name: string
  description: string
  allowedTools: string[]
  sourcePath: string
  validationErrors?: ValidationError[]
}

interface SkillMetadata {
  id: string
  name: string
  description: string
  sourcePath: string
  validationErrors?: ValidationError[]
}

interface CliAppMetadata {
  name: string // e.g., "aws"
  commands: string[] // e.g., ["aws s3 ls", "aws eks describe-cluster"]
}

interface BackgroundTaskMetadata {
  type: string // e.g., "background-agent", "async-task", "parallel-agents"
  description: string // Extracted context about what the task does
  agentName?: string // If it's a background agent, which agent
}

interface DependencyGraph {
  // Static dependencies (declared in frontmatter tools array)
  tools: string[] // All tools (kept for compatibility)
  builtinTools: string[] // Built-in Claude tools (Read, Write, Edit, etc.)
  mcpTools: Array<{ tool: string; server: string }> // MCP tools with their server
  skills: string[]
  mcpServers: string[]

  // Runtime invocations (detected in body content)
  agents: string[] // Agents spawned during execution
  commands: string[] // Commands called during execution
  skillInvocations: string[] // Skills invoked via Skill tool at runtime
  cliApps: CliAppMetadata[] // CLI applications with command examples
  backgroundTasks: BackgroundTaskMetadata[] // Background tasks with descriptions
}

interface AgentWithDependencies extends AgentMetadata {
  dependencies: DependencyGraph
}

interface CommandWithDependencies extends CommandMetadata {
  dependencies: DependencyGraph
}

interface WorkflowGraph {
  agents: AgentWithDependencies[]
  commands: CommandWithDependencies[]
  skills: SkillMetadata[]
}

// Built-in Claude Code tools (core tools only, NOT MCP tools)
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

// ============ HELPER FUNCTIONS ============

/**
 * Get the Claude config directory, preferring customConfigDir from settings
 */
async function getClaudeConfigDir(): Promise<string> {
  const db = getDatabase()
  const settings = db
    .select()
    .from(claudeCodeSettings)
    .where(eq(claudeCodeSettings.id, "default"))
    .get()

  // Use custom config dir if set, otherwise default to ~/.claude
  return settings?.customConfigDir || path.join(os.homedir(), ".claude")
}

/**
 * Validate a path is within the allowed base directory (prevent path traversal)
 */
function validatePath(baseDir: string, targetPath: string): boolean {
  const resolvedBase = path.resolve(baseDir)
  const resolvedTarget = path.resolve(targetPath)
  return resolvedTarget.startsWith(resolvedBase)
}

/**
 * Validate frontmatter structure and collect errors
 */
function validateFrontmatter(data: any): ValidationError[] {
  const errors: ValidationError[] = []

  // Check for required fields
  if (!data.name || typeof data.name !== "string") {
    errors.push({
      field: "name",
      message: "Missing or invalid 'name' field in frontmatter",
      severity: "warning",
    })
  }

  // Validate model field if present
  if (data.model && typeof data.model !== "string") {
    errors.push({
      field: "model",
      message: "'model' field should be a string",
      severity: "warning",
    })
  }

  // Validate tools field if present
  if (data.tools && !Array.isArray(data.tools)) {
    errors.push({
      field: "tools",
      message: "'tools' field should be an array",
      severity: "warning",
    })
  }

  return errors
}

/**
 * Parse agent .md file frontmatter
 */
function parseAgentMd(content: string, filename: string): AgentMetadata {
  const validationErrors: ValidationError[] = []

  try {
    // Check if content has frontmatter delimiters
    if (!content.trim().startsWith("---")) {
      validationErrors.push({
        field: "frontmatter",
        message: "Missing frontmatter opening delimiter '---'",
        severity: "error",
      })
    }

    const { data, content: markdownContent } = matter(content)

    // Validate frontmatter structure
    const errors = validateFrontmatter(data)
    validationErrors.push(...errors)

    return {
      id: filename.replace(/\.md$/, ""),
      name: typeof data.name === "string" ? data.name : filename.replace(/\.md$/, ""),
      description: typeof data.description === "string" ? data.description : "",
      tools: Array.isArray(data.tools) ? (data.tools as string[]) : [],
      model: typeof data.model === "string" ? data.model : "",
      sourcePath: "", // Will be set by caller
      validationErrors: validationErrors.length > 0 ? validationErrors : undefined,
    }
  } catch (err) {
    console.error(`[workflows] Failed to parse agent frontmatter for ${filename}:`, err)

    // Add parsing error
    validationErrors.push({
      field: "frontmatter",
      message: err instanceof Error ? err.message : "Failed to parse YAML frontmatter",
      severity: "error",
    })

    return {
      id: filename.replace(/\.md$/, ""),
      name: filename.replace(/\.md$/, ""),
      description: "",
      tools: [],
      model: "",
      sourcePath: "",
      validationErrors,
    }
  }
}

/**
 * Parse command .md file frontmatter
 */
function parseCommandMd(content: string, filename: string): CommandMetadata {
  const validationErrors: ValidationError[] = []

  try {
    // Check if content has frontmatter delimiters
    if (!content.trim().startsWith("---")) {
      validationErrors.push({
        field: "frontmatter",
        message: "Missing frontmatter opening delimiter '---'",
        severity: "warning",
      })
    }

    const { data } = matter(content)

    // Parse allowed-tools (note: with hyphen, not underscore)
    let allowedTools: string[] = []
    if (Array.isArray(data["allowed-tools"])) {
      allowedTools = data["allowed-tools"] as string[]
    } else if (Array.isArray(data.tools)) {
      // Fallback to 'tools' field if allowed-tools is not present
      allowedTools = data.tools as string[]
    }

    return {
      id: filename.replace(/\.md$/, ""),
      name: typeof data.name === "string" ? data.name : filename.replace(/\.md$/, ""),
      description: typeof data.description === "string" ? data.description : "",
      allowedTools,
      sourcePath: "", // Will be set by caller
      validationErrors: validationErrors.length > 0 ? validationErrors : undefined,
    }
  } catch (err) {
    console.error(`[workflows] Failed to parse command frontmatter for ${filename}:`, err)

    validationErrors.push({
      field: "frontmatter",
      message: err instanceof Error ? err.message : "Failed to parse YAML frontmatter",
      severity: "error",
    })

    return {
      id: filename.replace(/\.md$/, ""),
      name: filename.replace(/\.md$/, ""),
      description: "",
      allowedTools: [],
      sourcePath: "",
      validationErrors,
    }
  }
}

/**
 * Parse SKILL.md frontmatter
 */
function parseSkillMd(content: string, dirName: string): SkillMetadata {
  const validationErrors: ValidationError[] = []

  try {
    // Check if content has frontmatter delimiters
    if (!content.trim().startsWith("---")) {
      validationErrors.push({
        field: "frontmatter",
        message: "Missing frontmatter opening delimiter '---'",
        severity: "warning",
      })
    }

    const { data } = matter(content)

    return {
      id: dirName,
      name: typeof data.name === "string" ? data.name : dirName,
      description: typeof data.description === "string" ? data.description : "",
      sourcePath: "", // Will be set by caller
      validationErrors: validationErrors.length > 0 ? validationErrors : undefined,
    }
  } catch (err) {
    console.error(`[workflows] Failed to parse skill frontmatter for ${dirName}:`, err)

    validationErrors.push({
      field: "frontmatter",
      message: err instanceof Error ? err.message : "Failed to parse YAML frontmatter",
      severity: "error",
    })

    return {
      id: dirName,
      name: dirName,
      description: "",
      sourcePath: "",
      validationErrors,
    }
  }
}

/**
 * Scan agents directory for .md files
 */
async function scanAgentsDir(baseDir: string): Promise<AgentMetadata[]> {
  const agentsDir = path.join(baseDir, "agents")
  const agents: AgentMetadata[] = []

  try {
    await fs.access(agentsDir)
  } catch {
    // Directory doesn't exist, return empty
    return agents
  }

  const entries = await fs.readdir(agentsDir, { withFileTypes: true })

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".md")) continue

    // Security: validate filename doesn't contain path traversal
    if (entry.name.includes("..") || entry.name.includes("/") || entry.name.includes("\\")) {
      console.warn(`[workflows] Skipping invalid agent filename: ${entry.name}`)
      continue
    }

    const filePath = path.join(agentsDir, entry.name)
    try {
      const content = await fs.readFile(filePath, "utf-8")
      const parsed = parseAgentMd(content, entry.name)
      parsed.sourcePath = filePath
      agents.push(parsed)
    } catch (err) {
      console.error(`[workflows] Failed to parse agent ${entry.name}:`, err instanceof Error ? err.message : err)
      // Skip this agent and continue with others
    }
  }

  return agents
}

/**
 * Scan commands directory for .md files
 */
async function scanCommandsDir(baseDir: string): Promise<CommandMetadata[]> {
  const commandsDir = path.join(baseDir, "commands")
  const commands: CommandMetadata[] = []

  try {
    await fs.access(commandsDir)
  } catch {
    // Directory doesn't exist, return empty
    return commands
  }

  const entries = await fs.readdir(commandsDir, { withFileTypes: true })

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".md")) continue

    // Security: validate filename doesn't contain path traversal
    if (entry.name.includes("..") || entry.name.includes("/") || entry.name.includes("\\")) {
      console.warn(`[workflows] Skipping invalid command filename: ${entry.name}`)
      continue
    }

    const filePath = path.join(commandsDir, entry.name)
    try {
      const content = await fs.readFile(filePath, "utf-8")
      const parsed = parseCommandMd(content, entry.name)
      parsed.sourcePath = filePath
      commands.push(parsed)
    } catch (err) {
      console.error(`[workflows] Failed to parse command ${entry.name}:`, err instanceof Error ? err.message : err)
      // Skip this command and continue with others
    }
  }

  return commands
}

/**
 * Scan skills directory for SKILL.md files
 */
async function scanSkillsDir(baseDir: string): Promise<SkillMetadata[]> {
  const skillsDir = path.join(baseDir, "skills")
  const skills: SkillMetadata[] = []

  try {
    await fs.access(skillsDir)
  } catch {
    // Directory doesn't exist, return empty
    return skills
  }

  const entries = await fs.readdir(skillsDir, { withFileTypes: true })

  for (const entry of entries) {
    if (!entry.isDirectory()) continue

    // Security: validate directory name doesn't contain path traversal
    if (entry.name.includes("..") || entry.name.includes("/") || entry.name.includes("\\")) {
      console.warn(`[workflows] Skipping invalid skill directory name: ${entry.name}`)
      continue
    }

    const skillMdPath = path.join(skillsDir, entry.name, "SKILL.md")

    try {
      await fs.access(skillMdPath)
      const content = await fs.readFile(skillMdPath, "utf-8")
      const parsed = parseSkillMd(content, entry.name)
      parsed.sourcePath = skillMdPath
      skills.push(parsed)
    } catch {
      // SKILL.md doesn't exist, skip
    }
  }

  return skills
}

/**
 * Extract MCP server names from content
 * Matches patterns like @mcp- or server references
 */
function extractMcpServers(content: string): string[] {
  const mcpPattern = /@mcp[_-]?([a-zA-Z0-9_-]+)/g
  const servers = new Set<string>()
  let match

  while ((match = mcpPattern.exec(content)) !== null) {
    servers.add(match[1])
  }

  return Array.from(servers)
}

/**
 * Extract agent invocations from file body content
 * Scans for various patterns of agent spawning/invocation
 */
function extractAgentInvocations(
  content: string,
  allAgentIds: string[]
): string[] {
  const invokedAgents = new Set<string>()

  // Pattern 1: "Use/Uses the {agent-name} agent" or "Use {agent-name} agent"
  const useAgentPattern = /uses?\s+(?:the\s+)?([a-z][a-z0-9-]*)\s+agent/gi
  let match
  while ((match = useAgentPattern.exec(content)) !== null) {
    const agentId = match[1].toLowerCase()
    if (allAgentIds.includes(agentId)) {
      invokedAgents.add(agentId)
    }
  }

  // Pattern 2: "Spawn `agent-name`" or "spawned by agent-name"
  const spawnPattern = /spawn(?:ed)?\s+(?:by\s+)?`?([a-z][a-z0-9-]*)`?/gi
  while ((match = spawnPattern.exec(content)) !== null) {
    const agentId = match[1].toLowerCase()
    if (allAgentIds.includes(agentId)) {
      invokedAgents.add(agentId)
    }
  }

  // Pattern 3: "Launch/Launches {agent-name} agent" or "Launch N agents"
  const launchPattern = /launch(?:es)?\s+(?:\d+-?\d*\s+)?(?:the\s+)?([a-z][a-z0-9-]*)\s+agents?/gi
  while ((match = launchPattern.exec(content)) !== null) {
    const agentId = match[1].toLowerCase()
    if (allAgentIds.includes(agentId)) {
      invokedAgents.add(agentId)
    }
  }

  // Pattern 4: Task tool with agent name - "Task.*agent.*`agent-name`"
  const taskAgentPattern = /Task.*?agent.*?`([a-z][a-z0-9-]*)`/gi
  while ((match = taskAgentPattern.exec(content)) !== null) {
    const agentId = match[1].toLowerCase()
    if (allAgentIds.includes(agentId)) {
      invokedAgents.add(agentId)
    }
  }

  // Pattern 5: "Fresh {agent-name} agent"
  const freshAgentPattern = /fresh\s+([a-z][a-z0-9-]*)\s+agent/gi
  while ((match = freshAgentPattern.exec(content)) !== null) {
    const agentId = match[1].toLowerCase()
    if (allAgentIds.includes(agentId)) {
      invokedAgents.add(agentId)
    }
  }

  // Pattern 6: Markdown bold agent references - "the **agent-name** agent"
  const boldAgentPattern = /\*\*([a-z][a-z0-9-]*)\*\*\s+agent/gi
  while ((match = boldAgentPattern.exec(content)) !== null) {
    const agentId = match[1].toLowerCase()
    if (allAgentIds.includes(agentId)) {
      invokedAgents.add(agentId)
    }
  }

  // Pattern 7: File path references - "agents/agent-name.md" or backtick path
  const filePathPattern = /agents\/([a-z][a-z0-9-]*)\.md/gi
  while ((match = filePathPattern.exec(content)) !== null) {
    const agentId = match[1].toLowerCase()
    if (allAgentIds.includes(agentId)) {
      invokedAgents.add(agentId)
    }
  }

  // Pattern 8: Agent label references - "**Agent Name Agent:**" or "- **Agent:**"
  const agentLabelPattern = /\*\*(?:.*?)?([a-z][a-z0-9-]*)\s+Agent:\*\*/gi
  while ((match = agentLabelPattern.exec(content)) !== null) {
    const agentId = match[1].toLowerCase()
    if (allAgentIds.includes(agentId)) {
      invokedAgents.add(agentId)
    }
  }

  return Array.from(invokedAgents)
}

/**
 * Extract command invocations from file body content
 * Scans for patterns like "/command-name" or command references
 */
function extractCommandInvocations(
  content: string,
  allCommandIds: string[]
): string[] {
  const invokedCommands = new Set<string>()

  // Pattern: "/command-name" references (including /gsd:command-name format)
  const commandPattern = /\/([a-z][a-z0-9:-]*)/gi
  let match
  while ((match = commandPattern.exec(content)) !== null) {
    const commandId = match[1].toLowerCase()
    if (allCommandIds.includes(commandId)) {
      invokedCommands.add(commandId)
    }
  }

  return Array.from(invokedCommands)
}

/**
 * Extract CLI applications from Bash tool usage with command examples
 * Detects command-line tools called via Bash and extracts actual commands
 */
function extractCliApps(content: string, allowedTools: string[]): CliAppMetadata[] {
  const cliAppsMap = new Map<string, Set<string>>()

  // Extract from Bash() tool declarations in allowed-tools
  allowedTools.forEach((tool) => {
    // Match Bash(aws:*), Bash(kubectl:*), etc.
    const bashMatch = tool.match(/Bash\(([a-z][a-z0-9-]*):/)
    if (bashMatch) {
      const toolName = bashMatch[1]
      if (!cliAppsMap.has(toolName)) {
        cliAppsMap.set(toolName, new Set())
      }
    }
  })

  // Extract command examples from bash code blocks
  const bashBlockPattern = /```bash\n([\s\S]*?)```/g
  let match
  while ((match = bashBlockPattern.exec(content)) !== null) {
    const bashCode = match[1]
    const lines = bashCode.split('\n').filter(line => line.trim())

    lines.forEach(line => {
      const trimmedLine = line.trim()
      // Skip comments and empty lines
      if (trimmedLine.startsWith('#') || !trimmedLine) return

      // Match CLI tools at start of line
      const cliPatterns = [
        { pattern: /^(aws)\s+(.+)/, name: 'aws' },
        { pattern: /^(kubectl)\s+(.+)/, name: 'kubectl' },
        { pattern: /^(gh)\s+(.+)/, name: 'gh' },
        { pattern: /^(docker)\s+(.+)/, name: 'docker' },
        { pattern: /^(terraform)\s+(.+)/, name: 'terraform' },
        { pattern: /^(helm)\s+(.+)/, name: 'helm' },
        { pattern: /^(git)\s+(.+)/, name: 'git' },
        { pattern: /^(npm)\s+(.+)/, name: 'npm' },
        { pattern: /^(yarn)\s+(.+)/, name: 'yarn' },
        { pattern: /^(bun)\s+(.+)/, name: 'bun' },
        { pattern: /^(curl)\s+(.+)/, name: 'curl' },
        { pattern: /^(jq)\s+(.+)/, name: 'jq' },
        { pattern: /^(dy)\s+(.+)/, name: 'dy' },
      ]

      for (const { pattern, name } of cliPatterns) {
        const cliMatch = trimmedLine.match(pattern)
        if (cliMatch) {
          if (!cliAppsMap.has(name)) {
            cliAppsMap.set(name, new Set())
          }
          // Store the full command (truncated for display)
          const fullCommand = trimmedLine.substring(0, 60) + (trimmedLine.length > 60 ? '...' : '')
          cliAppsMap.get(name)!.add(fullCommand)
          break
        }
      }
    })
  }

  // Convert to array of metadata objects
  return Array.from(cliAppsMap.entries())
    .map(([name, commands]) => ({
      name,
      commands: Array.from(commands).slice(0, 5) // Limit to 5 examples
    }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

/**
 * Truncate and clean up description text
 */
function truncateDescription(desc: string): string {
  // Clean up and truncate description
  const cleaned = desc.replace(/\s+/g, ' ').trim()
  if (cleaned.length > 80) {
    return cleaned.substring(0, 77) + '...'
  }
  return cleaned
}

/**
 * Extract frontmatter description field (first YAML block)
 */
function extractFrontmatterDescription(content: string): string {
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/)
  if (!frontmatterMatch) return ''

  const frontmatter = frontmatterMatch[1]
  const descMatch = frontmatter.match(/^description:\s*(.+)$/m)
  return descMatch ? descMatch[1].trim() : ''
}

/**
 * Extract background task patterns with descriptions
 * Detects async operations, background agents, or long-running tasks
 */
function extractBackgroundTasks(content: string): BackgroundTaskMetadata[] {
  const tasks: BackgroundTaskMetadata[] = []
  const frontmatterDesc = extractFrontmatterDescription(content)

  // Pattern 1: Background agent mentions with context extraction
  const backgroundAgentPatterns = [
    /(?:spawn|run|start|use|maintain)\s+(?:a\s+)?background[- ]agent\s+(?:to\s+)?([^.!?\n]+)/gi,
    /background[- ]agent\s+(?:that\s+|which\s+|to\s+)?([^.!?\n]+)/gi,
    /(?:as|in)\s+(?:a\s+)?background\s+agent[,.]?\s*([^.!?\n]*)/gi
  ]

  for (const pattern of backgroundAgentPatterns) {
    let match
    while ((match = pattern.exec(content)) !== null) {
      const description = match[1]?.trim() || 'Runs continuously in background'
      // Check if already added
      if (!tasks.some(t => t.type === 'background-agent' && t.description === description)) {
        tasks.push({
          type: 'background-agent',
          description: truncateDescription(description)
        })
      }
    }
  }

  // If we detected "background-agent" but couldn't extract description, add generic
  if (tasks.length === 0 && /background[- ]agent/gi.test(content)) {
    tasks.push({
      type: 'background-agent',
      description: 'Persistent agent running in background'
    })
  }

  // Pattern 2: Parallel agents with context
  // First, check if frontmatter description mentions parallel (most descriptive)
  if (/parallel/i.test(content)) {
    if (!tasks.some(t => t.type === 'parallel-agents')) {
      // Prefer frontmatter description if it mentions parallel
      if (frontmatterDesc && /parallel/i.test(frontmatterDesc)) {
        tasks.push({
          type: 'parallel-agents',
          description: truncateDescription(frontmatterDesc)
        })
      } else {
        // Try to extract description from body content
        const parallelPatterns = [
          // Pattern: "spawns parallel X tasks/agents"
          /spawns?\s+parallel\s+([^,.\n]+)/gi,
          // Pattern: "launch/run/spawn agents in parallel to X"
          /(?:launch|run|spawn)\s+(?:\d+\s+)?(?:agents?\s+)?in\s+parallel\s+(?:to\s+)?([^.!?\n:]+)/gi,
          // Pattern: "parallel agents for/to X"
          /parallel\s+agents?\s+(?:for|to)\s+([^.!?\n:]+)/gi,
          // Pattern: "launch/run/spawn N parallel X agents" (capture what comes after)
          /(?:launch|run|spawn)\s+\d+\s+parallel\s+\S+\s+agents?\s+(?:in\s+)?([^.!?\n:]+)/gi,
        ]

        let foundDescription = false
        for (const pattern of parallelPatterns) {
          const matches = Array.from(content.matchAll(pattern))
          if (matches.length > 0) {
            // Take the first match with a good description
            for (const m of matches) {
              const description = m[1]?.trim()
              if (description && description.length > 5) {
                tasks.push({
                  type: 'parallel-agents',
                  description: truncateDescription(description)
                })
                foundDescription = true
                break
              }
            }
            if (foundDescription) break
          }
        }

        // Fallback to generic description
        if (!foundDescription) {
          tasks.push({
            type: 'parallel-agents',
            description: 'Multiple agents running concurrently'
          })
        }
      }
    }
  }

  // Pattern 3: "Launches/Launch Background Tasks" with specific task names (check this FIRST)
  const bgTasksPattern = /launch(?:es)?\s+background\s+tasks?\s*(?:\((\d+)\s+processes?\))?/gi
  const bgTaskMatch = content.match(bgTasksPattern)
  if (bgTaskMatch && !tasks.some(t => t.type === 'background-tasks')) {
    // Try to find the task list nearby (look for bullet points or code with task names)
    // Only match specific task names, not generic "background task" text
    const taskNamesPattern = /(?:dy\s+dev|stern|ktop|devyard_monitor\.sh)/gi
    const foundTasks = new Set<string>()
    let match
    while ((match = taskNamesPattern.exec(content)) !== null) {
      const taskName = match[0].trim()
      foundTasks.add(taskName)
    }

    if (foundTasks.size > 0) {
      // Add a task with the list of specific background tasks
      tasks.push({
        type: 'background-tasks',
        description: `Launches: ${Array.from(foundTasks).join(', ')}`
      })
    } else {
      // Generic description based on frontmatter if available
      let description = 'Multiple background processes'
      if (frontmatterDesc && /background/i.test(frontmatterDesc)) {
        description = frontmatterDesc
      }
      tasks.push({
        type: 'background-tasks',
        description: truncateDescription(description)
      })
    }
  }

  // Pattern 4: Async/long-running tasks with context
  // Skip if we already found specific background-tasks (prefer specific over generic)
  if (!tasks.some(t => t.type === 'background-tasks')) {
    const asyncPatterns = [
      /(?:start|trigger|initiate)\s+(?:a\s+)?(?:long[- ]running|async)\s+(?:task|operation|process)\s+(?:to\s+|for\s+)?([^.!?\n]+)/gi,
      /(?:as\s+)?(?:an?\s+)?async\s+(?:task|operation)\s*[,:]?\s*([^.!?\n]*)/gi,
      /run(?:s|ning)?\s+in\s+(?:the\s+)?background[,.]?\s*([^.!?\n]*)/gi
    ]

    for (const pattern of asyncPatterns) {
      let match
      while ((match = pattern.exec(content)) !== null) {
        const description = match[1]?.trim() || 'Non-blocking async operation'
        if (!tasks.some(t => t.type === 'async-task')) {
          tasks.push({
            type: 'async-task',
            description: truncateDescription(description)
          })
        }
      }
    }
  }

  return tasks
}

/**
 * Extract skill invocations from file body content
 * Scans for patterns where skills are invoked at runtime via Skill tool
 */
function extractSkillInvocations(
  content: string,
  allSkillIds: string[]
): string[] {
  const invokedSkills = new Set<string>()

  // Pattern 1: Skill tool invocations - skill: "skill-name"
  const skillInvokePattern = /skill:\s*["']([a-z][a-z0-9-]*)["']/gi
  let match
  while ((match = skillInvokePattern.exec(content)) !== null) {
    const skillId = match[1].toLowerCase()
    if (allSkillIds.includes(skillId)) {
      invokedSkills.add(skillId)
    }
  }

  // Pattern 2: "Invoke skill-name skill" or "Use skill-name skill"
  const invokeSkillPattern = /(?:invoke|use)\s+(?:the\s+)?([a-z][a-z0-9-]*)\s+skill/gi
  while ((match = invokeSkillPattern.exec(content)) !== null) {
    const skillId = match[1].toLowerCase()
    if (allSkillIds.includes(skillId)) {
      invokedSkills.add(skillId)
    }
  }

  return Array.from(invokedSkills)
}

/**
 * Build dependency graph for an agent
 * Analyzes tools array and file body for dependencies
 */
async function buildAgentDependencies(
  agent: AgentMetadata,
  allSkillIds: string[],
  allAgentIds: string[],
  allCommandIds: string[]
): Promise<DependencyGraph> {
  const deps: DependencyGraph = {
    tools: [],
    builtinTools: [],
    mcpTools: [],
    skills: [],
    mcpServers: [],
    agents: [],
    commands: [],
    skillInvocations: [],
    cliApps: [],
    backgroundTasks: [],
  }

  // Read full file content for body scanning
  let fullContent = ""
  try {
    fullContent = await fs.readFile(agent.sourcePath, "utf-8")
  } catch {
    console.warn(`[workflows] Could not read agent file: ${agent.sourcePath}`)
  }

  // Parse tools from frontmatter
  for (const tool of agent.tools) {
    const toolLower = tool.toLowerCase()

    // Check if it's an MCP tool (starts with mcp__)
    if (toolLower.startsWith("mcp__")) {
      const parts = tool.split("__")
      if (parts.length >= 2) {
        const server = parts[1]
        // Check if it's a wildcard (ends with *) - show as "ALL"
        const isWildcard = tool.endsWith("*")
        const toolName = isWildcard ? "ALL" : tool
        deps.mcpTools.push({ tool: toolName, server })
        if (!deps.mcpServers.includes(server)) {
          deps.mcpServers.push(server)
        }
      }
      deps.tools.push(tool) // Keep for backward compatibility
      continue
    }

    // Check if it's a skill reference
    if (allSkillIds.includes(toolLower) || allSkillIds.includes(tool)) {
      deps.skills.push(tool)
      continue
    }

    // Check if it's a built-in tool
    if (BUILTIN_TOOLS.includes(tool) || BUILTIN_TOOLS.includes(toolLower)) {
      deps.builtinTools.push(tool)
      deps.tools.push(tool) // Keep for backward compatibility
      continue
    }

    // Default: treat as built-in tool
    deps.builtinTools.push(tool)
    deps.tools.push(tool)
  }

  // Extract MCP servers from file body
  const bodyMcpServers = extractMcpServers(fullContent)
  for (const server of bodyMcpServers) {
    if (!deps.mcpServers.includes(server)) {
      deps.mcpServers.push(server)
    }
  }

  // Extract agent invocations from file body
  const invokedAgents = extractAgentInvocations(fullContent, allAgentIds)
  deps.agents = invokedAgents

  // Extract command invocations from file body
  const invokedCommands = extractCommandInvocations(fullContent, allCommandIds)
  deps.commands = invokedCommands

  // Extract skill invocations from file body (runtime Skill tool calls)
  const invokedSkills = extractSkillInvocations(fullContent, allSkillIds)
  deps.skillInvocations = invokedSkills

  // Extract CLI applications from Bash usage
  const cliApps = extractCliApps(fullContent, agent.tools)
  deps.cliApps = cliApps

  // Extract background task patterns
  const backgroundTasks = extractBackgroundTasks(fullContent)
  deps.backgroundTasks = backgroundTasks

  return deps
}

/**
 * Build dependency graph for a command
 * Analyzes allowed-tools array and file body for dependencies
 */
async function buildCommandDependencies(
  command: CommandMetadata,
  allSkillIds: string[],
  allAgentIds: string[],
  allCommandIds: string[]
): Promise<DependencyGraph> {
  const deps: DependencyGraph = {
    tools: [],
    builtinTools: [],
    mcpTools: [],
    skills: [],
    mcpServers: [],
    agents: [],
    commands: [],
    skillInvocations: [],
    cliApps: [],
    backgroundTasks: [],
  }

  // Read full file content for body scanning
  let fullContent = ""
  try {
    fullContent = await fs.readFile(command.sourcePath, "utf-8")
  } catch {
    console.warn(`[workflows] Could not read command file: ${command.sourcePath}`)
  }

  // Parse tools from allowed-tools in frontmatter
  for (const tool of command.allowedTools) {
    const toolLower = tool.toLowerCase()

    // Check if it's an MCP tool (starts with mcp__)
    if (toolLower.startsWith("mcp__")) {
      const parts = tool.split("__")
      if (parts.length >= 2) {
        const server = parts[1]
        // Check if it's a wildcard (ends with *) - show as "ALL"
        const isWildcard = tool.endsWith("*")
        const toolName = isWildcard ? "ALL" : tool
        deps.mcpTools.push({ tool: toolName, server })
        if (!deps.mcpServers.includes(server)) {
          deps.mcpServers.push(server)
        }
      }
      deps.tools.push(tool) // Keep for backward compatibility
      continue
    }

    // Check if it's a skill reference
    if (allSkillIds.includes(toolLower) || allSkillIds.includes(tool)) {
      deps.skills.push(tool)
      continue
    }

    // Check if it's a built-in tool
    if (BUILTIN_TOOLS.includes(tool) || BUILTIN_TOOLS.includes(toolLower)) {
      deps.builtinTools.push(tool)
      deps.tools.push(tool) // Keep for backward compatibility
      continue
    }

    // Default: treat as built-in tool
    deps.builtinTools.push(tool)
    deps.tools.push(tool)
  }

  // Extract MCP servers from file body
  const bodyMcpServers = extractMcpServers(fullContent)
  for (const server of bodyMcpServers) {
    if (!deps.mcpServers.includes(server)) {
      deps.mcpServers.push(server)
    }
  }

  // Extract agent invocations from file body
  const invokedAgents = extractAgentInvocations(fullContent, allAgentIds)
  deps.agents = invokedAgents

  // Extract command invocations from file body
  const invokedCommands = extractCommandInvocations(fullContent, allCommandIds)
  deps.commands = invokedCommands

  // Extract skill invocations from file body (runtime Skill tool calls)
  const invokedSkills = extractSkillInvocations(fullContent, allSkillIds)
  deps.skillInvocations = invokedSkills

  // Extract CLI applications from Bash usage
  const cliApps = extractCliApps(fullContent, command.allowedTools)
  deps.cliApps = cliApps

  // Extract background task patterns
  const backgroundTasks = extractBackgroundTasks(fullContent)
  deps.backgroundTasks = backgroundTasks

  return deps
}

// ============ ROUTER ============

export const workflowsRouter = router({
  /**
   * List all agents from the Claude config directory
   * Scans ~/.claude/agents/ (or customConfigDir/agents/) for .md files
   */
  listAgents: publicProcedure.query(async () => {
    const baseDir = await getClaudeConfigDir()
    return await scanAgentsDir(baseDir)
  }),

  /**
   * List all commands from the Claude config directory
   * Scans ~/.claude/commands/ (or customConfigDir/commands/) for .md files
   */
  listCommands: publicProcedure.query(async () => {
    const baseDir = await getClaudeConfigDir()
    return await scanCommandsDir(baseDir)
  }),

  /**
   * List all skills from the Claude config directory
   * Scans ~/.claude/skills/[dirname]/SKILL.md (or customConfigDir/skills/)
   */
  listSkills: publicProcedure.query(async () => {
    const baseDir = await getClaudeConfigDir()
    return await scanSkillsDir(baseDir)
  }),

  /**
   * Get command content from file path
   * Reads the markdown file and returns content and frontmatter
   */
  getCommandContent: publicProcedure
    .input(
      z.object({
        path: z.string(),
      }),
    )
    .query(async ({ input }) => {
      const content = await fs.readFile(input.path, "utf-8")
      const parsed = matter(content)
      return {
        content: parsed.content.trim(),
        frontmatter: parsed.data,
      }
    }),

  /**
   * Get the complete workflow dependency graph
   * Returns agents, commands, skills with agent and command dependencies categorized
   */
  getWorkflowGraph: publicProcedure.query<WorkflowGraph>(async () => {
    const baseDir = await getClaudeConfigDir()

    // Scan all workflow items
    const agents = await scanAgentsDir(baseDir)
    const commands = await scanCommandsDir(baseDir)
    const skills = await scanSkillsDir(baseDir)

    // Build ID sets for cross-referencing
    const allAgentIds = agents.map((a) => a.id)
    const allCommandIds = commands.map((c) => c.id)
    const allSkillIds = skills.map((s) => s.id)

    // Build dependency graph for each agent
    const agentsWithDeps: AgentWithDependencies[] = []

    for (const agent of agents) {
      const dependencies = await buildAgentDependencies(
        agent,
        allSkillIds,
        allAgentIds,
        allCommandIds
      )

      agentsWithDeps.push({
        ...agent,
        dependencies,
      })
    }

    // Build dependency graph for each command
    const commandsWithDeps: CommandWithDependencies[] = []

    for (const command of commands) {
      const dependencies = await buildCommandDependencies(
        command,
        allSkillIds,
        allAgentIds,
        allCommandIds
      )

      commandsWithDeps.push({
        ...command,
        dependencies,
      })
    }

    return {
      agents: agentsWithDeps,
      commands: commandsWithDeps,
      skills,
    }
  }),

  /**
   * Read the content of a workflow file
   * Validates the path is within the Claude config directory to prevent path traversal
   */
  readFileContent: publicProcedure
    .input(z.object({ path: z.string() }))
    .query(async ({ input }) => {
      // Get the base Claude config directory
      const baseDir = await getClaudeConfigDir()

      // Security: resolve both paths and ensure target is within base
      const resolvedBase = path.resolve(baseDir)
      const resolvedTarget = path.resolve(input.path)

      // Path traversal check
      if (!resolvedTarget.startsWith(resolvedBase)) {
        throw new Error("Access denied: path is outside Claude config directory")
      }

      // Check if path is a file (not a directory)
      try {
        const stats = await fs.stat(resolvedTarget)
        if (!stats.isFile()) {
          throw new Error("Path is not a file")
        }
      } catch (err) {
        throw new Error(`File not found: ${input.path}`)
      }

      // Read and return file content
      return await fs.readFile(resolvedTarget, "utf-8")
    }),
})

// ============ TYPE EXPORTS ============

export type {
  AgentMetadata,
  CommandMetadata,
  SkillMetadata,
  DependencyGraph,
  AgentWithDependencies,
  CommandWithDependencies,
  WorkflowGraph,
}
