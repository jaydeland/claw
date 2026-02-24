"use client"

import { memo, useState, useMemo, useCallback } from "react"
import { useAtom, useAtomValue, useSetAtom } from "jotai"
import { FileCode, GitPullRequest, CircleDot, GitBranch, Loader2, AlertCircle, Sparkles, GitCommit, MessageSquare, Plus, Minus, ChevronDown, ChevronRight, Reply, Send, Check, X, CheckCircle, GitMerge } from "lucide-react"
import { cn } from "../../../lib/utils"
import { trpc } from "../../../lib/trpc"
import { Button } from "../../../components/ui/button"
import { type GitHubSelection, type AnalysisType, githubStartChatAtom, githubPRActiveTabAtom } from "../atoms"
import { VisualizeView } from "./visualize-view"
import { CodeBlock } from "../../agents/ui/code-block"
import { MemoizedMarkdown } from "../../../components/chat-markdown-renderer"

interface GitHubContentPaneProps {
  projectId: string
  projectPath: string
  selection: GitHubSelection
}

export const GitHubContentPane = memo(function GitHubContentPane({
  projectId,
  projectPath,
  selection,
}: GitHubContentPaneProps) {
  // Empty state
  if (!selection) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-muted-foreground p-8">
        <GitBranch className="h-12 w-12 mb-4 opacity-50" />
        <h3 className="text-lg font-medium mb-2">Select an item</h3>
        <p className="text-sm text-center">
          Choose a PR, Issue, Code file, or Visualize type from the tree to view details.
        </p>
      </div>
    )
  }

  // Render based on selection type
  switch (selection.type) {
    case "pr":
      return <PRDetailView prNumber={selection.prNumber} repoName={selection.repoName} projectPath={projectPath} />
    case "issue":
      return <IssueDetailView issueNumber={selection.issueNumber} repoName={selection.repoName} projectPath={projectPath} />
    case "code":
      return <CodeView path={selection.path} repoName={selection.repoName} projectPath={projectPath} />
    case "visualize":
      return (
        <VisualizeView
          projectId={projectId}
          projectPath={projectPath}
          analysisType={selection.analysisType}
          repoName={selection.repoName}
        />
      )
    default:
      return null
  }
})

interface PRDetailViewProps {
  prNumber: number
  repoName: string
  projectPath: string
}

