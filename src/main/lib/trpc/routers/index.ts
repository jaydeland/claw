import { router } from "../index"
import { projectsRouter } from "./projects"
import { chatsRouter } from "./chats"
import { claudeRouter } from "./claude"
import { claudeCodeRouter } from "./claude-code"
import { claudeSettingsRouter } from "./claude-settings"
import { externalRouter } from "./external"
import { filesRouter } from "./files"
import { debugRouter } from "./debug"
import { skillsRouter } from "./skills"
import { agentsRouter } from "./agents"
import { workflowsRouter } from "./workflows"
import { mcpRouter } from "./mcp"
import { worktreeConfigRouter } from "./worktree-config"
import { worktreesRouter } from "./worktrees"
import { commandsRouter } from "./commands"
import { awsSsoRouter } from "./aws-sso"
import { configManagementRouter } from "./config-management"
import { tasksRouter } from "./tasks"
import { settingsExportRouter } from "./settings-export"
import { loadedContextRouter } from "./loaded-context"
import { analyzerRouter } from "./analyzer"
import { transientChatRouter } from "./transient-chat"
import { githubRouter } from "./github"
import { messagingRouter } from "./messaging"
import { whatsappRouter } from "./whatsapp"
import { claudeConfigRouter } from "./claude-config"
import { hooksRouter } from "./hooks"
import { projectSettingsRouter } from "./project-settings"
import { gitnexusRouter } from "./gitnexus"
import { openuiRouter } from "./openui"
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
    external: externalRouter,
    files: filesRouter,
    debug: debugRouter,
    skills: skillsRouter,
    agents: agentsRouter,
    workflows: workflowsRouter,
    mcp: mcpRouter,
    worktreeConfig: worktreeConfigRouter,
    worktrees: worktreesRouter,
    commands: commandsRouter,
    awsSso: awsSsoRouter,
    configManagement: configManagementRouter,
    tasks: tasksRouter,
    settingsExport: settingsExportRouter,
    loadedContext: loadedContextRouter,
    analyzer: analyzerRouter,
    transientChat: transientChatRouter,
    github: githubRouter,
    messaging: messagingRouter,
    whatsapp: whatsappRouter,
    claudeConfig: claudeConfigRouter,
    hooks: hooksRouter,
    projectSettings: projectSettingsRouter,
    gitnexus: gitnexusRouter,
    openui: openuiRouter,
    // Git operations - named "changes" to match Superset API
    changes: createGitRouter(),
  })
}

/**
 * Export the router type for client usage
 */
export type AppRouter = ReturnType<typeof createAppRouter>
