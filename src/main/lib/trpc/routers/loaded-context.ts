import { z } from "zod"
import { router, publicProcedure } from "../index"
import * as fs from "fs/promises"
import * as path from "path"
import * as os from "os"
import { eq } from "drizzle-orm"
import { getDatabase, configSources, mcpCredentials } from "../../db"
import { getConsolidatedConfig } from "../../config/consolidator"
import { scanAgentsDirectory, type FileAgent } from "./agent-utils"
import matter from "gray-matter"
import yaml from "js-yaml"

// ============ TYPES ============

interface ClaudeMdFile {
  path: string
  source: "project" | "user"
  content: string
  relativePath?: string
}

interface McpServerInfo {
  name: string
  status: "running" | "failed" | "needs_auth" | "disabled" | "no_auth_needed" | "configured" | "missing_credentials"
  source: "project" | "user" | "custom"
  toolCount?: number
  enabled: boolean
}

interface SkillInfo {
  name: string
  description: string
  source: "project" | "user" | "custom"
  path: string
}

interface AgentInfo {
  name: string
  description: string
  source: "project" | "user" | "custom"
  path: string
  model?: string
}

interface LoadedContextData {
  claudeMdFiles: ClaudeMdFile[]
  mcpServers: McpServerInfo[]
  skills: SkillInfo[]
  agents: AgentInfo[]
}

// ============ HELPERS ============

/**
 * Custom YAML parser that's more forgiving with special characters
 */
function parseYamlSafe(input: string): Record<string, unknown> {
  try {
    return yaml.load(input, { schema: yaml.DEFAULT_SCHEMA }) as Record<string, unknown>
  } catch {
    return {}
  }
}

/**
 * Parse SKILL.md frontmatter to extract name and description
 */
function parseSkillMd(content: string): { name?: string; description?: string } {
  try {
    const { data } = matter(content, {
      engines: {
        yaml: { parse: parseYamlSafe }
      }
    })
    return {
      name: typeof data.name === "string" ? data.name : undefined,
      description: typeof data.description === "string" ? data.description : undefined,
    }
  } catch {
    return {}
  }
}

/**
 * Get directories to scan (user and project locations)
 */
function getScanLocations(type: string, cwd?: string) {
  const homeDir = os.homedir()
  const userDir = path.join(homeDir, ".claude", type)
  const projectDir = cwd ? path.join(cwd, ".claude", type) : null

  return { userDir, projectDir }
}

/**
 * Get custom plugin directories from database
 */
function getCustomPluginDirectories(): Array<{ path: string; priority: number }> {
  const db = getDatabase()
  const sources = db
    .select()
    .from(configSources)
    .where(eq(configSources.type, "plugin"))
    .orderBy(configSources.priority)
    .all()
    .filter((s) => s.enabled)

  return sources.map((s) => ({ path: s.path, priority: s.priority }))
}

/**
 * Check if an env var name looks like a credential
 */
function isCredentialEnvVar(name: string): boolean {
  const patterns = [
    /API[_-]?KEY/i,
    /TOKEN/i,
    /SECRET/i,
    /PASSWORD/i,
    /CREDENTIAL/i,
    /AUTH/i,
    /PRIVATE[_-]?KEY/i,
  ]
  return patterns.some((p) => p.test(name))
}

/**
 * Check if a value is a placeholder
 */
function isPlaceholder(value: string | undefined): boolean {
  if (!value) return true
  const trimmed = value.trim()
  return (
    trimmed === "" ||
    trimmed === "..." ||
    trimmed.includes("YOUR_") ||
    trimmed.includes("<") ||
    trimmed.includes("REPLACE") ||
    trimmed.includes("TODO")
  )
}

/**
 * Discover CLAUDE.md files in project and user directories
 */
