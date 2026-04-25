import { z } from "zod"
import { router, publicProcedure } from "../index"
import { exec } from "node:child_process"
import { promisify } from "node:util"
import * as fs from "node:fs"
import * as path from "node:path"
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
 * Get stored GitHub token from DB, or return an error string.
 */
function getStoredToken(): { token: string } | { error: string } {
  const db = getDatabase()
  const settings = db.select().from(githubSettings).where(eq(githubSettings.id, "default")).get()
  if (!settings?.encryptedToken) {
    return { error: "GitHub token not configured. Add a Personal Access Token in GitHub Settings." }
  }
  const token = decryptText(settings.encryptedToken)
  if (!token) {
    return { error: "Failed to decrypt GitHub token." }
  }
  return { token }
}

/**
 * Authenticated fetch helper for GitHub REST API.
 */
async function ghFetch(
  token: string,
  endpoint: string,
  options: RequestInit = {}
): Promise<Response> {
  return fetch(`https://api.github.com${endpoint}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "Claw-App",
      ...(options.headers ?? {}),
    },
  })
}

/**
 * Get the GitHub remote owner/repo from a local git repository.
 */
async function getGitHubRemote(projectPath: string): Promise<{ owner: string; repo: string } | null> {
  try {
    const { stdout } = await execAsync("git remote get-url origin", { cwd: projectPath })
    const url = stdout.trim()
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
   * Check if GitHub token is configured (replaces gh CLI auth check).
   */
  checkAuth: publicProcedure.query(async () => {
    const result = getStoredToken()
    if ("error" in result) {
      return { available: false, error: result.error }
    }
    return { available: true }
  }),

  /**
   * Get repository info from local git remote.
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
   * Fetch pull requests for a repository.
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
      const tokenResult = getStoredToken()
      if ("error" in tokenResult) return { success: false, error: tokenResult.error, prs: [] }

      const remote = await getGitHubRemote(input.projectPath)
      if (!remote) return { success: false, error: "No GitHub remote found", prs: [] }

      try {
        const res = await ghFetch(
          tokenResult.token,
          `/repos/${remote.owner}/${remote.repo}/pulls?state=${input.state}&per_page=${input.limit}`
        )
        if (!res.ok) throw new Error(`GitHub API error: ${res.status}`)
        const data = await res.json()
        const prs = data.map((pr: any) => ({
          number: pr.number,
          title: pr.title,
          state: pr.state,
          author: pr.user?.login || "unknown",
          headBranch: pr.head?.ref,
          baseBranch: pr.base?.ref,
          draft: pr.draft || false,
        }))
        return { success: true, prs }
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error), prs: [] }
      }
    }),

  /**
   * Fetch issues for a repository.
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
      const tokenResult = getStoredToken()
      if ("error" in tokenResult) return { success: false, error: tokenResult.error, issues: [] }

      const remote = await getGitHubRemote(input.projectPath)
      if (!remote) return { success: false, error: "No GitHub remote found", issues: [] }

      try {
        // GitHub's /issues endpoint returns both issues and PRs — filter out PRs
        const res = await ghFetch(
          tokenResult.token,
          `/repos/${remote.owner}/${remote.repo}/issues?state=${input.state}&per_page=${input.limit}`
        )
        if (!res.ok) throw new Error(`GitHub API error: ${res.status}`)
        const data = await res.json()
        const issues = data
          .filter((item: any) => !item.pull_request)
          .map((issue: any) => ({
            number: issue.number,
            title: issue.title,
            state: issue.state,
            author: issue.user?.login || "unknown",
            labels: (issue.labels || []).map((l: any) => l.name),
          }))
        return { success: true, issues }
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error), issues: [] }
      }
    }),

  /**
   * Fetch both PRs and issues for a repository.
   */
  getData: publicProcedure
    .input(z.object({ projectPath: z.string() }))
    .query(async ({ input }) => {
      const tokenResult = getStoredToken()
      if ("error" in tokenResult) {
        return { success: false, error: tokenResult.error, prs: [], issues: [] }
      }

      const remote = await getGitHubRemote(input.projectPath)
      if (!remote) {
        return { success: false, error: "No GitHub remote found", prs: [], issues: [], isGitHub: false }
      }

      try {
        const [prsRes, issuesRes] = await Promise.all([
          ghFetch(tokenResult.token, `/repos/${remote.owner}/${remote.repo}/pulls?state=open&per_page=30`),
          ghFetch(tokenResult.token, `/repos/${remote.owner}/${remote.repo}/issues?state=open&per_page=30`),
        ])

        const prsData = prsRes.ok ? await prsRes.json() : []
        const issuesData = issuesRes.ok ? await issuesRes.json() : []

        const prs = prsData.map((pr: any) => ({
          number: pr.number,
          title: pr.title,
          state: pr.state,
          author: pr.user?.login || "unknown",
          headBranch: pr.head?.ref,
          baseBranch: pr.base?.ref,
          draft: pr.draft || false,
        }))

        const issues = issuesData
          .filter((item: any) => !item.pull_request)
          .map((issue: any) => ({
            number: issue.number,
            title: issue.title,
            state: issue.state,
            author: issue.user?.login || "unknown",
            labels: (issue.labels || []).map((l: any) => l.name),
          }))

        return {
          success: true,
          prs,
          issues,
          owner: remote.owner,
          repo: remote.repo,
          isGitHub: true,
        }
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error), prs: [], issues: [] }
      }
    }),

  /**
   * Fetch full PR detail including body, commits, files, comments, and diff.
   */
  getPRDetail: publicProcedure
    .input(z.object({ projectPath: z.string(), prNumber: z.number() }))
    .query(async ({ input }) => {
      const tokenResult = getStoredToken()
      if ("error" in tokenResult) return { success: false as const, error: tokenResult.error }

      const remote = await getGitHubRemote(input.projectPath)
      if (!remote) return { success: false as const, error: "No GitHub remote found" }

      const base = `/repos/${remote.owner}/${remote.repo}`

      try {
        const [prRes, commitsRes, filesRes, discussionRes, reviewsRes, inlineRes, diffRes] = await Promise.all([
          ghFetch(tokenResult.token, `${base}/pulls/${input.prNumber}`),
          ghFetch(tokenResult.token, `${base}/pulls/${input.prNumber}/commits?per_page=100`),
          ghFetch(tokenResult.token, `${base}/pulls/${input.prNumber}/files?per_page=100`),
          ghFetch(tokenResult.token, `${base}/issues/${input.prNumber}/comments?per_page=100`),
          ghFetch(tokenResult.token, `${base}/pulls/${input.prNumber}/reviews?per_page=100`),
          ghFetch(tokenResult.token, `${base}/pulls/${input.prNumber}/comments?per_page=100`),
          ghFetch(tokenResult.token, `${base}/pulls/${input.prNumber}`, {
            headers: { Accept: "application/vnd.github.diff" },
          }),
        ])

        if (!prRes.ok) throw new Error(`GitHub API error: ${prRes.status}`)

        const [pr, commits, files, discussion, reviews, inlineComments] = await Promise.all([
          prRes.json(),
          commitsRes.ok ? commitsRes.json() : [],
          filesRes.ok ? filesRes.json() : [],
          discussionRes.ok ? discussionRes.json() : [],
          reviewsRes.ok ? reviewsRes.json() : [],
          inlineRes.ok ? inlineRes.json() : [],
        ])
        const diff = diffRes.ok ? await diffRes.text() : ""

        return {
          success: true as const,
          pr: {
            number: pr.number as number,
            title: pr.title as string,
            body: (pr.body as string) || "",
            state: pr.state as string,
            author: (pr.user?.login as string) || "unknown",
            labels: ((pr.labels || []) as any[]).map((l: any) => l.name as string),
            headBranch: pr.head?.ref as string,
            baseBranch: pr.base?.ref as string,
            draft: (pr.draft as boolean) || false,
            additions: (pr.additions as number) || 0,
            deletions: (pr.deletions as number) || 0,
            changedFiles: (pr.changed_files as number) || 0,
            createdAt: pr.created_at as string,
            updatedAt: pr.updated_at as string,
            commits: (commits as any[]).map((c: any) => ({
              sha: (c.sha as string).slice(0, 7),
              message: (c.commit?.message?.split("\n")[0] || "") as string,
              author: (c.author?.login || c.commit?.author?.name || "unknown") as string,
              date: (c.commit?.author?.date || "") as string,
            })),
            files: (files as any[]).map((f: any) => ({
              path: f.filename as string,
              additions: (f.additions as number) || 0,
              deletions: (f.deletions as number) || 0,
              changeType: (f.status === "added" ? "added"
                : f.status === "removed" ? "deleted"
                : f.status === "renamed" ? "renamed"
                : "modified") as "added" | "modified" | "deleted" | "renamed",
            })),
            comments: [
              ...(discussion as any[]).map((c: any) => ({
                id: String(c.id),
                author: (c.user?.login || "unknown") as string,
                body: (c.body || "") as string,
                createdAt: c.created_at as string,
                reviewState: null as string | null,
                filePath: null as string | null,
              })),
              ...(reviews as any[])
                .filter((r: any) => r.body && r.body.trim())
                .map((r: any) => ({
                  id: String(r.id),
                  author: (r.user?.login || "unknown") as string,
                  body: (r.body || "") as string,
                  createdAt: (r.submitted_at || "") as string,
                  reviewState: (r.state || null) as string | null,
                  filePath: null as string | null,
                })),
              ...(inlineComments as any[])
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
            diff,
          },
        }
      } catch (error) {
        return { success: false as const, error: error instanceof Error ? error.message : String(error) }
      }
    }),

  /**
   * Fetch full issue detail including body and comments.
   */
  getIssueDetail: publicProcedure
    .input(z.object({ projectPath: z.string(), issueNumber: z.number() }))
    .query(async ({ input }) => {
      const tokenResult = getStoredToken()
      if ("error" in tokenResult) return { success: false as const, error: tokenResult.error }

      const remote = await getGitHubRemote(input.projectPath)
      if (!remote) return { success: false as const, error: "No GitHub remote found" }

      const base = `/repos/${remote.owner}/${remote.repo}`

      try {
        const [issueRes, commentsRes] = await Promise.all([
          ghFetch(tokenResult.token, `${base}/issues/${input.issueNumber}`),
          ghFetch(tokenResult.token, `${base}/issues/${input.issueNumber}/comments?per_page=100`),
        ])

        if (!issueRes.ok) throw new Error(`GitHub API error: ${issueRes.status}`)

        const [issue, comments] = await Promise.all([
          issueRes.json(),
          commentsRes.ok ? commentsRes.json() : [],
        ])

        return {
          success: true as const,
          issue: {
            number: issue.number as number,
            title: issue.title as string,
            body: (issue.body as string) || "",
            state: issue.state as string,
            author: (issue.user?.login as string) || "unknown",
            labels: ((issue.labels || []) as any[]).map((l: any) => l.name as string),
            assignees: ((issue.assignees || []) as any[]).map((a: any) => a.login as string),
            milestone: (issue.milestone?.title as string) || null,
            createdAt: issue.created_at as string,
            updatedAt: issue.updated_at as string,
            comments: (comments as any[]).map((c: any) => ({
              id: String(c.id),
              author: (c.user?.login || "unknown") as string,
              body: (c.body || "") as string,
              createdAt: c.created_at as string,
            })),
          },
        }
      } catch (error) {
        return { success: false as const, error: error instanceof Error ? error.message : String(error) }
      }
    }),

  /**
   * Create a new chat + sub_chat in the DB for a GitHub context conversation.
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
   * Reply to a PR comment via GitHub REST API.
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
      const tokenResult = getStoredToken()
      if ("error" in tokenResult) return { success: false as const, error: tokenResult.error }

      const remote = await getGitHubRemote(input.projectPath)
      if (!remote) return { success: false as const, error: "No GitHub remote found" }

      const base = `/repos/${remote.owner}/${remote.repo}`
      const endpoint = input.isInline
        ? `${base}/pulls/${input.prNumber}/comments/${input.commentId}/replies`
        : `${base}/issues/${input.prNumber}/comments`

      try {
        const res = await ghFetch(tokenResult.token, endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ body: input.body }),
        })
        if (!res.ok) {
          const err = await res.json().catch(() => ({}))
          throw new Error(err.message || `HTTP ${res.status}`)
        }
        return { success: true as const }
      } catch (error) {
        return { success: false as const, error: error instanceof Error ? error.message : String(error) }
      }
    }),

  /**
   * Open a pull request in the system browser.
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
   * Merge a pull request via GitHub REST API.
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
      const tokenResult = getStoredToken()
      if ("error" in tokenResult) return { success: false as const, error: tokenResult.error }

      const remote = await getGitHubRemote(input.projectPath)
      if (!remote) return { success: false as const, error: "No GitHub remote found" }

      try {
        const res = await ghFetch(
          tokenResult.token,
          `/repos/${remote.owner}/${remote.repo}/pulls/${input.prNumber}/merge`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ merge_method: input.method }),
          }
        )
        if (!res.ok) {
          const err = await res.json().catch(() => ({}))
          throw new Error(err.message || `HTTP ${res.status}`)
        }
        return { success: true as const }
      } catch (error) {
        return { success: false as const, error: error instanceof Error ? error.message : String(error) }
      }
    }),

  /**
   * Submit a pull request review via GitHub REST API.
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
      const tokenResult = getStoredToken()
      if ("error" in tokenResult) return { success: false as const, error: tokenResult.error }

      const remote = await getGitHubRemote(input.projectPath)
      if (!remote) return { success: false as const, error: "No GitHub remote found" }

      const payload: Record<string, string> = { event: input.event }
      if (input.body.trim()) payload.body = input.body.trim()

      try {
        const res = await ghFetch(
          tokenResult.token,
          `/repos/${remote.owner}/${remote.repo}/pulls/${input.prNumber}/reviews`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          }
        )
        if (!res.ok) {
          const err = await res.json().catch(() => ({}))
          throw new Error(err.message || `HTTP ${res.status}`)
        }
        return { success: true as const }
      } catch (error) {
        return { success: false as const, error: error instanceof Error ? error.message : String(error) }
      }
    }),

  /**
   * Save GitHub PAT token (encrypted).
   */
  saveToken: publicProcedure
    .input(z.object({ token: z.string().min(1) }))
    .mutation(async ({ input }) => {
      const db = getDatabase()
      const encryptedToken = encryptText(input.token)

      db.insert(githubSettings)
        .values({ id: "default", encryptedToken, updatedAt: new Date() })
        .onConflictDoUpdate({
          target: githubSettings.id,
          set: { encryptedToken, updatedAt: new Date() },
        })
        .run()

      return { success: true as const }
    }),

  /**
   * Check if GitHub token is configured.
   */
  hasToken: publicProcedure.query(async () => {
    const db = getDatabase()
    const settings = db.select().from(githubSettings).where(eq(githubSettings.id, "default")).get()
    return { hasToken: !!settings?.encryptedToken }
  }),

  /**
   * Clear GitHub token.
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
   * Test GitHub token by making an API call.
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
      const res = await ghFetch(token, "/user")
      if (!res.ok) {
        const error = await res.text()
        return { success: false as const, error: `GitHub API error: ${error}` }
      }
      const user = await res.json()
      return {
        success: true as const,
        user: { login: user.login, name: user.name, email: user.email },
      }
    } catch (error) {
      return { success: false as const, error: error instanceof Error ? error.message : String(error) }
    }
  }),

  /**
   * Fetch README content for a repository via GitHub REST API.
   */
  getReadme: publicProcedure
    .input(z.object({ projectPath: z.string() }))
    .query(async ({ input }) => {
      const tokenResult = getStoredToken()
      if ("error" in tokenResult) return { success: false as const, error: tokenResult.error, content: "" }

      const remote = await getGitHubRemote(input.projectPath)
      if (!remote) return { success: false as const, error: "No GitHub remote found", content: "" }

      const candidates = ["README.md", "readme.md", "README.rst", "readme.rst", "README.txt", "readme.txt", "README", "readme"]

      for (const readmePath of candidates) {
        try {
          const res = await ghFetch(
            tokenResult.token,
            `/repos/${remote.owner}/${remote.repo}/contents/${readmePath}`
          )
          if (!res.ok) continue
          const data = await res.json()
          if (data.content) {
            const content = Buffer.from(data.content, "base64").toString("utf-8")
            return { success: true as const, content }
          }
        } catch {
          continue
        }
      }

      return { success: true as const, content: "" }
    }),

  /**
   * Add an image to the repository and insert it into the README.
   */
  addImageToReadme: publicProcedure
    .input(
      z.object({
        projectPath: z.string(),
        imageData: z.string(),
        imageName: z.string(),
        caption: z.string().optional(),
        section: z.enum(["top", "bottom"]).default("bottom"),
      })
    )
    .mutation(async ({ input }) => {
      try {
        const remote = await getGitHubRemote(input.projectPath)
        if (!remote) throw new Error("No GitHub remote found for this project")

        // Save image to .github/assets
        const assetsDir = path.join(input.projectPath, ".github", "assets")
        if (!fs.existsSync(assetsDir)) fs.mkdirSync(assetsDir, { recursive: true })
        const base64Data = input.imageData.replace(/^data:image\/\w+;base64,/, "")
        const imagePath = path.join(assetsDir, input.imageName)
        fs.writeFileSync(imagePath, Buffer.from(base64Data, "base64"))

        // Read current README from disk (local file, no API call needed)
        const readmeCandidates = ["README.md", "readme.md", "Readme.md"]
        let readmePath = "README.md"
        let currentContent = ""

        for (const candidate of readmeCandidates) {
          const fullPath = path.join(input.projectPath, candidate)
          if (fs.existsSync(fullPath)) {
            currentContent = fs.readFileSync(fullPath, "utf-8")
            readmePath = candidate
            break
          }
        }

        if (!currentContent) {
          currentContent = `# ${path.basename(input.projectPath)}\n\n`
        }

        const imageRef = `.github/assets/${input.imageName}`
        const imageMarkdown = input.caption
          ? `![${input.caption}](${imageRef})\n\n*${input.caption}*\n\n`
          : `![Diagram](${imageRef})\n\n`

        let newContent: string
        if (input.section === "top") {
          const lines = currentContent.split("\n")
          const firstHeadingIndex = lines.findIndex((line) => line.startsWith("#"))
          if (firstHeadingIndex !== -1) {
            lines.splice(firstHeadingIndex + 1, 0, "", imageMarkdown)
            newContent = lines.join("\n")
          } else {
            newContent = imageMarkdown + currentContent
          }
        } else {
          newContent = currentContent + "\n\n" + imageMarkdown
        }

        const readmeFullPath = path.join(input.projectPath, readmePath)
        fs.writeFileSync(readmeFullPath, newContent)

        await execAsync(`git add "${imagePath}" "${readmeFullPath}"`, { cwd: input.projectPath })
        await execAsync(`git commit -m "docs: add ${input.imageName} to README"`, { cwd: input.projectPath })

        return { success: true as const, imagePath: imageRef, message: "Image added to README successfully" }
      } catch (error) {
        console.error("[github] Failed to add image to README:", error)
        return { success: false as const, error: error instanceof Error ? error.message : "Failed to add image to README" }
      }
    }),
})
