/**
 * GitHub View Atoms
 *
 * State management for the GitHub view feature.
 */

import { atom } from "jotai"
import { atomWithStorage } from "jotai/utils"

// Define AnalysisType locally to avoid importing from main process
export type AnalysisType = "codeflow" | "db" | "architecture" | "build"

// ============ SELECTION TYPES ============

export type GitHubSelectionType = "pr" | "issue" | "code" | "visualize"

export type GitHubSelection =
  | { type: "pr"; repoId: string; repoName: string; prNumber: number }
  | { type: "issue"; repoId: string; repoName: string; issueNumber: number }
  | { type: "code"; repoId: string; repoName: string; path: string }
  | { type: "visualize"; repoId: string; repoName: string; analysisType: AnalysisType }
  | null

// ============ TREE STATE ============

/**
 * Currently selected item in the GitHub tree
 */
export const githubSelectionAtom = atomWithStorage<GitHubSelection>(
  "github:selection",
  null,
  undefined,
  { getOnInit: true }
)

/**
 * Expanded repo IDs in the tree view
 */
export const githubExpandedReposAtom = atomWithStorage<Set<string>>(
  "github:expandedRepos",
  new Set(),
  {
    getItem: (key, initialValue) => {
      const stored = localStorage.getItem(key)
      if (!stored) return initialValue
      try {
        const arr = JSON.parse(stored) as string[]
        return new Set(arr)
      } catch {
        return initialValue
      }
    },
    setItem: (key, value) => {
      localStorage.setItem(key, JSON.stringify(Array.from(value)))
    },
    removeItem: (key) => {
      localStorage.removeItem(key)
    },
  },
  { getOnInit: true }
)

/**
 * Expanded sections within a repo (prs, issues, code, visualize)
 */
export const githubExpandedSectionsAtom = atomWithStorage<Set<string>>(
  "github:expandedSections",
  new Set(["prs", "visualize"]), // Default expanded sections
  {
    getItem: (key, initialValue) => {
      const stored = localStorage.getItem(key)
      if (!stored) return initialValue
      try {
        const arr = JSON.parse(stored) as string[]
        return new Set(arr)
      } catch {
        return initialValue
      }
    },
    setItem: (key, value) => {
      localStorage.setItem(key, JSON.stringify(Array.from(value)))
    },
    removeItem: (key) => {
      localStorage.removeItem(key)
    },
  },
  { getOnInit: true }
)

// ============ CHAT STATE ============

export interface GitHubChatMessage {
  id: string
  role: "user" | "assistant"
  content: string
  timestamp: Date
  context?: GitHubChatContext
}

export interface GitHubChatContext {
  type: GitHubSelectionType
  prNumber?: number
  issueNumber?: number
  filePath?: string
  analysisType?: AnalysisType
  repoId: string
  repoName: string
}

/**
 * Chat messages for the GitHub view
 * Cleared when action buttons are clicked
 */
export const githubChatMessagesAtom = atom<GitHubChatMessage[]>([])

/**
 * Current chat context (set when action button is clicked)
 */
export const githubChatContextAtom = atom<GitHubChatContext | null>(null)

/**
 * Whether the chat is currently loading/generating
 */
export const githubChatLoadingAtom = atom<boolean>(false)

/**
 * Signal to start a chat with a specific message
 * Set this to trigger a new chat in the GitHub view chat pane
 */
export const githubStartChatAtom = atom<{ message: string; type: "explain" | "diagram"; autoStart?: boolean } | null>(null)

// ============ DATA STATE ============

export interface GitHubRepo {
  id: string
  name: string
  fullName: string
  owner: string
  url: string
  localPath?: string
  projectId?: string
}

export interface GitHubPR {
  number: number
  title: string
  state: "open" | "closed" | "merged"
  author: string
  createdAt: string
  updatedAt: string
  headBranch: string
  baseBranch: string
  draft: boolean
}

export interface GitHubIssue {
  number: number
  title: string
  state: "open" | "closed"
  author: string
  createdAt: string
  updatedAt: string
  labels: string[]
  assignees: string[]
}

export interface GitHubFile {
  path: string
  type: "file" | "dir"
  size?: number
}

/**
 * Loaded repos for the workspace
 */
export const githubReposAtom = atom<GitHubRepo[]>([])

/**
 * Loading state for repos
 */
export const githubReposLoadingAtom = atom<boolean>(false)

/**
 * PRs by repo ID
 */
export const githubPRsAtom = atom<Map<string, GitHubPR[]>>(new Map())

/**
 * Issues by repo ID
 */
export const githubIssuesAtom = atom<Map<string, GitHubIssue[]>>(new Map())

/**
 * Files by repo ID
 */
export const githubFilesAtom = atom<Map<string, GitHubFile[]>>(new Map())

/**
 * Expanded folders in the code tree (set of folder paths)
 * Not persisted — Set doesn't round-trip through JSON, and expand state is ephemeral UI state
 */
export const githubExpandedFoldersAtom = atom<Set<string>>(new Set<string>())

// ============ CONTENT STATE ============

export interface PRDetail extends GitHubPR {
  body: string
  additions: number
  deletions: number
  changedFiles: number
  commits: Array<{
    sha: string
    message: string
    author: string
    date: string
  }>
  files: Array<{
    path: string
    additions: number
    deletions: number
    changeType: "added" | "modified" | "deleted" | "renamed"
  }>
}

export interface IssueDetail extends GitHubIssue {
  body: string
  comments: Array<{
    id: number
    author: string
    body: string
    createdAt: string
  }>
}

/**
 * Currently loaded PR detail
 */
export const githubPRDetailAtom = atom<PRDetail | null>(null)

/**
 * Currently loaded issue detail
 */
export const githubIssueDetailAtom = atom<IssueDetail | null>(null)

/**
 * Currently loaded file content
 */
export const githubFileContentAtom = atom<{ path: string; content: string; language: string } | null>(null)

/**
 * Loading state for content
 */
export const githubContentLoadingAtom = atom<boolean>(false)

// ============ PANEL SIZING ============

/**
 * Width of the tree pane (left)
 */
export const githubTreeWidthAtom = atomWithStorage<number>(
  "github:treeWidth",
  240,
  undefined,
  { getOnInit: true }
)

/**
 * Width of the content pane (relative to chat pane)
 */
export const githubContentWidthAtom = atomWithStorage<number>(
  "github:contentWidth",
  500,
  undefined,
  { getOnInit: true }
)

// ============ DIAGRAM STATE (local, not shared with analyze feature) ============

export interface FlowNode {
  id: string
  type?: string
  position: { x: number; y: number }
  data: Record<string, unknown>
  width?: number
  height?: number
}

export interface FlowEdge {
  id: string
  source: string
  target: string
  sourceHandle?: string | null
  targetHandle?: string | null
  type?: string
  label?: string
  data?: Record<string, unknown>
}

export interface FlowViewport {
  x: number
  y: number
  zoom: number
}

export interface DiagramData {
  nodes: FlowNode[]
  edges: FlowEdge[]
  viewport?: FlowViewport
  summary?: string
  stats?: Record<string, unknown>
}

// Current diagram data (loaded from DB or generated)
export const githubDiagramDataAtom = atom<DiagramData | null>(null)

// Diagram loading state
export const githubDiagramLoadingAtom = atom<boolean>(false)

// Diagram error state
export const githubDiagramErrorAtom = atom<string | null>(null)

// ============ BRANCH STATE ============

/**
 * Selected branch by project path
 */
export const githubSelectedBranchAtom = atomWithStorage<Record<string, string>>(
  "github:selectedBranch",
  {},
  undefined,
  { getOnInit: true }
)