const PRDetailView = memo(function PRDetailView({ prNumber, repoName, projectPath }: PRDetailViewProps) {
  const [activeTab, setActiveTab] = useAtom(githubPRActiveTabAtom)
  const [replyingTo, setReplyingTo] = useState<string | null>(null)
  const [replyTexts, setReplyTexts] = useState<Record<string, string>>({})

  // Review submission state
  const [reviewMode, setReviewMode] = useState<"idle" | "approve" | "request_changes">("idle")
  const [reviewBody, setReviewBody] = useState("")
  const [reviewError, setReviewError] = useState<string | null>(null)
  const [reviewSuccess, setReviewSuccess] = useState(false)

  // Merge state
  const [mergeMode, setMergeMode] = useState(false)
  const [mergeMethod, setMergeMethod] = useState<"squash" | "merge" | "rebase">("squash")
  const [mergeError, setMergeError] = useState<string | null>(null)

  const { data, isLoading, error, refetch } = trpc.github.getPRDetail.useQuery(
    { projectPath, prNumber },
    { enabled: !!projectPath }
  )

  const replyMutation = trpc.github.replyToComment.useMutation({
    onSuccess: () => {
      setReplyingTo(null)
      refetch()
    },
  })

  const submitReviewMutation = trpc.github.submitReview.useMutation({
    onSuccess: (result) => {
      if (result.success) {
        setReviewMode("idle")
        setReviewBody("")
        setReviewError(null)
        setReviewSuccess(true)
        setTimeout(() => setReviewSuccess(false), 3000)
        refetch()
      } else {
        setReviewError(result.error || "Failed to submit review")
      }
    },
    onError: (err) => setReviewError(err.message),
  })

  const mergeMutation = trpc.github.mergePR.useMutation({
    onSuccess: (result) => {
      if (result.success) {
        setMergeMode(false)
        setMergeError(null)
        setReviewSuccess(true)
        setTimeout(() => setReviewSuccess(false), 3000)
        refetch()
      } else {
        setMergeError(result.error || "Failed to merge PR")
      }
    },
    onError: (err) => setMergeError(err.message),
  })

  const setStartChat = useSetAtom(githubStartChatAtom)

  const handleAddressWithAI = useCallback((comment: { id: string; author: string; body: string; filePath: string | null }) => {
    const lines = [
      `Address this code review comment on PR #${prNumber} in the repo at \`${projectPath}\`:`,
      "",
      comment.filePath
        ? `**File:** \`${comment.filePath}\``
        : "",
      `**${comment.author} wrote:**`,
      comment.body,
      "",
      comment.filePath
        ? `Use the Read tool to read \`${projectPath}/${comment.filePath}\`, understand the context, then explain what change is needed and show your proposed fix. Do not make any changes until you have presented the fix and received explicit approval.`
        : `Use the Bash tool with \`gh pr view ${prNumber} --repo origin\` to get full context, then explain what change is needed and show your proposed fix. Do not make any changes until you have presented the fix and received explicit approval.`,
    ]
    setStartChat({ message: lines.filter(Boolean).join("\n"), type: "explain", autoStart: true })
  }, [prNumber, projectPath, setStartChat])

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    )
  }

  if (error || !data?.success) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-muted-foreground p-8">
        <AlertCircle className="h-8 w-8 mb-2 text-destructive" />
        <p className="text-sm text-destructive">Failed to load PR</p>
        <p className="text-xs mt-1">{error?.message || (data as any)?.error}</p>
      </div>
    )
  }

  const pr = data.pr
  const stateColor = pr.state === "OPEN" ? "text-green-500 bg-green-500/10" : pr.state === "MERGED" ? "text-purple-500 bg-purple-500/10" : "text-red-500 bg-red-500/10"

  const tabs = [
    { id: "description" as const, label: "Description" },
    { id: "files" as const, label: `Files (${pr.files.length})` },
    { id: "commits" as const, label: `Commits (${pr.commits.length})` },
    { id: "comments" as const, label: `Comments (${pr.comments.length})` },
    { id: "diff" as const, label: "Diff" },
  ]

  return (
    <div className="h-full flex flex-col">
      {/* Review action bar — only for open, non-draft PRs */}
      {pr.state === "OPEN" && !pr.draft && (
        <div className="px-4 py-2 border-b border-border flex-shrink-0">
          {reviewSuccess ? (
            <div className="flex items-center gap-1.5 text-xs text-green-500">
              <CheckCircle className="h-3.5 w-3.5" />
              Done
            </div>
          ) : mergeMode ? (
            <div className="space-y-2">
              {/* Merge method selector */}
              <div className="flex items-center gap-1">
                {(["squash", "merge", "rebase"] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => setMergeMethod(m)}
                    className={cn(
                      "px-2 py-1 text-xs rounded border transition-colors capitalize",
                      mergeMethod === m
                        ? "border-purple-500 bg-purple-500/10 text-purple-400"
                        : "border-border text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {m}
                  </button>
                ))}
              </div>
              {mergeError && (
                <p className="text-xs text-destructive">{mergeError}</p>
              )}
              <div className="flex items-center justify-end gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => { setMergeMode(false); setMergeError(null) }}
                  disabled={mergeMutation.isPending}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  className="h-7 text-xs bg-purple-600 hover:bg-purple-700 text-white"
                  disabled={mergeMutation.isPending}
                  onClick={() => mergeMutation.mutate({ projectPath, prNumber, method: mergeMethod })}
                >
                  {mergeMutation.isPending ? (
                    <Loader2 className="h-3 w-3 animate-spin mr-1" />
                  ) : (
                    <GitMerge className="h-3 w-3 mr-1" />
                  )}
                  Merge
                </Button>
              </div>
            </div>
          ) : reviewMode === "idle" ? (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-muted-foreground">Review:</span>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs text-green-500 border-green-500/30 hover:bg-green-500/10"
                onClick={() => setReviewMode("approve")}
              >
                <Check className="h-3 w-3 mr-1" />
                Approve
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs text-yellow-500 border-yellow-500/30 hover:bg-yellow-500/10"
                onClick={() => setReviewMode("request_changes")}
              >
                <X className="h-3 w-3 mr-1" />
                Request Changes
              </Button>
              <div className="w-px h-4 bg-border" />
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs text-purple-400 border-purple-500/30 hover:bg-purple-500/10"
                onClick={() => setMergeMode(true)}
              >
                <GitMerge className="h-3 w-3 mr-1" />
                Merge
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              <textarea
                value={reviewBody}
                onChange={(e) => setReviewBody(e.target.value)}
                placeholder={
                  reviewMode === "approve"
                    ? "Leave a comment (optional)..."
                    : "Describe what changes are needed..."
                }
                rows={2}
                className="w-full text-xs rounded-md border border-border bg-background px-3 py-2 placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none"
              />
              {reviewError && (
                <p className="text-xs text-destructive">{reviewError}</p>
              )}
              <div className="flex items-center justify-end gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => { setReviewMode("idle"); setReviewBody(""); setReviewError(null) }}
                  disabled={submitReviewMutation.isPending}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  className={cn(
                    "h-7 text-xs",
                    reviewMode === "approve"
                      ? "bg-green-600 hover:bg-green-700 text-white"
                      : "bg-yellow-600 hover:bg-yellow-700 text-white"
                  )}
                  disabled={
                    (reviewMode === "request_changes" && !reviewBody.trim()) ||
                    submitReviewMutation.isPending
                  }
                  onClick={() =>
                    submitReviewMutation.mutate({
                      projectPath,
                      prNumber,
                      event: reviewMode === "approve" ? "APPROVE" : "REQUEST_CHANGES",
                      body: reviewBody,
                    })
                  }
                >
                  {submitReviewMutation.isPending ? (
                    <Loader2 className="h-3 w-3 animate-spin mr-1" />
                  ) : reviewMode === "approve" ? (
                    <Check className="h-3 w-3 mr-1" />
                  ) : (
                    <X className="h-3 w-3 mr-1" />
                  )}
                  {reviewMode === "approve" ? "Approve" : "Request Changes"}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tab bar — the only top-level chrome */}
      <div className="flex border-b border-border flex-shrink-0 overflow-x-auto">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "px-4 py-2 text-xs font-medium border-b-2 transition-colors whitespace-nowrap",
              activeTab === tab.id
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === "description" && (
          <div className="p-4 space-y-4">
            {/* Title + state */}
            <div className="flex items-start gap-2">
              <GitPullRequest className="h-5 w-5 text-green-500 mt-0.5 flex-shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-base font-semibold">{pr.title}</h2>
                  <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium", stateColor)}>
                    {pr.draft ? "Draft" : pr.state.charAt(0) + pr.state.slice(1).toLowerCase()}
                  </span>
                </div>
                <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                  <span>#{pr.number} by <span className="font-medium text-foreground">{pr.author}</span></span>
                  <span className="flex items-center gap-1">
                    <GitBranch className="h-3 w-3" />
                    {pr.headBranch} → {pr.baseBranch}
                  </span>
                  <span className="flex items-center gap-1">
                    <Plus className="h-3 w-3 text-green-500" />{pr.additions}
                    <Minus className="h-3 w-3 text-red-500 ml-1" />{pr.deletions}
                    <span className="ml-1">{pr.changedFiles} files</span>
                  </span>
                </div>
                {pr.labels.length > 0 && (
                  <div className="flex gap-1 flex-wrap mt-1.5">
                    {pr.labels.map((label) => (
                      <span key={label} className="text-xs px-1.5 py-0.5 rounded bg-muted border border-border">{label}</span>
                    ))}
                  </div>
                )}
              </div>
            </div>
            {/* Body */}
            {pr.body ? (
              <div className="border border-border rounded-md px-4 py-3">
                <MemoizedMarkdown content={pr.body} id={`pr-${pr.number}-body`} size="sm" />
              </div>
            ) : (
              <p className="text-xs text-muted-foreground italic">No description provided.</p>
            )}
          </div>
        )}

        {activeTab === "files" && (
          <div className="divide-y divide-border">
            {pr.files.map((file) => (
              <div key={file.path} className="px-4 py-2 flex items-center gap-3">
                <span className={cn(
                  "text-xs font-mono w-4 text-center",
                  file.changeType === "added" ? "text-green-500" :
                  file.changeType === "deleted" ? "text-red-500" : "text-yellow-500"
                )}>
                  {file.changeType === "added" ? "A" : file.changeType === "deleted" ? "D" : "M"}
                </span>
                <span className="text-xs font-mono flex-1 truncate">{file.path}</span>
                <span className="text-xs text-green-500 font-mono">+{file.additions}</span>
                <span className="text-xs text-red-500 font-mono">-{file.deletions}</span>
              </div>
            ))}
            {pr.files.length === 0 && (
              <p className="px-4 py-6 text-xs text-muted-foreground text-center">No files changed</p>
            )}
          </div>
        )}

        {activeTab === "commits" && (
          <div className="divide-y divide-border">
            {pr.commits.map((commit) => (
              <div key={commit.sha} className="px-4 py-2 flex items-start gap-3">
                <GitCommit className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs truncate">{commit.message}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    <code className="font-mono">{commit.sha}</code> · {commit.author}
                  </p>
                </div>
              </div>
            ))}
            {pr.commits.length === 0 && (
              <p className="px-4 py-6 text-xs text-muted-foreground text-center">No commits</p>
            )}
          </div>
        )}

        {activeTab === "comments" && (
          <div className="divide-y divide-border">
            {pr.comments.map((comment) => {
              const reviewBadge = comment.reviewState
                ? comment.reviewState === "APPROVED"
                  ? { label: "Approved", cls: "text-green-500 bg-green-500/10" }
                  : comment.reviewState === "CHANGES_REQUESTED"
                  ? { label: "Changes requested", cls: "text-red-500 bg-red-500/10" }
                  : comment.reviewState === "COMMENTED"
                  ? { label: "Reviewed", cls: "text-blue-400 bg-blue-500/10" }
                  : null
                : null
              const isReplying = replyingTo === comment.id
              const replyText = replyTexts[comment.id] || ""
              const isSending = replyMutation.isPending && replyingTo === comment.id

              return (
                <div key={comment.id} className="px-4 py-3">
                  {/* Header */}
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    <span className="text-xs font-medium">{comment.author}</span>
                    {reviewBadge && (
                      <span className={cn("text-xs px-1.5 py-0.5 rounded font-medium", reviewBadge.cls)}>
                        {reviewBadge.label}
                      </span>
                    )}
                    {comment.filePath && (
                      <span className="text-xs font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded truncate max-w-[200px]">
                        {comment.filePath}
                      </span>
                    )}
                    <span className="text-xs text-muted-foreground">
                      {comment.createdAt ? new Date(comment.createdAt).toLocaleDateString() : ""}
                    </span>
                  </div>

                  {/* Body */}
                  <MemoizedMarkdown content={comment.body} id={comment.id} size="sm" />

                  {/* Action buttons */}
                  <div className="flex items-center gap-2 mt-2">
                    <button
                      onClick={() => setReplyingTo(isReplying ? null : comment.id)}
                      className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <Reply className="h-3 w-3" />
                      Reply
                    </button>
                    <button
                      onClick={() => handleAddressWithAI(comment)}
                      className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors"
                    >
                      <Sparkles className="h-3 w-3" />
                      Address with AI
                    </button>
                  </div>

                  {/* Reply box */}
                  {isReplying && (
                    <div className="mt-3 space-y-2">
                      <textarea
                        value={replyText}
                        onChange={(e) =>
                          setReplyTexts((prev) => ({ ...prev, [comment.id]: e.target.value }))
                        }
                        placeholder="Write a reply..."
                        rows={3}
                        className="w-full text-xs rounded-md border border-border bg-background px-3 py-2 placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none"
                      />
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => setReplyingTo(null)}
                          disabled={isSending}
                        >
                          Cancel
                        </Button>
                        <Button
                          size="sm"
                          className="h-7 text-xs"
                          disabled={!replyText.trim() || isSending}
                          onClick={() =>
                            replyMutation.mutate({
                              projectPath,
                              prNumber,
                              commentId: comment.id,
                              body: replyText,
                              isInline: !!comment.filePath,
                            })
                          }
                        >
                          {isSending ? (
                            <Loader2 className="h-3 w-3 animate-spin mr-1" />
                          ) : (
                            <Send className="h-3 w-3 mr-1" />
                          )}
                          Send
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
            {pr.comments.length === 0 && (
              <p className="px-4 py-6 text-xs text-muted-foreground text-center">No comments</p>
            )}
          </div>
        )}

        {activeTab === "diff" && (
          <DiffView diff={pr.diff} />
        )}
      </div>
    </div>
  )
})

// Parse a unified diff string into per-file sections
interface DiffFile {
  path: string
  lines: string[]
  additions: number
  deletions: number
}

function parseDiff(diff: string): DiffFile[] {
  const files: DiffFile[] = []
  // Split on each "diff --git" header, keeping the delimiter
  const parts = diff.split(/(?=^diff --git )/m).filter(Boolean)

  for (const part of parts) {
    const lines = part.split("\n")
    const header = lines[0]
    // Extract b/path from "diff --git a/foo b/foo"
    const match = header.match(/diff --git a\/.+ b\/(.+)/)
    const path = match ? match[1] : header

    let additions = 0
    let deletions = 0
    for (const line of lines) {
      if (line.startsWith("+") && !line.startsWith("+++")) additions++
      else if (line.startsWith("-") && !line.startsWith("---")) deletions++
    }

    files.push({ path, lines, additions, deletions })
  }

  return files
}

// Renders colored lines for one file's diff
function DiffLines({ lines }: { lines: string[] }) {
  return (
    <div className="font-mono text-xs leading-5 overflow-x-auto">
      {lines.map((line, i) => {
        let bg = ""
        let text = "text-foreground"
        if (line.startsWith("diff --git") || line.startsWith("index ") || line.startsWith("--- ") || line.startsWith("+++ ")) {
          bg = "bg-muted/40"
          text = "text-muted-foreground"
        } else if (line.startsWith("@@")) {
          bg = "bg-blue-500/10"
          text = "text-blue-400"
        } else if (line.startsWith("+")) {
          bg = "bg-green-500/10"
          text = "text-green-400"
        } else if (line.startsWith("-")) {
          bg = "bg-red-500/10"
          text = "text-red-400"
        }
        return (
          <div key={i} className={cn("px-4 whitespace-pre", bg, text)}>
            {line || " "}
          </div>
        )
      })}
    </div>
  )
}

// Renders a unified diff split into collapsible per-file sections
const DiffView = memo(function DiffView({ diff }: { diff: string }) {
  const files = useMemo(() => parseDiff(diff), [diff])
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  if (!diff || files.length === 0) {
    return <p className="px-4 py-6 text-xs text-muted-foreground text-center">No diff available</p>
  }

  const allCollapsed = collapsed.size === files.length

  const toggleFile = (path: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev)
      next.has(path) ? next.delete(path) : next.add(path)
      return next
    })
  }

  const toggleAll = () => {
    setCollapsed(allCollapsed ? new Set() : new Set(files.map((f) => f.path)))
  }

  return (
    <div>
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border sticky top-0 bg-background z-10">
        <span className="text-xs text-muted-foreground">{files.length} file{files.length !== 1 ? "s" : ""} changed</span>
        <button
          onClick={toggleAll}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          {allCollapsed ? "Expand all" : "Collapse all"}
        </button>
      </div>

      {/* Per-file sections */}
      <div className="divide-y divide-border">
        {files.map((file) => {
          const isCollapsed = collapsed.has(file.path)
          return (
            <div key={file.path}>
              {/* File header — click to toggle */}
              <button
                onClick={() => toggleFile(file.path)}
                className="w-full flex items-center gap-2 px-4 py-2 bg-muted/30 hover:bg-muted/50 transition-colors text-left"
              >
                <ChevronRight
                  className={cn("h-3.5 w-3.5 text-muted-foreground flex-shrink-0 transition-transform", !isCollapsed && "rotate-90")}
                />
                <span className="text-xs font-mono flex-1 truncate">{file.path}</span>
                <span className="text-xs font-mono text-green-400 flex-shrink-0">+{file.additions}</span>
                <span className="text-xs font-mono text-red-400 flex-shrink-0 ml-1">-{file.deletions}</span>
              </button>

              {/* Diff lines */}
              {!isCollapsed && <DiffLines lines={file.lines} />}
            </div>
          )
        })}
      </div>
    </div>
  )
})

interface IssueDetailViewProps {
  issueNumber: number
  repoName: string
  projectPath: string
}

const IssueDetailView = memo(function IssueDetailView({ issueNumber, repoName, projectPath }: IssueDetailViewProps) {
  const { data, isLoading, error } = trpc.github.getIssueDetail.useQuery(
    { projectPath, issueNumber },
    { enabled: !!projectPath }
  )

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    )
  }

  if (error || !data?.success) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-muted-foreground p-8">
        <AlertCircle className="h-8 w-8 mb-2 text-destructive" />
        <p className="text-sm text-destructive">Failed to load issue</p>
        <p className="text-xs mt-1">{error?.message || (data as any)?.error}</p>
      </div>
    )
  }

  const issue = data.issue
  const stateColor = issue.state === "OPEN" ? "text-green-500 bg-green-500/10" : "text-red-500 bg-red-500/10"

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border flex-shrink-0">
        <div className="flex items-start gap-2">
          <CircleDot className="h-5 w-5 text-green-500 mt-0.5 flex-shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-base font-semibold">{issue.title}</h2>
              <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium", stateColor)}>
                {issue.state.charAt(0) + issue.state.slice(1).toLowerCase()}
              </span>
            </div>
            <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
              <span>#{issue.number} by <span className="font-medium text-foreground">{issue.author}</span></span>
              {issue.milestone && <span>Milestone: {issue.milestone}</span>}
              {issue.assignees.length > 0 && (
                <span>Assigned to: {issue.assignees.join(", ")}</span>
              )}
            </div>
            {issue.labels.length > 0 && (
              <div className="flex gap-1 flex-wrap mt-1.5">
                {issue.labels.map((label) => (
                  <span key={label} className="text-xs px-1.5 py-0.5 rounded bg-muted border border-border">{label}</span>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto">
        {issue.body && (
          <div className="px-4 py-3 border-b border-border">
            <p className="text-xs text-muted-foreground whitespace-pre-wrap leading-relaxed">{issue.body}</p>
          </div>
        )}

        {/* Comments */}
        {issue.comments.length > 0 && (
          <div>
            <div className="px-4 py-2 flex items-center gap-1 text-xs font-medium text-muted-foreground border-b border-border">
              <MessageSquare className="h-3 w-3" />
              {issue.comments.length} comment{issue.comments.length !== 1 ? "s" : ""}
            </div>
            <div className="divide-y divide-border">
              {issue.comments.map((comment) => (
                <div key={comment.id} className="px-4 py-3">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-medium">{comment.author}</span>
                    <span className="text-xs text-muted-foreground">
                      {comment.createdAt ? new Date(comment.createdAt).toLocaleDateString() : ""}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground whitespace-pre-wrap leading-relaxed">{comment.body}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {!issue.body && issue.comments.length === 0 && (
          <div className="h-full flex items-center justify-center text-muted-foreground">
            <p className="text-sm">No description provided</p>
          </div>
        )}
      </div>
    </div>
  )
})

interface CodeViewProps {
  path: string
  repoName: string
  projectPath: string
}

const CodeView = memo(function CodeView({ path, repoName, projectPath }: CodeViewProps) {
  // Fetch file content
  const { data, isLoading, error } = trpc.files.readProjectFile.useQuery(
    { projectPath, relativePath: path },
    { enabled: !!projectPath && !!path }
  )

  // Get file extension for icon color
  const ext = path.split(".").pop()?.toLowerCase() || ""
  const iconColor = {
    ts: "text-blue-500",
    tsx: "text-blue-500",
    js: "text-yellow-500",
    jsx: "text-yellow-500",
    py: "text-green-500",
    go: "text-cyan-500",
    rs: "text-orange-500",
    rb: "text-red-500",
    java: "text-red-500",
    swift: "text-orange-500",
    kt: "text-purple-500",
    css: "text-pink-500",
    scss: "text-pink-500",
    html: "text-orange-500",
    json: "text-yellow-500",
    md: "text-gray-500",
  }[ext] || "text-muted-foreground"

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border flex-shrink-0">
        <div className="flex items-center gap-2">
          <FileCode className={cn("h-5 w-5", iconColor)} />
          <h2 className="text-lg font-semibold truncate">{path}</h2>
        </div>
        <div className="flex items-center gap-2 mt-1">
          <p className="text-sm text-muted-foreground">{repoName}</p>
          {data?.success && (
            <span className="text-xs text-muted-foreground">
              • {data.lineCount} lines • {formatBytes(data.sizeBytes)}
            </span>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="h-full flex items-center justify-center text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : error ? (
          <div className="h-full flex flex-col items-center justify-center text-muted-foreground p-8">
            <AlertCircle className="h-8 w-8 mb-2 text-destructive" />
            <p className="text-sm text-destructive">Failed to load file</p>
            <p className="text-xs mt-1">{error.message}</p>
          </div>
        ) : data?.success ? (
          <div className="p-4">
            <CodeBlock
              code={data.content}
              language={data.language}
              showLineNumbers={true}
              wrap={false}
              className="rounded-lg border border-border bg-muted/30"
            />
          </div>
        ) : data?.error ? (
          <div className="h-full flex flex-col items-center justify-center text-muted-foreground p-8">
            <AlertCircle className="h-8 w-8 mb-2 text-destructive" />
            <p className="text-sm text-destructive">Failed to load file</p>
            <p className="text-xs mt-1">{data.error}</p>
          </div>
        ) : (
          <div className="h-full flex items-center justify-center text-muted-foreground">
            <div className="text-center">
              <p className="text-sm">Select a file to view its content</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
})

// Helper function to format bytes
function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B"
  const k = 1024
  const sizes = ["B", "KB", "MB", "GB"]
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
}