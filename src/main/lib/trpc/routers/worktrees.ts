import { z } from "zod"
import { router, publicProcedure } from "../index"
import { getDatabase, projects, chats } from "../../db"
import { eq } from "drizzle-orm"
import simpleGit from "simple-git"
import { removeWorktree } from "../../git/worktree"

/**
 * Parse the output of `git worktree list --porcelain`.
 * Blocks are separated by blank lines; the first block is the main repo.
 */
function parseWorktreePorcelain(
  output: string,
  mainRepoPath: string,
): Array<{ path: string; branch: string | null }> {
  const blocks = output.trim().split(/\n\n+/)
  const results: Array<{ path: string; branch: string | null }> = []

  for (const block of blocks) {
    const lines = block.trim().split("\n")
    let wtPath = ""
    let branch: string | null = null

    for (const line of lines) {
      if (line.startsWith("worktree ")) {
        wtPath = line.slice("worktree ".length).trim()
      } else if (line.startsWith("branch ")) {
        // refs/heads/my-feature -> my-feature
        const ref = line.slice("branch ".length).trim()
        branch = ref.replace(/^refs\/heads\//, "")
      }
    }

    // Skip the main repo entry
    if (wtPath && wtPath !== mainRepoPath) {
      results.push({ path: wtPath, branch })
    }
  }

  return results
}

export const worktreesRouter = router({
  /**
   * List all git worktrees for a project (excludes the main repo itself).
   */
  list: publicProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ input }) => {
      const db = getDatabase()
      const project = db
        .select()
        .from(projects)
        .where(eq(projects.id, input.projectId))
        .get()

      if (!project) return []

      try {
        const git = simpleGit(project.path)
        const isRepo = await git.checkIsRepo()
        if (!isRepo) return []

        const output = await git.raw(["worktree", "list", "--porcelain"])
        return parseWorktreePorcelain(output, project.path)
      } catch {
        return []
      }
    }),

  /**
   * Delete a git worktree by path.
   * Looks up the main repo path via the chats table, falling back to reading
   * `git worktree list` from within the worktree itself.
   */
  delete: publicProcedure
    .input(z.object({ path: z.string() }))
    .mutation(async ({ input }) => {
      const db = getDatabase()

      // Try to find the main repo path via the DB
      let mainRepoPath: string | null = null

      const chat = db
        .select({ projectId: chats.projectId })
        .from(chats)
        .where(eq(chats.worktreePath, input.path))
        .get()

      if (chat) {
        const project = db
          .select({ path: projects.path })
          .from(projects)
          .where(eq(projects.id, chat.projectId))
          .get()
        mainRepoPath = project?.path ?? null
      }

      // Fallback: derive main repo from the worktree's own `git worktree list`
      if (!mainRepoPath) {
        try {
          const git = simpleGit(input.path)
          const output = await git.raw(["worktree", "list", "--porcelain"])
          const firstLine = output.trim().split("\n")[0]
          if (firstLine.startsWith("worktree ")) {
            mainRepoPath = firstLine.slice("worktree ".length).trim()
          }
        } catch {
          return { success: false, error: "Could not determine main repository path" }
        }
      }

      if (!mainRepoPath) {
        return { success: false, error: "Could not determine main repository path" }
      }

      return removeWorktree(mainRepoPath, input.path)
    }),
})
