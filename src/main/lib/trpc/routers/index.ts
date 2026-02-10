import { router } from "../index"
import { projectsRouter } from "./projects"
import { chatsRouter } from "./chats"
import { claudeRouter } from "./claude"
import { claudeCodeRouter } from "./claude-code"
import { claudeSettingsRouter } from "./claude-settings"
import { terminalRouter } from "./terminal"
import { externalRouter } from "./external"
import { filesRouter } from "./files"
import { debugRouter } from "./debug"
import { skillsRouter } from "./skills"
import { agentsRouter } from "./agents"
import { workflowsRouter } from "./workflows"
import { mcpRouter } from "./mcp"
import { worktreeConfigRouter } from "./worktree-config"
import { commandsRouter } from "./commands"
import { awsSsoRouter } from "./aws-sso"
import { configManagementRouter } from "./config-management"
import { clustersRouter } from "./clusters"
import { tasksRouter } from "./tasks"
import { settingsExportRouter } from "./settings-export"
import { gsdRouter } from "./gsd"
import { devspaceRouter } from "./devspace"
import { loadedContextRouter } from "./loaded-context"
import { createGitRouter } from "../../git"
import { BrowserWindow } from "electron"

/**
 * Create the main app router
 * Uses getter pattern to avoid stale window references
 */
export function createAppRouter(getWindow: () => BrowserWindow | null) {
  return router({
    projects: projectsRouter,
    chats: chatsRouter,
    claude: claudeRouter,
    claudeCode: claudeCodeRouter,
    claudeSettings: claudeSettingsRouter,
    terminal: terminalRouter,
    external: externalRouter,
    files: filesRouter,
    debug: debugRouter,
    skills: skillsRouter,
    agents: agentsRouter,
    workflows: workflowsRouter,
    mcp: mcpRouter,
    worktreeConfig: worktreeConfigRouter,
    commands: commandsRouter,
    awsSso: awsSsoRouter,
    configManagement: configManagementRouter,
    clusters: clustersRouter,
    tasks: tasksRouter,
    settingsExport: settingsExportRouter,
    gsd: gsdRouter,
    devspace: devspaceRouter,
    loadedContext: loadedContextRouter,
    // Git operations - named "changes" to match Superset API
    changes: createGitRouter(),
  })
}

/**
 * Export the router type for client usage
 */
export type AppRouter = ReturnType<typeof createAppRouter>
