import { z } from "zod"
import { router, publicProcedure } from "../index"
import { exec } from "node:child_process"
import { promisify } from "node:util"

const execAsync = promisify(exec)

/**
 * Check if gh CLI is available and authenticated
 */
async function checkGhAvailable(): Promise<{ available: boolean; error?: string }> {
  try {
    await execAsync("gh auth status")
    return { available: true }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (message.includes("not logged in")) {
      return { available: false, error: "Not logged in to GitHub CLI. Run 'gh auth login' first." }
    }
    if (message.includes("not found") || message.includes("command not found")) {
      return { available: false, error: "GitHub CLI (gh) not installed. Install it from https://cli.github.com" }
    }
    return { available: false, error: message }
  }
}

/**
 * Parse PR data from gh CLI output
 */
function parsePRs(output: string): Array<{
  number: number
  title: string
  state: string
  author: string
  headBranch: string
  baseBranch: string
  draft: boolean
}> {
  try {
    const prs = JSON.parse(output)
    return prs.map((pr: any) => ({
      number: pr.number,
      title: pr.title,
      state: pr.state,
      author: pr.author?.login || "unknown",
      headBranch: pr.headRefName,
      baseBranch: pr.baseRefName,
      draft: pr.isDraft || false,
    }))
  } catch {
    return []
  }
}

/**
 * Parse issue data from gh CLI output
 */
function parseIssues(output: string): Array<{
  number: number
  title: string
  state: string
  author: string
  labels: string[]
}> {
  try {
    const issues = JSON.parse(output)
    return issues.map((issue: any) => ({
      number: issue.number,
      title: issue.title,
      state: issue.state,
      author: issue.author?.login || "unknown",
      labels: issue.labels?.map((l: any) => l.name) || [],
    }))
  } catch {
    return []
  }
}

/**
 * Get the GitHub remote URL from a local repository
 */
async function getGitHubRemote(projectPath: string): Promise<{ owner: string; repo: string } | null> {
  try {
    const { stdout } = await execAsync("git remote get-url origin", { cwd: projectPath })
    const url = stdout.trim()

    // Parse various GitHub URL formats
    // git@github.com:owner/repo.git
    // https://github.com/owner/repo.git
    // https://github.com/owner/repo
    const match = url.match(/github\.com[/:]([^/]+)\/([^/.]+)/)
    if (match) {
      return { owner: match[1], repo: match[2] }
    }
    return null
  } catch {
    return null
  }
}

export const githubRouter = router({
  /**
   * Check if GitHub CLI is available and authenticated
   */
  checkAuth: publicProcedure.query(async () => {
    return checkGhAvailable()
  }),

  /**
   * Get repository info from local git remote
   */
  getRepoInfo: publicProcedure
    .input(z.object({ projectPath: z.string() }))
    .query(async ({ input }) => {
      const remote = await getGitHubRemote(input.projectPath)
      if (!remote) {
        return { success: false, error: "No GitHub remote found" }
      }
      return { success: true, ...remote }
    }),

  /**
   * Fetch pull requests for a repository
   */
  getPRs: publicProcedure
    .input(
      z.object({
        projectPath: z.string(),
        state: z.enum(["open", "closed", "all"]).default("open"),
        limit: z.number().min(1).max(100).default(30),
      })
    )
    .query(async ({ input }) => {
      const ghCheck = await checkGhAvailable()
      if (!ghCheck.available) {
        return { success: false, error: ghCheck.error, prs: [] }
      }

      const remote = await getGitHubRemote(input.projectPath)
      if (!remote) {
        return { success: false, error: "No GitHub remote found", prs: [] }
      }

      try {
        const { stdout } = await execAsync(
          `gh pr list --repo ${remote.owner}/${remote.repo} --state ${input.state} --limit ${input.limit} --json number,title,state,author,headRefName,baseRefName,isDraft`,
          { cwd: input.projectPath }
        )
        const prs = parsePRs(stdout)
        return { success: true, prs }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return { success: false, error: message, prs: [] }
      }
    }),

  /**
   * Fetch issues for a repository
   */
  getIssues: publicProcedure
    .input(
      z.object({
        projectPath: z.string(),
        state: z.enum(["open", "closed", "all"]).default("open"),
        limit: z.number().min(1).max(100).default(30),
      })
    )
    .query(async ({ input }) => {
      const ghCheck = await checkGhAvailable()
      if (!ghCheck.available) {
        return { success: false, error: ghCheck.error, issues: [] }
      }

      const remote = await getGitHubRemote(input.projectPath)
      if (!remote) {
        return { success: false, error: "No GitHub remote found", issues: [] }
      }

      try {
        const { stdout } = await execAsync(
          `gh issue list --repo ${remote.owner}/${remote.repo} --state ${input.state} --limit ${input.limit} --json number,title,state,author,labels`,
          { cwd: input.projectPath }
        )
        const issues = parseIssues(stdout)
        return { success: true, issues }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return { success: false, error: message, issues: [] }
      }
    }),

  /**
   * Fetch both PRs and issues for a repository
   */
  getData: publicProcedure
    .input(
      z.object({
        projectPath: z.string(),
      })
    )
    .query(async ({ input }) => {
      const ghCheck = await checkGhAvailable()
      if (!ghCheck.available) {
        return { success: false, error: ghCheck.error, prs: [], issues: [] }
      }

      const remote = await getGitHubRemote(input.projectPath)
      if (!remote) {
        return { success: false, error: "No GitHub remote found", prs: [], issues: [], isGitHub: false }
      }

      try {
        // Fetch both in parallel
        const [prsResult, issuesResult] = await Promise.all([
          execAsync(
            `gh pr list --repo ${remote.owner}/${remote.repo} --state open --limit 30 --json number,title,state,author,headRefName,baseRefName,isDraft`,
            { cwd: input.projectPath }
          ).then(({ stdout }) => parsePRs(stdout)).catch(() => []),
          execAsync(
            `gh issue list --repo ${remote.owner}/${remote.repo} --state open --limit 30 --json number,title,state,author,labels`,
            { cwd: input.projectPath }
          ).then(({ stdout }) => parseIssues(stdout)).catch(() => []),
        ])

        return {
          success: true,
          prs: prsResult,
          issues: issuesResult,
          owner: remote.owner,
          repo: remote.repo,
          isGitHub: true,
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return { success: false, error: message, prs: [], issues: [] }
      }
    }),
})