import { z } from "zod"
import { router, publicProcedure } from "../index"
import { exec } from "node:child_process"
import { promisify } from "node:util"
import * as fs from "node:fs"
import * as path from "node:path"
import * as os from "node:os"
import { safeStorage, shell } from "electron"
import { eq } from "drizzle-orm"
import { getDatabase, chats, subChats, githubSettings } from "../../db"
import { createId } from "../../db/utils"

const execAsync = promisify(exec)

/**
 * Encrypt text using Electron's safeStorage
 */
function encryptText(text: string): string {
  if (!safeStorage.isEncryptionAvailable()) {
    console.warn("[github] Encryption not available, storing as base64")
    return Buffer.from(text).toString("base64")
  }
  return safeStorage.encryptString(text).toString("base64")
}

/**
 * Decrypt text using Electron's safeStorage
 */
function decryptText(encrypted: string): string | null {
  if (!encrypted) return null
  try {
    if (!safeStorage.isEncryptionAvailable()) {
      return Buffer.from(encrypted, "base64").toString("utf-8")
    }
    const buffer = Buffer.from(encrypted, "base64")
    return safeStorage.decryptString(buffer)
  } catch (error) {
    console.error("[github] Failed to decrypt text:", error)
    return null
  }
}

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

  /**
   * Fetch full PR detail including body, commits, files changed, comments, and diff
   */
  getPRDetail: publicProcedure
    .input(z.object({ projectPath: z.string(), prNumber: z.number() }))
    .query(async ({ input }) => {
      const ghCheck = await checkGhAvailable()
      if (!ghCheck.available) return { success: false as const, error: ghCheck.error }

      const remote = await getGitHubRemote(input.projectPath)
      if (!remote) return { success: false as const, error: "No GitHub remote found" }

      try {
        const [prResult, diffResult, inlineCommentsResult] = await Promise.all([
          execAsync(
            `gh pr view ${input.prNumber} --repo ${remote.owner}/${remote.repo} --json number,title,body,state,author,labels,headRefName,baseRefName,isDraft,commits,files,comments,reviews,additions,deletions,changedFiles,createdAt,updatedAt`,
            { cwd: input.projectPath }
          ),
          execAsync(
            `gh pr diff ${input.prNumber} --repo ${remote.owner}/${remote.repo}`,
            { cwd: input.projectPath }
          ).catch(() => ({ stdout: "" })),
          // Inline review comments (code-level) live at the REST pulls/comments endpoint
          execAsync(
            `gh api repos/${remote.owner}/${remote.repo}/pulls/${input.prNumber}/comments --paginate`,
            { cwd: input.projectPath }
          ).catch(() => ({ stdout: "[]" })),
        ])

        const pr = JSON.parse(prResult.stdout)
        const inlineComments: any[] = JSON.parse(inlineCommentsResult.stdout || "[]")

        return {
          success: true as const,
          pr: {
            number: pr.number as number,
            title: pr.title as string,
            body: (pr.body as string) || "",
            state: pr.state as string,
            author: (pr.author?.login as string) || "unknown",
            labels: ((pr.labels || []) as any[]).map((l: any) => l.name as string),
            headBranch: pr.headRefName as string,
            baseBranch: pr.baseRefName as string,
            draft: (pr.isDraft as boolean) || false,
            additions: (pr.additions as number) || 0,
            deletions: (pr.deletions as number) || 0,
            changedFiles: (pr.changedFiles as number) || 0,
            createdAt: pr.createdAt as string,
            updatedAt: pr.updatedAt as string,
            commits: ((pr.commits || []) as any[]).map((c: any) => ({
              sha: ((c.oid || c.sha || "") as string).slice(0, 7),
              message: (c.messageHeadline || c.message || "") as string,
              author: (c.authors?.[0]?.login || c.author?.login || "unknown") as string,
              date: (c.committedDate || c.date || "") as string,
            })),
            files: ((pr.files || []) as any[]).map((f: any) => ({
              path: f.path as string,
              additions: (f.additions as number) || 0,
              deletions: (f.deletions as number) || 0,
              changeType: ((f.changeType || "MODIFIED") as string).toLowerCase() as "added" | "modified" | "deleted" | "renamed",
            })),
            comments: [
              // General discussion comments
              ...((pr.comments || []) as any[]).map((c: any) => ({
                id: String(c.id),
                author: (c.author?.login || "unknown") as string,
                body: (c.body || "") as string,
                createdAt: c.createdAt as string,
                reviewState: null as string | null,
                filePath: null as string | null,
              })),
              // Review submissions with a non-empty body (e.g. "LGTM, approved")
              ...((pr.reviews || []) as any[])
                .filter((r: any) => r.body && r.body.trim())
                .map((r: any) => ({
                  id: String(r.id || r.submittedAt),
                  author: (r.author?.login || "unknown") as string,
                  body: (r.body || "") as string,
                  createdAt: (r.submittedAt || "") as string,
                  reviewState: (r.state || null) as string | null,
                  filePath: null as string | null,
                })),
              // Inline code review comments (REST API: pulls/{number}/comments)
              ...inlineComments
                .filter((c: any) => c.body && c.body.trim())
                .map((c: any) => ({
                  id: String(c.id),
                  author: (c.user?.login || "unknown") as string,
                  body: (c.body || "") as string,
                  createdAt: (c.created_at || "") as string,
                  reviewState: null as string | null,
                  filePath: (c.path || null) as string | null,
                })),
            ].sort((a, b) => {
              const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0
              const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0
              return ta - tb
            }),
            diff: diffResult.stdout as string,
          },
        }
      } catch (error) {
        return { success: false as const, error: error instanceof Error ? error.message : String(error) }
      }
    }),

  /**
   * Fetch full issue detail including body and comments
   */
  getIssueDetail: publicProcedure
    .input(z.object({ projectPath: z.string(), issueNumber: z.number() }))
    .query(async ({ input }) => {
      const ghCheck = await checkGhAvailable()
      if (!ghCheck.available) return { success: false as const, error: ghCheck.error }

      const remote = await getGitHubRemote(input.projectPath)
      if (!remote) return { success: false as const, error: "No GitHub remote found" }

      try {
        const { stdout } = await execAsync(
          `gh issue view ${input.issueNumber} --repo ${remote.owner}/${remote.repo} --json number,title,body,state,author,labels,assignees,comments,createdAt,updatedAt,milestone`,
          { cwd: input.projectPath }
        )

        const issue = JSON.parse(stdout)
        return {
          success: true as const,
          issue: {
            number: issue.number as number,
            title: issue.title as string,
            body: (issue.body as string) || "",
            state: issue.state as string,
            author: (issue.author?.login as string) || "unknown",
            labels: ((issue.labels || []) as any[]).map((l: any) => l.name as string),
            assignees: ((issue.assignees || []) as any[]).map((a: any) => a.login as string),
            milestone: (issue.milestone?.title as string) || null,
            createdAt: issue.createdAt as string,
            updatedAt: issue.updatedAt as string,
            comments: ((issue.comments || []) as any[]).map((c: any) => ({
              id: c.id as string,
              author: (c.author?.login || "unknown") as string,
              body: (c.body || "") as string,
              createdAt: c.createdAt as string,
            })),
          },
        }
      } catch (error) {
        return { success: false as const, error: error instanceof Error ? error.message : String(error) }
      }
    }),

  /**
   * Create a new chat + sub_chat in the DB for a GitHub context conversation
   */
  createChatSession: publicProcedure
    .input(
      z.object({
        projectId: z.string(),
        name: z.string(),
        mode: z.enum(["plan", "agent"]).default("agent"),
        sourceView: z.enum(["github", "prompts", "skills", "commands"]).optional(),
        sourceContext: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const db = getDatabase()
      const chatId = createId()
      const subChatId = createId()

      db.insert(chats).values({
        id: chatId,
        name: input.name,
        projectId: input.projectId,
        isTransient: false,
        sourceView: input.sourceView ?? "github",
        sourceContext: input.sourceContext ?? null,
      }).run()
      db.insert(subChats).values({
        id: subChatId,
        name: input.name,
        chatId,
        mode: input.mode,
        messages: "[]",
      }).run()

      return { chatId, subChatId }
    }),

  /**
   * Reply to a PR comment.
   * - isInline=true  → inline review comment  (POST /pulls/{n}/comments/{id}/replies)
   * - isInline=false → issue-level discussion (POST /issues/{n}/comments)
   */
  replyToComment: publicProcedure
    .input(
      z.object({
        projectPath: z.string(),
        prNumber: z.number(),
        commentId: z.string(),
        body: z.string().min(1),
        isInline: z.boolean(),
      })
    )
    .mutation(async ({ input }) => {
      const ghCheck = await checkGhAvailable()
      if (!ghCheck.available) return { success: false as const, error: ghCheck.error }

      const remote = await getGitHubRemote(input.projectPath)
      if (!remote) return { success: false as const, error: "No GitHub remote found" }

      // Write body to a temp file to avoid shell-escaping issues with arbitrary text
      const tmpFile = path.join(os.tmpdir(), `gh-reply-${Date.now()}.json`)
      fs.writeFileSync(tmpFile, JSON.stringify({ body: input.body }))

      try {
        const endpoint = input.isInline
          ? `repos/${remote.owner}/${remote.repo}/pulls/${input.prNumber}/comments/${input.commentId}/replies`
          : `repos/${remote.owner}/${remote.repo}/issues/${input.prNumber}/comments`

        await execAsync(`gh api ${endpoint} --method POST --input ${tmpFile}`, {
          cwd: input.projectPath,
        })

        return { success: true as const }
      } catch (error) {
        return { success: false as const, error: error instanceof Error ? error.message : String(error) }
      } finally {
        fs.unlinkSync(tmpFile)
      }
    }),

  /**
   * Open a pull request in the system browser
   */
  openPRInBrowser: publicProcedure
    .input(z.object({ projectPath: z.string(), prNumber: z.number() }))
    .mutation(async ({ input }) => {
      const remote = await getGitHubRemote(input.projectPath)
      if (!remote) return { success: false as const, error: "No GitHub remote found" }
      const url = `https://github.com/${remote.owner}/${remote.repo}/pull/${input.prNumber}`
      await shell.openExternal(url)
      return { success: true as const }
    }),

  /**
   * Merge a pull request
   */
  mergePR: publicProcedure
    .input(
      z.object({
        projectPath: z.string(),
        prNumber: z.number(),
        method: z.enum(["merge", "squash", "rebase"]).default("squash"),
      })
    )
    .mutation(async ({ input }) => {
      const ghCheck = await checkGhAvailable()
      if (!ghCheck.available) return { success: false as const, error: ghCheck.error }

      const remote = await getGitHubRemote(input.projectPath)
      if (!remote) return { success: false as const, error: "No GitHub remote found" }

      try {
        await execAsync(
          `gh pr merge ${input.prNumber} --repo ${remote.owner}/${remote.repo} --${input.method}`,
          { cwd: input.projectPath }
        )
        return { success: true as const }
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error)
        const match = msg.match(/GraphQL: (.+)|error: (.+)/s)
        return { success: false as const, error: match ? (match[1] || match[2]).trim() : msg }
      }
    }),

  /**
   * Submit a pull request review (approve, request changes, or leave a comment)
   */
  submitReview: publicProcedure
    .input(
      z.object({
        projectPath: z.string(),
        prNumber: z.number(),
        event: z.enum(["APPROVE", "REQUEST_CHANGES", "COMMENT"]),
        body: z.string().default(""),
      })
    )
    .mutation(async ({ input }) => {
      const ghCheck = await checkGhAvailable()
      if (!ghCheck.available) return { success: false as const, error: ghCheck.error }

      const remote = await getGitHubRemote(input.projectPath)
      if (!remote) return { success: false as const, error: "No GitHub remote found" }

      const payload: Record<string, string> = { event: input.event }
      if (input.body.trim()) payload.body = input.body.trim()

      const tmpFile = path.join(os.tmpdir(), `gh-review-${Date.now()}.json`)
      fs.writeFileSync(tmpFile, JSON.stringify(payload))

      try {
        await execAsync(
          `gh api repos/${remote.owner}/${remote.repo}/pulls/${input.prNumber}/reviews --method POST --input ${tmpFile}`,
          { cwd: input.projectPath }
        )
        return { success: true as const }
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error)
        const match = msg.match(/GraphQL: (.+)|HTTP \d+ .+: (.+)/s)
        return { success: false as const, error: match ? (match[1] || match[2]).trim() : msg }
      } finally {
        try { fs.unlinkSync(tmpFile) } catch {}
      }
    }),

  /**
   * Save GitHub PAT token (encrypted)
   */
  saveToken: publicProcedure
    .input(z.object({ token: z.string().min(1) }))
    .mutation(async ({ input }) => {
      const db = getDatabase()
      const encryptedToken = encryptText(input.token)

      // Upsert the settings
      const existing = db.select().from(githubSettings).where(eq(githubSettings.id, "default")).get()

      if (existing) {
        db.update(githubSettings)
          .set({ encryptedToken, updatedAt: new Date() })
          .where(eq(githubSettings.id, "default"))
          .run()
      } else {
        db.insert(githubSettings).values({
          id: "default",
          encryptedToken,
        }).run()
      }

      return { success: true as const }
    }),

  /**
   * Check if GitHub token is configured
   */
  hasToken: publicProcedure.query(async () => {
    const db = getDatabase()
    const settings = db.select().from(githubSettings).where(eq(githubSettings.id, "default")).get()

    return {
      hasToken: !!settings?.encryptedToken,
    }
  }),

  /**
   * Get GitHub token (decrypted) - for internal use only
   * Note: This returns the decrypted token, use with caution
   */
  getToken: publicProcedure.query(async () => {
    const db = getDatabase()
    const settings = db.select().from(githubSettings).where(eq(githubSettings.id, "default")).get()

    if (!settings?.encryptedToken) {
      return { success: false as const, error: "No token configured" }
    }

    const token = decryptText(settings.encryptedToken)
    if (!token) {
      return { success: false as const, error: "Failed to decrypt token" }
    }

    return { success: true as const, token }
  }),

  /**
   * Clear GitHub token
   */
  clearToken: publicProcedure.mutation(async () => {
    const db = getDatabase()

    db.update(githubSettings)
      .set({ encryptedToken: null, updatedAt: new Date() })
      .where(eq(githubSettings.id, "default"))
      .run()

    return { success: true as const }
  }),

  /**
   * Test GitHub token by making an API call
   */
  testToken: publicProcedure.query(async () => {
    const db = getDatabase()
    const settings = db.select().from(githubSettings).where(eq(githubSettings.id, "default")).get()

    if (!settings?.encryptedToken) {
      return { success: false as const, error: "No token configured" }
    }

    const token = decryptText(settings.encryptedToken)
    if (!token) {
      return { success: false as const, error: "Failed to decrypt token" }
    }

    try {
      const response = await fetch("https://api.github.com/user", {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github.v3+json",
          "User-Agent": "Claw-App",
        },
      })

      if (!response.ok) {
        const error = await response.text()
        return { success: false as const, error: `GitHub API error: ${error}` }
      }

      const user = await response.json()
      return {
        success: true as const,
        user: {
          login: user.login,
          name: user.name,
          email: user.email,
        },
      }
    } catch (error) {
      return {
        success: false as const,
        error: error instanceof Error ? error.message : String(error),
      }
    }
  }),

  /**
   * Fetch README content for a repository
   */
  getReadme: publicProcedure
    .input(z.object({ projectPath: z.string() }))
    .query(async ({ input }) => {
      const ghCheck = await checkGhAvailable()
      if (!ghCheck.available) {
        return { success: false as const, error: ghCheck.error, content: "" }
      }

      const remote = await getGitHubRemote(input.projectPath)
      if (!remote) {
        return { success: false as const, error: "No GitHub remote found", content: "" }
      }

      // Try to fetch README using gh CLI
      const readmePaths = ["README.md", "readme.md", "README.rst", "readme.rst", "README.txt", "readme.txt", "README", "readme"]

      for (const readmePath of readmePaths) {
        try {
          const { stdout } = await execAsync(
            `gh api repos/${remote.owner}/${remote.repo}/contents/${readmePath}`,
            { cwd: input.projectPath }
          )

          const fileData = JSON.parse(stdout)
          if (fileData.content) {
            // Content is base64 encoded
            const content = Buffer.from(fileData.content, "base64").toString("utf-8")
            return { success: true as const, content }
          }
        } catch {
          // Try next path
          continue
        }
      }

      // If no README found, return empty content (not an error)
      return { success: true as const, content: "" }
    }),
})