async function discoverClaudeMdFiles(projectPath?: string): Promise<ClaudeMdFile[]> {
  const files: ClaudeMdFile[] = []
  const homeDir = os.homedir()

  // Possible locations to check
  const locations: Array<{ filePath: string; source: "project" | "user"; relativePath: string }> = []

  // Project-level CLAUDE.md files
  if (projectPath) {
    locations.push(
      { filePath: path.join(projectPath, "CLAUDE.md"), source: "project", relativePath: "CLAUDE.md" },
      { filePath: path.join(projectPath, ".claude", "CLAUDE.md"), source: "project", relativePath: ".claude/CLAUDE.md" },
    )
  }

  // User-level CLAUDE.md
  locations.push(
    { filePath: path.join(homeDir, ".claude", "CLAUDE.md"), source: "user", relativePath: "~/.claude/CLAUDE.md" },
  )

  // Check each location
  for (const loc of locations) {
    try {
      const content = await fs.readFile(loc.filePath, "utf-8")
      files.push({
        path: loc.filePath,
        source: loc.source,
        content,
        relativePath: loc.relativePath,
      })
    } catch {
      // File doesn't exist, skip
    }
  }

  return files
}

/**
 * Get MCP servers with auth status
 */
async function getMcpServers(projectPath?: string): Promise<McpServerInfo[]> {
  const servers: McpServerInfo[] = []

  try {
    const consolidated = await getConsolidatedConfig(projectPath)

    // Get stored credentials
    const db = getDatabase()
    const allCredentials = db.select().from(mcpCredentials).all()
    const credentialsMap = new Map<string, Record<string, string>>()

    for (const cred of allCredentials) {
      try {
        const stored = JSON.parse(cred.credentials) as Record<string, string>
        credentialsMap.set(cred.id, stored)
      } catch {
        // Invalid JSON, skip
      }
    }

    // Process each server
    for (const [serverId, serverConfig] of Object.entries(consolidated.mergedServers)) {
      const config = serverConfig as { env?: Record<string, string>; disabled?: boolean }
      const envVars = config.env || {}
      const credentialVars = Object.keys(envVars).filter(isCredentialEnvVar)
      const storedCredentials = credentialsMap.get(serverId) || {}

      let status: McpServerInfo["status"]
      if (config.disabled) {
        status = "disabled"
      } else if (credentialVars.length === 0) {
        status = "no_auth_needed"
      } else {
        const allConfigured = credentialVars.every((varName) => {
          const configValue = envVars[varName]
          const storedValue = storedCredentials[varName]
          return (configValue && !isPlaceholder(configValue)) || storedValue
        })
        status = allConfigured ? "configured" : "missing_credentials"
      }

      // Determine source
      const sourceInfo = consolidated.serverSources[serverId]
      let source: "project" | "user" | "custom" = "user"
      if (sourceInfo?.type === "project") {
        source = "project"
      } else if (sourceInfo?.type === "custom") {
        source = "custom"
      }

      servers.push({
        name: serverId,
        status,
        source,
        enabled: !config.disabled,
      })
    }
  } catch (err) {
    console.error("[loaded-context] Failed to get MCP servers:", err)
  }

  return servers
}

/**
 * Scan for skills
 */
async function scanSkillsDirectory(
  dir: string,
  source: "user" | "project" | "custom",
  namePrefix = "",
): Promise<SkillInfo[]> {
  const skills: SkillInfo[] = []

  try {
    await fs.access(dir)
  } catch {
    return skills
  }

  try {
    const entries = await fs.readdir(dir, { withFileTypes: true })

    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      if (entry.name.includes("..") || entry.name.includes("/") || entry.name.includes("\\")) {
        continue
      }

      const entryPath = path.join(dir, entry.name)
      const skillMdPath = path.join(entryPath, "SKILL.md")
      const skillName = namePrefix ? `${namePrefix}:${entry.name}` : entry.name

      try {
        await fs.access(skillMdPath)
        const content = await fs.readFile(skillMdPath, "utf-8")
        const parsed = parseSkillMd(content)

        skills.push({
          name: parsed.name || skillName,
          description: parsed.description || "",
          source,
          path: skillMdPath,
        })
      } catch {
        // Check for nested skills
        const nestedSkills = await scanSkillsDirectory(entryPath, source, skillName)
        skills.push(...nestedSkills)
      }
    }
  } catch (err) {
    console.error(`[loaded-context] Failed to scan skills directory ${dir}:`, err)
  }

  return skills
}

