import { z } from "zod"
import { router, publicProcedure } from "../index"
import { TRPCError } from "@trpc/server"
import * as fs from "fs/promises"
import * as fsSync from "fs"
import { app } from "electron"
import path from "path"
import { getDatabase } from "../../db"
import { openuiComponents, projects, chats } from "../../db/schema"
import { eq, and, desc } from "drizzle-orm"
import { buildClaudeEnv } from "../../claude"
import { getMergedMcpConfig } from "../../config/consolidator"
import { toSdkMcpConfigs } from "../../config/types"
import { injectAllStoredCredentials } from "../../mcp/credential-injection"

type RegisteredComponent = {
  name: string
  path: string
  description?: string
  category?: string
}

type ComponentLibraryItem = {
  name: string
  description?: string
}

type GeneratedComponentResult = {
  id: string
  name: string
  code: string
  atomsCode?: string
  description?: string
  prompt: string
  projectId: string
  chatId?: string
  isInstalled: boolean
  createdAt: number
  updatedAt: number
}

type GenerateResult = {
  output: string
  component?: GeneratedComponentResult
}

/**
 * Validate extracted code before writing to ensure it's a valid component
 */
function validateComponentCode(code: string): boolean {
  // Check for basic component structure
  const hasExport = /export\s+(function|const|class)/.test(code)
  const hasReactImport = /import\s+.*React/.test(code) || /"use client"/.test(code)
  const hasComponentName = /export\s+function\s+\w+/.test(code) ||
                           /export\s+const\s+\w+\s*=/.test(code)

  return hasExport && (hasReactImport || hasComponentName)
}

/**
 * Generate a unique component name with timestamp hash to prevent collisions
 */
function generateComponentName(prompt: string): string {
  // Extract meaningful words from prompt
  const words = prompt
    .split(/\s+/)
    .filter(w => w.length > 2)
    .slice(0, 3)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).replace(/[^a-zA-Z]/g, ""))
    .join("")

  // Add unique hash to prevent collisions
  const hash = Date.now().toString(36).toUpperCase()
  const baseName = words || "Component"

  return `Generated${baseName}${hash}`
}

/**
 * Get registered Claw UI components for OpenUI to use as its component library
 * Scans multiple directories to find all available components
 */
async function getRegisteredClawComponents(): Promise<RegisteredComponent[]> {
  const baseDir = app.getAppPath()
  const components: RegisteredComponent[] = []

  // Scan components/ui directory
  await scanComponentsDir(components, path.join(baseDir, "src/renderer/components/ui"), "components/ui/")

  // Scan features/*/components directories
  const featuresDir = path.join(baseDir, "src/renderer/features")
  const featureEntries = await fs.readdir(featuresDir).catch(() => [])
  for (const feature of featureEntries) {
    const featureComponentsPath = path.join(featuresDir, feature, "components")
    await scanComponentsDir(components, featureComponentsPath, `features/${feature}/components/`)
  }

  return components
}

/**
 * Scan a directory for component files and add them to the components array
 */
async function scanComponentsDir(
  components: RegisteredComponent[],
  dirPath: string,
  pathPrefix: string
) {
  const componentFiles = await fs.readdir(dirPath).catch(() => [])

  // Categorize components based on name patterns
  const getCategory = (name: string): string => {
    if (["button", "input", "textarea", "select", "checkbox", "switch"].includes(name)) return "Input"
    if (["dialog", "alert-dialog", "popover", "tooltip", "hover-card"].includes(name)) return "Overlay"
    if (["card", "badge", "avatar", "skeleton"].includes(name)) return "Display"
    if (["tabs", "accordion", "collapsible"].includes(name)) return "Layout"
    if (["dropdown-menu", "context-menu", "menubar"].includes(name)) return "Navigation"
    return "Other"
  }

  for (const file of componentFiles) {
    if (file.endsWith(".tsx") && !file.endsWith(".test.tsx")) {
      const componentName = path.basename(file, ".tsx")
      // Convert kebab-case to PascalCase
      const pascalName = componentName
        .split("-")
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join("")

      components.push({
        name: pascalName,
        path: `${pathPrefix}${file}`,
        description: `Claw's built-in ${pascalName} component`,
        category: getCategory(componentName),
      })
    }
  }
}

