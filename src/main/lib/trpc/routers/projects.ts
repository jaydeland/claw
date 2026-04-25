import { z } from "zod"
import { router, publicProcedure } from "../index"
import { getDatabase, projects, chats } from "../../db"
import { eq, desc, ne } from "drizzle-orm"
import { dialog, BrowserWindow, app } from "electron"
import { basename, join } from "path"
import { exec } from "node:child_process"
import { promisify } from "node:util"
import { existsSync } from "node:fs"
import { mkdir } from "node:fs/promises"
import { getGitRemoteInfo } from "../../git"

const execAsync = promisify(exec)


export const projectsRouter = router({
  /**
   * List all projects
   */
  list: publicProcedure.query(() => {
    const db = getDatabase()
    return db
      .select()
      .from(projects)
      .where(ne(projects.path, "__transient__"))
      .orderBy(desc(projects.updatedAt))
      .all()
  }),

  /**
   * Get a single project by ID
   */
  get: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(({ input }) => {
      const db = getDatabase()
      return db.select().from(projects).where(eq(projects.id, input.id)).get()
    }),

  /**
   * Get or create the Home workspace
   */
  getHomeWorkspace: publicProcedure.query(() => {
    const db = getDatabase()
    const homeDir = app.getPath("home")

    // Try to find existing Home workspace
    const existing = db
      .select()
      .from(projects)
      .where(eq(projects.name, "Home"))
      .get()

    if (existing) {
      return existing
    }

    // Create Home workspace if it doesn't exist
    return db
      .insert(projects)
      .values({
        name: "Home",
        path: homeDir,
        gitRemoteUrl: null,
        gitProvider: null,
        gitOwner: null,
        gitRepo: null,
      })
      .returning()
      .get()
  }),

  /**
   * Open folder picker and create project
   */
  openFolder: publicProcedure.mutation(async ({ ctx }) => {
    console.log('[Projects] openFolder called')
    const window = ctx.getWindow?.() ?? BrowserWindow.getFocusedWindow()

    if (!window) {
      console.error("[Projects] No window available for folder dialog")
      return null
    }

    // Ensure window is focused before showing dialog (fixes first-launch timing issue on macOS)
    if (!window.isFocused()) {
      console.log("[Projects] Window not focused, focusing before dialog...")
      window.focus()
      // Small delay to ensure focus is applied by the OS
      await new Promise((resolve) => setTimeout(resolve, 100))
    }

    console.log('[Projects] Showing folder dialog...')
    const result = await dialog.showOpenDialog(window, {
      properties: ["openDirectory", "createDirectory"],
      title: "Select Project Folder",
      buttonLabel: "Open Project",
    })

    console.log('[Projects] Dialog result:', { canceled: result.canceled, pathCount: result.filePaths.length })

    if (result.canceled || result.filePaths.length === 0) {
      console.log('[Projects] Dialog canceled or no path selected')
      return null
    }

    const folderPath = result.filePaths[0]!
    const folderName = basename(folderPath)
    console.log('[Projects] Selected folder:', { folderName, folderPath })

    // Get git remote info
    const gitInfo = await getGitRemoteInfo(folderPath)

    const db = getDatabase()

    // Check if project already exists
    const existing = db
      .select()
      .from(projects)
      .where(eq(projects.path, folderPath))
      .get()

    if (existing) {
      // Update the updatedAt timestamp and git info (in case remote changed)
      const updatedProject = db
        .update(projects)
        .set({
          updatedAt: new Date(),
          gitRemoteUrl: gitInfo.remoteUrl,
          gitProvider: gitInfo.provider,
          gitOwner: gitInfo.owner,
          gitRepo: gitInfo.repo,
        })
        .where(eq(projects.id, existing.id))
        .returning()
        .get()

      return updatedProject
    }

    // Create new project with git info
    const newProject = db
      .insert(projects)
      .values({
        name: folderName,
        path: folderPath,
        gitRemoteUrl: gitInfo.remoteUrl,
        gitProvider: gitInfo.provider,
        gitOwner: gitInfo.owner,
        gitRepo: gitInfo.repo,
      })
      .returning()
      .get()

    return newProject
  }),

  /**
   * Create a project from a known path
   */
  create: publicProcedure
    .input(z.object({ path: z.string(), name: z.string().optional() }))
    .mutation(async ({ input }) => {
      const db = getDatabase()
      const name = input.name || basename(input.path)

      // Check if project already exists
      const existing = db
        .select()
        .from(projects)
        .where(eq(projects.path, input.path))
        .get()

      if (existing) {
        return existing
      }

      // Get git remote info
      const gitInfo = await getGitRemoteInfo(input.path)

      return db
        .insert(projects)
        .values({
          name,
          path: input.path,
          gitRemoteUrl: gitInfo.remoteUrl,
          gitProvider: gitInfo.provider,
          gitOwner: gitInfo.owner,
          gitRepo: gitInfo.repo,
          })
        .returning()
        .get()
    }),

  /**
   * Rename a project
   */
  rename: publicProcedure
    .input(z.object({ id: z.string(), name: z.string().min(1) }))
    .mutation(({ input }) => {
      const db = getDatabase()
      return db
        .update(projects)
        .set({ name: input.name, updatedAt: new Date() })
        .where(eq(projects.id, input.id))
        .returning()
        .get()
    }),

  /**
   * Delete a project and all its chats
   */
  delete: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ input }) => {
      const db = getDatabase()
      return db
        .delete(projects)
        .where(eq(projects.id, input.id))
        .returning()
        .get()
    }),

  /**
   * Refresh git info for a project (in case remote changed)
   */
  refreshGitInfo: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => {
      const db = getDatabase()

      // Get project
      const project = db
        .select()
        .from(projects)
        .where(eq(projects.id, input.id))
        .get()

      if (!project) {
        return null
      }

      // Get fresh git info
      const gitInfo = await getGitRemoteInfo(project.path)

      // Update project
      return db
        .update(projects)
        .set({
          updatedAt: new Date(),
          gitRemoteUrl: gitInfo.remoteUrl,
          gitProvider: gitInfo.provider,
          gitOwner: gitInfo.owner,
          gitRepo: gitInfo.repo,
        })
        .where(eq(projects.id, input.id))
        .returning()
        .get()
    }),

  /**
   * Clone a GitHub repo and create a project
   */
  cloneFromGitHub: publicProcedure
    .input(z.object({ repoUrl: z.string() }))
    .mutation(async ({ input }) => {
      const { repoUrl } = input

      // Parse the URL to extract owner/repo
      let owner: string | null = null
      let repo: string | null = null

      // Match HTTPS format: https://github.com/owner/repo
      const httpsMatch = repoUrl.match(
        /https?:\/\/github\.com\/([^/]+)\/([^/]+)/,
      )
      if (httpsMatch) {
        owner = httpsMatch[1] || null
        repo = httpsMatch[2]?.replace(/\.git$/, "") || null
      }

      // Match SSH format: git@github.com:owner/repo
      const sshMatch = repoUrl.match(/git@github\.com:([^/]+)\/(.+)/)
      if (sshMatch) {
        owner = sshMatch[1] || null
        repo = sshMatch[2]?.replace(/\.git$/, "") || null
      }

      // Match short format: owner/repo
      const shortMatch = repoUrl.match(/^([^/]+)\/([^/]+)$/)
      if (shortMatch) {
        owner = shortMatch[1] || null
        repo = shortMatch[2]?.replace(/\.git$/, "") || null
      }

      if (!owner || !repo) {
        throw new Error("Invalid GitHub URL or repo format")
      }

      // Clone to ~/.21st/repos/{owner}/{repo}
      const homePath = app.getPath("home")
      const reposDir = join(homePath, ".21st", "repos", owner)
      const clonePath = join(reposDir, repo)

      // Check if already cloned
      if (existsSync(clonePath)) {
        // Project might already exist in DB
        const db = getDatabase()
        const existing = db
          .select()
          .from(projects)
          .where(eq(projects.path, clonePath))
          .get()

        if (existing) {
          return existing
        }

        // Create project for existing clone
        const gitInfo = await getGitRemoteInfo(clonePath)
        const newProject = db
          .insert(projects)
          .values({
            name: repo,
            path: clonePath,
            gitRemoteUrl: gitInfo.remoteUrl,
            gitProvider: gitInfo.provider,
            gitOwner: gitInfo.owner,
            gitRepo: gitInfo.repo,
              })
          .returning()
          .get()

        return newProject
      }

      // Create repos directory
      await mkdir(reposDir, { recursive: true })

      // Clone the repo
      const cloneUrl = `https://github.com/${owner}/${repo}.git`
      await execAsync(`git clone "${cloneUrl}" "${clonePath}"`)

      // Get git info and create project
      const db = getDatabase()
      const gitInfo = await getGitRemoteInfo(clonePath)

      const newProject = db
        .insert(projects)
        .values({
          name: repo,
          path: clonePath,
          gitRemoteUrl: gitInfo.remoteUrl,
          gitProvider: gitInfo.provider,
          gitOwner: gitInfo.owner,
          gitRepo: gitInfo.repo,
          })
        .returning()
        .get()

      return newProject
    }),

  /**
   * Get start commands for a project
   * Returns array of commands that run when a new chat terminal is created
   */
  getStartCommands: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(({ input }) => {
      const db = getDatabase()
      const project = db
        .select()
        .from(projects)
        .where(eq(projects.id, input.id))
        .get()

      if (!project) {
        return { commands: [] }
      }

      try {
        const commands = [] as string[]
        return { commands: Array.isArray(commands) ? commands : [] }
      } catch {
        return { commands: [] }
      }
    }),

  /**
   * Update start commands for a project
   * Commands are stored as JSON array and run when a new chat terminal is created
   */
  updateStartCommands: publicProcedure
    .input(z.object({
      id: z.string(),
      commands: z.array(z.string()),
    }))
    .mutation(({ input }) => {
      const db = getDatabase()

      // Filter out empty commands
      const filteredCommands = input.commands.filter(cmd => cmd.trim())

      return db
        .update(projects)
        .set({

          updatedAt: new Date(),
        })
        .where(eq(projects.id, input.id))
        .returning()
        .get()
    }),

  /**
   * Get git status for a project (current branch, repo info)
   * If chatId is provided, returns the branch from that chat's worktree
   */
  getGitStatus: publicProcedure
    .input(z.object({
      id: z.string(),
      chatId: z.string().optional(),
    }))
    .query(async ({ input }) => {
      const db = getDatabase()

      // Get project
      const project = db
        .select()
        .from(projects)
        .where(eq(projects.id, input.id))
        .get()

      if (!project) {
        return null
      }

      let currentBranch: string | null = null
      let workingPath = project.path

      // If chatId provided, check if it has a worktree
      if (input.chatId) {
        const chat = db
          .select()
          .from(chats)
          .where(eq(chats.id, input.chatId))
          .get()

        if (chat?.worktreePath && existsSync(chat.worktreePath)) {
          // Use worktree path and branch
          workingPath = chat.worktreePath
          currentBranch = chat.branch
        }
      }

      // Get current branch from git if not already set from chat
      if (!currentBranch) {
        try {
          const { stdout } = await execAsync("git rev-parse --abbrev-ref HEAD", {
            cwd: workingPath,
          })
          currentBranch = stdout.trim()
        } catch {
          // Not a git repo or error getting branch
        }
      }

      return {
        projectId: project.id,
        projectName: project.name,
        projectPath: project.path,
        gitOwner: project.gitOwner,
        gitRepo: project.gitRepo,
        gitProvider: project.gitProvider,
        gitRemoteUrl: project.gitRemoteUrl,
        currentBranch,
        isWorktree: workingPath !== project.path,
      }
    }),
})
