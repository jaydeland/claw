// Copyright 2026 Claw Contributors
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import * as fs from "fs/promises"
import * as path from "path"

/** Standard claw living document files */
export const CLAW_FILE_TYPES = {
  SOUL: "soul",
  MEMORY: "memory",
  LEARNINGS: "learnings",
  ERRORS: "errors",
  FEATURES: "features",
  HEARTBEAT: "heartbeat",
  IDENTITY: "identity",
  AGENTS: "agents",
} as const

export type ClawFileType = typeof CLAW_FILE_TYPES[keyof typeof CLAW_FILE_TYPES]

/** Map file types to filenames */
export const FILE_TYPE_TO_NAME: Record<ClawFileType, string> = {
  [CLAW_FILE_TYPES.SOUL]: "SOUL.md",
  [CLAW_FILE_TYPES.MEMORY]: "MEMORY.md",
  [CLAW_FILE_TYPES.LEARNINGS]: "LEARNINGS.md",
  [CLAW_FILE_TYPES.ERRORS]: "ERRORS.md",
  [CLAW_FILE_TYPES.FEATURES]: "FEATURE_REQUESTS.md",
  [CLAW_FILE_TYPES.HEARTBEAT]: "HEARTBEAT.md",
  [CLAW_FILE_TYPES.IDENTITY]: "IDENTITY.md",
  [CLAW_FILE_TYPES.AGENTS]: "AGENTS.md",
}

/** Default content for each file type */
export const DEFAULT_FILE_CONTENTS: Record<ClawFileType, string> = {
  [CLAW_FILE_TYPES.SOUL]: `# SOUL - Agent Identity & Values

This document defines the core identity, values, and behavioral principles of this claw.

## Core Identity


## Values


## Behavioral Principles


`,
  [CLAW_FILE_TYPES.MEMORY]: `# MEMORY - Hot Memory

Hot memory (≤100 lines) - always loaded context.

## Current Context


## Active Learnings


`,
  [CLAW_FILE_TYPES.LEARNINGS]: `# LEARNINGS - Self-Improvement Entries

Entries written when the claw succeeds or discovers better approaches.

## Format
- **Date**: When the learning occurred
- **Context**: What triggered this learning
- **Learning**: What was discovered
- **Application**: How to apply going forward

---

`,
  [CLAW_FILE_TYPES.ERRORS]: `# ERRORS - Error Patterns & Solutions

Error patterns encountered and their solutions.

## Format
- **Error**: What went wrong
- **Context**: When it occurred
- **Solution**: How it was fixed
- **Prevention**: How to avoid in future

---

`,
  [CLAW_FILE_TYPES.FEATURES]: `# FEATURE REQUESTS - Capability Gaps

Features requested by users or identified as missing capabilities.

## Format
- **Feature**: What's needed
- **Priority**: Importance level
- **Status**: Open/In Progress/Completed
- **Notes**: Additional context

---

`,
  [CLAW_FILE_TYPES.HEARTBEAT]: `# HEARTBEAT - Periodic Checklist

Periodic self-check checklist run every ~30 minutes.

## Checklist
- [ ] Review recent errors
- [ ] Check for user feedback
- [ ] Assess current performance
- [ ] Identify improvement opportunities

## Last Check


`,
  [CLAW_FILE_TYPES.IDENTITY]: `# IDENTITY - Agent Persona

Defines this agent's persona and role.

## Persona


## Role


## Communication Style


`,
  [CLAW_FILE_TYPES.AGENTS]: `# AGENTS - Multi-Agent Orchestration

Rules for multi-agent collaboration and routing.

## Orchestration Rules


## Agent Roles


`,
}

/**
 * Ensure .claw directory exists in worktree
 */
export async function ensureClawDirectory(worktreePath: string): Promise<string> {
  const clawDir = path.join(worktreePath, ".claw")
  try {
    await fs.access(clawDir)
    return clawDir
  } catch {
    await fs.mkdir(clawDir, { recursive: true })
    // Create default files
    await Promise.all(
      Object.entries(FILE_TYPE_TO_NAME).map(async ([type, fileName]) => {
        const filePath = path.join(clawDir, fileName)
        const clawType = type as ClawFileType
        await fs.writeFile(filePath, DEFAULT_FILE_CONTENTS[clawType])
      })
    )
    return clawDir
  }
}

/**
 * Get all claw files from .claw directory
 */
export async function getClawFiles(worktreePath: string): Promise<
  Array<{
    fileType: ClawFileType
    fileName: string
    content: string
    lastModified: Date
    size: number
  }>
> {
  const clawDir = path.join(worktreePath, ".claw")
  try {
    await fs.access(clawDir)
  } catch {
    return []
  }

  const files = await fs.readdir(clawDir)
  const results: Array<{
    fileType: ClawFileType
    fileName: string
    content: string
    lastModified: Date
    size: number
  }> = []

  for (const file of files) {
    if (!file.endsWith(".md")) continue

    const filePath = path.join(clawDir, file)
    const stats = await fs.stat(filePath)
    const content = await fs.readFile(filePath, "utf-8")

    // Find matching file type
    const fileType = Object.entries(FILE_TYPE_TO_NAME).find(
      ([_, fileName]) => fileName === file
    )?.[0] as ClawFileType | undefined

    if (fileType) {
      results.push({
        fileType,
        fileName: file,
        content,
        lastModified: stats.mtime,
        size: stats.size,
      })
    }
  }

  return results
}

/**
 * Get a specific claw file content
 */
export async function getClawFile(
  worktreePath: string,
  fileName: string
): Promise<{ content: string; lastModified: Date } | null> {
  const filePath = path.join(worktreePath, ".claw", fileName)
  try {
    await fs.access(filePath)
    const stats = await fs.stat(filePath)
    const content = await fs.readFile(filePath, "utf-8")
    return { content, lastModified: stats.mtime }
  } catch {
    return null
  }
}

/**
 * Save a claw file
 */
export async function saveClawFile(
  worktreePath: string,
  fileName: string,
  content: string
): Promise<void> {
  const clawDir = await ensureClawDirectory(worktreePath)
  const filePath = path.join(clawDir, fileName)
  await fs.writeFile(filePath, content)
}

/**
 * Delete a claw file
 */
export async function deleteClawFile(
  worktreePath: string,
  fileName: string
): Promise<void> {
  const filePath = path.join(worktreePath, ".claw", fileName)
  await fs.unlink(filePath)
}

/**
 * Parse file type from filename
 */
export function parseFileType(fileName: string): ClawFileType | null {
  const entry = Object.entries(FILE_TYPE_TO_NAME).find(
    ([_, fname]) => fname === fileName
  )
  return entry?.[0] as ClawFileType | null
}