/**
 * Generate a UI component using Claude via the SDK
 */
async function generateOpenUIComponent(
  prompt: string,
  projectId: string,
  chatId: string | undefined,
  componentLibrary: Array<{ name: string; description?: string }
>): Promise<{
  output: string
  component?: {
    id: string
    name: string
    code: string
    atomsCode?: string
    description?: string
    prompt: string
    projectId: string
    chatId?: string
    isInstalled: boolean
    createdAt: number
    updatedAt: number
  }
}> {
  let sdk: typeof import("@anthropic-ai/claude-agent-sdk")

  try {
    sdk = await import("@anthropic-ai/claude-agent-sdk")
  } catch (error) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Claude SDK unavailable. Please ensure @anthropic-ai/claude-agent-sdk is installed.",
      cause: error
    })
  }

  // Build system prompt for component generation
  const systemPrompt = `You are an expert React UI component generator for the Claw desktop application.
You have access to the following Claw UI components that you should use when appropriate:
${componentLibrary.map((c) => `- ${c.name}: ${c.description || "UI component"}`).join("\n")}

Generate a React TypeScript component that:
1. Uses existing Claw components (Button, Card, Dialog, etc.) when possible
2. Follows Claw's design patterns (Tailwind CSS, Radix UI primitives)
3. Is typed with TypeScript
4. Includes proper error handling and accessibility
5. Uses 'use client' directive for client components
6. Imports from relative paths like "../../../components/ui/button"

Output the complete component code in a single code block.
Use this format:

\`\`\`tsx
"use client"

import { Button } from "../../../components/ui/button"
import { Card } from "../../../components/ui/card"
// ... other imports

export function GeneratedComponent() {
  // Component implementation
}
\`\`\`

Also generate Jotai atoms for state management in a separate code block:

\`\`\`tsx
import { atomWithStorage } from "jotai/utils"
import { atom } from "jotai"

export const componentStateAtom = atomWithStorage(...)
\`\`\``

  // Get MCP config
  const mcpConfig = await getMergedMcpConfig()
  const sdkMcpServers = toSdkMcpConfigs(await injectAllStoredCredentials(mcpConfig.mcpServers))

  // Create the Claude query
  const fullPrompt = `${systemPrompt}

User request: ${prompt}

Generate the component now. Output the component code first, then the atoms code.`

  const query = sdk.query({
    prompt: fullPrompt,
    options: {
      cwd: app.getAppPath(),
      mcpServers: Object.keys(sdkMcpServers).length > 0 ? sdkMcpServers : undefined,
      systemPrompt: {
        type: "preset" as const,
        preset: "claude_code" as const,
      },
      env: buildClaudeEnv(),
      permissionMode: "bypassPermissions" as const,
      allowDangerouslySkipPermissions: true,
      maxTurns: 3,
    },
  })

  let output = ""
  let componentCode = ""
  let atomsCode = ""

  // Collect output from streaming
  for await (const msg of query) {
    if (msg.type === "system") {
      output += msg.output
    }
    if (msg.type === "assistant" && msg.content) {
      output += msg.content

      // Extract component code block
      const componentMatch = msg.content.match(/```tsx\n([\s\S]*?)\n```/)
      if (componentMatch && !componentCode) {
        componentCode = componentMatch[1]
      } else if (componentMatch && componentCode && !atomsCode) {
        atomsCode = componentMatch[1]
      }
    }
  }

  // If no code block found, use full output
  if (!componentCode && output) {
    componentCode = output
  }

  // Generate a unique name based on prompt with timestamp hash
  const componentName = generateComponentName(prompt)

  // Save to database
  const db = getDatabase()
  const id = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`

  await db.insert(openuiComponents).values({
    id,
    name: componentName,
    description: `AI-generated component: ${prompt.slice(0, 100)}`,
    code: componentCode,
    atomsCode: atomsCode || null,
    prompt,
    projectId,
    chatId: chatId || null,
    isInstalled: false,
    metadata: JSON.stringify({
      usedComponents: componentLibrary.map((c) => c.name),
      complexity: "medium",
    }),
  })

  return {
    output: output || "Component generated",
    component: {
      id,
      name: componentName,
      code: componentCode,
      atomsCode: atomsCode || undefined,
      description: `AI-generated component: ${prompt.slice(0, 100)}`,
      prompt,
      projectId,
      chatId,
      isInstalled: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
  }
}

/**
 * Get all generated components for a project
 */
async function getProjectComponents(
  projectId: string
): Promise<
  Array<{
    id: string
    name: string
    code: string
    atomsCode?: string
    description?: string
    prompt: string
    projectId: string
    chatId?: string
    isInstalled: boolean
    createdAt: number
    updatedAt: number
  }
>
> {
  const db = getDatabase()

  const results = await db
    .select()
    .from(openuiComponents)
    .where(eq(openuiComponents.projectId, projectId))
    .orderBy(desc(openuiComponents.createdAt))

  return results.map((row) => ({
    id: row.id,
    name: row.name,
    code: row.code,
    atomsCode: row.atomsCode || undefined,
    description: row.description || undefined,
    prompt: row.prompt,
    projectId: row.projectId,
    chatId: row.chatId || undefined,
    isInstalled: row.isInstalled,
    createdAt: row.createdAt.getTime(),
    updatedAt: row.updatedAt.getTime(),
  }))
}

/**
 * Install a component to the project's filesystem
 */
async function installComponent(
  componentId: string
): Promise<{ success: boolean; path?: string }> {
  const db = getDatabase()

  // Get component from database
  const [component] = await db
    .select()
    .from(openuiComponents)
    .where(eq(openuiComponents.id, componentId))

  if (!component) {
    return { success: false }
  }

  // Get project path
  const [project] = await db
    .select()
    .from(projects)
    .where(eq(projects.id, component.projectId))

  if (!project) {
    return { success: false }
  }

  // Validate component code before writing
  if (!validateComponentCode(component.code)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Generated code doesn't appear to be a valid React component. The code may be corrupted or incomplete."
    })
  }

  // Create components directory in project
  const componentsDir = path.join(project.path, ".claw", "components")
  await fs.mkdir(componentsDir, { recursive: true })

  // Write component file
  const componentPath = path.join(componentsDir, `${component.name}.tsx`)
  await fs.writeFile(componentPath, component.code)

  // Write atoms file if exists
  if (component.atomsCode) {
    const atomsPath = path.join(componentsDir, `${component.name}.atoms.ts`)
    await fs.writeFile(atomsPath, component.atomsCode)
  }

  // Update database
  await db
    .update(openuiComponents)
    .set({
      isInstalled: true,
      filePath: componentPath,
      updatedAt: new Date(),
    })
    .where(eq(openuiComponents.id, componentId))

  return { success: true, path: componentPath }
}

export const openuiRouter = router({
  /**
   * Get registered Claw UI components for use in OpenUI generation
   */
  getRegisteredComponents: publicProcedure.query(async () => {
    return await getRegisteredClawComponents()
  }),

  /**
   * Generate a UI component from a natural language prompt
   */
  generate: publicProcedure
    .input(
      z.object({
        prompt: z.string(),
        projectId: z.string(),
        chatId: z.string().optional(),
        componentLibrary: z.array(
          z.object({
            name: z.string(),
            description: z.string().optional(),
          })
        ),
      })
    )
    .mutation(async ({ input }) => {
      return await generateOpenUIComponent(
        input.prompt,
        input.projectId,
        input.chatId,
        input.componentLibrary
      )
    }),

  /**
   * Get all generated components for a project
   */
  getProjectComponents: publicProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ input }) => {
      return await getProjectComponents(input.projectId)
    }),

  /**
   * Get all projects that have OpenUI components
   */
  getProjectsWithComponents: publicProcedure.query(async () => {
    const db = getDatabase()

    // Get distinct projects that have OpenUI components
    const results = await db
      .selectDistinct({
        projectId: openuiComponents.projectId,
        projectName: projects.name,
        projectPath: projects.path,
      })
      .from(openuiComponents)
      .innerJoin(projects, eq(openuiComponents.projectId, projects.id))
      .orderBy(projects.name)

    return results.map((row) => ({
      id: row.projectId,
      name: row.projectName,
      path: row.projectPath,
    }))
  }),

  /**
   * Install a component to the project's filesystem
   */
  installComponent: publicProcedure
    .input(z.object({ componentId: z.string() }))
    .mutation(async ({ input }) => {
      return await installComponent(input.componentId)
    }),

  /**
   * Delete a generated component
   */
  deleteComponent: publicProcedure
    .input(z.object({ componentId: z.string() }))
    .mutation(async ({ input }) => {
      const db = getDatabase()

      // Get component to find file path
      const [component] = await db
        .select()
        .from(openuiComponents)
        .where(eq(openuiComponents.id, input.componentId))

      // Delete files if they exist
      if (component?.filePath) {
        await fs.unlink(component.filePath).catch(() => {})
        const atomsPath = component.filePath.replace(".tsx", ".atoms.ts")
        await fs.unlink(atomsPath).catch(() => {})
      }

      // Delete from database
      await db.delete(openuiComponents).where(eq(openuiComponents.id, input.componentId))

      return { success: true }
    }),

  /**
   * Get a single component by ID
   */
  getComponent: publicProcedure
    .input(z.object({ componentId: z.string() }))
    .query(async ({ input }) => {
      const db = getDatabase()
      const [component] = await db
        .select()
        .from(openuiComponents)
        .where(eq(openuiComponents.id, input.componentId))

      return component || null
    }),

  /**
   * Get database schema info for ER diagram viewer
   */
  getDatabaseSchema: publicProcedure.query(async () => {
    const db = getDatabase()

    // Get table info from SQLite
    const tables = await db.all("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '__drizzle%'")

    const schema = {
      tables: [] as Array<{
        name: string
        columns: Array<{
          name: string
          type: string
          primaryKey: boolean
          nullable: boolean
          foreignKey: boolean
        }>
      }>,
      relationships: [] as Array<{
        fromTable: string
        toTable: string
        constraint: string
      }>,
    }

    // Get columns for each table
    for (const table of tables) {
      const columns = await db.all(`PRAGMA table_info(${table.name})`)
      const foreignKeys = await db.all(`PRAGMA foreign_key_list(${table.name})`)

      const columnInfo = columns.map((col: any) => ({
        name: col.name,
        type: col.type,
        primaryKey: !!col.pk,
        nullable: !col.notnull,
        foreignKey: foreignKeys.some((fk: any) => fk.from === col.name),
      }))

      schema.tables.push({
        name: table.name as string,
        columns: columnInfo,
      })

      // Add relationships
      for (const fk of foreignKeys) {
        schema.relationships.push({
          fromTable: table.name as string,
          toTable: fk.table as string,
          constraint: `${fk.from} -> ${fk.to}`,
        })
      }
    }

    return schema
  }),

  /**
   * Get file tree for source code browser
   */
  getFileTree: publicProcedure
    .input(z.object({ path: z.string() }))
    .query(async ({ input }) => {
      const baseDir = input.path

      async function readDir(dirPath: string, depth = 0): Promise<Array<{
        name: string
        path: string
        type: "file" | "directory"
        children?: Array<{ name: string; path: string; type: "file" | "directory"; children?: any[] }>
      }>> {
        if (depth > 3) return [] // Limit depth to avoid too many files

        const entries = await fs.readdir(dirPath, { withFileTypes: true })
        const result = []

        for (const entry of entries) {
          if (entry.name.startsWith(".")) continue // Skip hidden files
          if (entry.name === "node_modules") continue // Skip node_modules

          const fullPath = path.join(dirPath, entry.name)

          if (entry.isDirectory()) {
            const children = await readDir(fullPath, depth + 1)
            result.push({
              name: entry.name,
              path: fullPath,
              type: "directory",
              children,
            })
          } else if (entry.isFile()) {
            result.push({
              name: entry.name,
              path: fullPath,
              type: "file",
            })
          }
        }

        return result
      }

      return await readDir(baseDir)
    }),
})