/**
 * Get all skills from user, project, and custom locations
 */
async function getSkills(projectPath?: string): Promise<SkillInfo[]> {
  const locations = getScanLocations("skills", projectPath)
  const customDirs = getCustomPluginDirectories()

  const scanPromises: Promise<SkillInfo[]>[] = []

  // Project skills
  if (locations.projectDir) {
    scanPromises.push(scanSkillsDirectory(locations.projectDir, "project"))
  }

  // User skills
  scanPromises.push(scanSkillsDirectory(locations.userDir, "user"))

  // Custom plugin directories
  for (const customDir of customDirs) {
    const skillsDir = path.join(customDir.path, "skills")
    scanPromises.push(scanSkillsDirectory(skillsDir, "custom"))
  }

  const results = await Promise.all(scanPromises)

  // Deduplicate by name
  const seenNames = new Set<string>()
  const skills: SkillInfo[] = []

  for (const skillList of results) {
    for (const skill of skillList) {
      if (!seenNames.has(skill.name)) {
        seenNames.add(skill.name)
        skills.push(skill)
      }
    }
  }

  return skills
}

/**
 * Get all agents from user, project, and custom locations
 */
async function getAgents(projectPath?: string): Promise<AgentInfo[]> {
  const locations = getScanLocations("agents", projectPath)
  const customDirs = getCustomPluginDirectories()

  const scanPromises: Promise<FileAgent[]>[] = []

  // Project agents
  if (locations.projectDir) {
    scanPromises.push(scanAgentsDirectory(locations.projectDir, "project"))
  }

  // User agents
  scanPromises.push(scanAgentsDirectory(locations.userDir, "user"))

  // Custom plugin directories
  for (const customDir of customDirs) {
    const agentsDir = path.join(customDir.path, "agents")
    scanPromises.push(scanAgentsDirectory(agentsDir, "custom"))
  }

  const results = await Promise.all(scanPromises)

  // Deduplicate and convert to AgentInfo
  const seenNames = new Set<string>()
  const agents: AgentInfo[] = []

  for (const agentList of results) {
    for (const agent of agentList) {
      if (!seenNames.has(agent.name)) {
        seenNames.add(agent.name)
        agents.push({
          name: agent.name,
          description: agent.description || "",
          source: agent.source,
          path: agent.path,
          model: agent.model,
        })
      }
    }
  }

  return agents
}

// ============ ROUTER ============

export const loadedContextRouter = router({
  /**
   * Get all loaded context for a project
   * Aggregates CLAUDE.md files, MCP servers, skills, and agents
   */
  getLoadedContext: publicProcedure
    .input(
      z.object({
        projectPath: z.string().optional(),
      }).optional()
    )
    .query(async ({ input }): Promise<LoadedContextData> => {
      const projectPath = input?.projectPath

      // Fetch all context in parallel
      const [claudeMdFiles, mcpServers, skills, agents] = await Promise.all([
        discoverClaudeMdFiles(projectPath),
        getMcpServers(projectPath),
        getSkills(projectPath),
        getAgents(projectPath),
      ])

      return {
        claudeMdFiles,
        mcpServers,
        skills,
        agents,
      }
    }),

  /**
   * Read a specific CLAUDE.md file content
   * Used for expanding file content in the UI
   */
  readClaudeMdFile: publicProcedure
    .input(
      z.object({
        filePath: z.string(),
      })
    )
    .query(async ({ input }): Promise<string | null> => {
      // Security: Only allow reading CLAUDE.md files
      const basename = path.basename(input.filePath)
      if (basename !== "CLAUDE.md") {
        console.warn(`[loaded-context] Attempted to read non-CLAUDE.md file: ${input.filePath}`)
        return null
      }

      try {
        const content = await fs.readFile(input.filePath, "utf-8")
        return content
      } catch {
        return null
      }
    }),
})
