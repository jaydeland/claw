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

/**
 * Tool Output Storage
 *
 * Stores large tool outputs in files to prevent IPC crashes.
 * Full outputs are saved to app data directory and loaded on-demand.
 */

import { app } from "electron"
import * as fs from "fs/promises"
import { existsSync, mkdirSync, rmSync, readdirSync, statSync } from "fs"
import * as path from "path"

const OUTPUT_DIR_NAME = "tool-outputs"
const MAX_PREVIEW_LENGTH = 5000 // Characters to show in the chat
const MIN_SIZE_TO_OFFLOAD = 10000 // Minimum output size to trigger offloading

interface StoredOutputInfo {
  filePath: string
  fullLength: number
  preview: string
}

/**
 * Get the base directory for tool output storage
 */
function getOutputBaseDir(): string {
  const userData = app.getPath("userData")
  return path.join(userData, OUTPUT_DIR_NAME)
}

/**
 * Ensure the output directory exists for a subChat
 */
function ensureOutputDir(subChatId: string): string {
  const baseDir = getOutputBaseDir()
  const subChatDir = path.join(baseDir, subChatId)
  if (!existsSync(subChatDir)) {
    mkdirSync(subChatDir, { recursive: true })
  }
  return subChatDir
}

/**
 * Check if tool output should be offloaded to file
 */
export function shouldOffloadOutput(output: unknown): boolean {
  if (typeof output === "string") {
    return output.length > MIN_SIZE_TO_OFFLOAD
  }
  // For objects, estimate JSON size
  try {
    const jsonSize = JSON.stringify(output).length
    return jsonSize > MIN_SIZE_TO_OFFLOAD
  } catch {
    return false
  }
}

/**
 * Save tool output to file and return reference info
 */
export async function storeToolOutput(
  subChatId: string,
  toolCallId: string,
  output: unknown,
): Promise<StoredOutputInfo> {
  const outputDir = ensureOutputDir(subChatId)
  const fileName = `${toolCallId}.json`
  const filePath = path.join(outputDir, fileName)

  // Convert output to string for storage
  let outputString: string
  if (typeof output === "string") {
    outputString = output
  } else {
    outputString = JSON.stringify(output, null, 2)
  }

  // Write to file
  await fs.writeFile(filePath, outputString, "utf-8")

  // Generate preview (first N chars)
  const preview = outputString.slice(0, MAX_PREVIEW_LENGTH)

  return {
    filePath,
    fullLength: outputString.length,
    preview,
  }
}

/**
 * Load full tool output from file
 */
export async function loadToolOutput(
  subChatId: string,
  toolCallId: string,
): Promise<string | null> {
  const baseDir = getOutputBaseDir()
  const filePath = path.join(baseDir, subChatId, `${toolCallId}.json`)

  try {
    if (!existsSync(filePath)) {
      return null
    }
    return await fs.readFile(filePath, "utf-8")
  } catch (error) {
    console.error(`[ToolOutputStorage] Failed to load output for ${toolCallId}:`, error)
    return null
  }
}

/**
 * Delete tool output file
 */
export function deleteToolOutput(subChatId: string, toolCallId: string): void {
  const baseDir = getOutputBaseDir()
  const filePath = path.join(baseDir, subChatId, `${toolCallId}.json`)

  try {
    if (existsSync(filePath)) {
      rmSync(filePath)
    }
  } catch (error) {
    console.error(`[ToolOutputStorage] Failed to delete output for ${toolCallId}:`, error)
  }
}

/**
 * Delete all tool outputs for a subChat
 */
export function deleteSubChatOutputs(subChatId: string): void {
  const baseDir = getOutputBaseDir()
  const subChatDir = path.join(baseDir, subChatId)

  try {
    if (existsSync(subChatDir)) {
      rmSync(subChatDir, { recursive: true })
    }
  } catch (error) {
    console.error(`[ToolOutputStorage] Failed to delete outputs for subChat ${subChatId}:`, error)
  }
}

/**
 * Clean up orphaned output files (files without corresponding messages)
 * Call this on app startup
 */
export function cleanupOrphanedOutputs(): void {
  const baseDir = getOutputBaseDir()

  try {
    if (!existsSync(baseDir)) return

    const subChatDirs = readdirSync(baseDir)
    let cleanedCount = 0

    for (const subChatId of subChatDirs) {
      const subChatDir = path.join(baseDir, subChatId)
      const stat = statSync(subChatDir)

      if (stat.isDirectory()) {
        // Check if directory is older than 30 days
        const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000
        if (stat.mtimeMs < thirtyDaysAgo) {
          rmSync(subChatDir, { recursive: true })
          cleanedCount++
        }
      }
    }

    if (cleanedCount > 0) {
      console.log(`[ToolOutputStorage] Cleaned up ${cleanedCount} orphaned output directories`)
    }
  } catch (error) {
    console.error("[ToolOutputStorage] Cleanup failed:", error)
  }
}

/**
 * Truncate output for display in messages
 */
export function truncateOutput(output: unknown): { preview: string; isTruncated: boolean } {
  let outputString: string
  if (typeof output === "string") {
    outputString = output
  } else {
    try {
      outputString = JSON.stringify(output, null, 2)
    } catch {
      outputString = String(output)
    }
  }

  const isTruncated = outputString.length > MAX_PREVIEW_LENGTH
  const preview = isTruncated
    ? outputString.slice(0, MAX_PREVIEW_LENGTH) + "\n\n[Output truncated - click to view full]"
    : outputString

  return { preview, isTruncated }
}

interface OffloadedReference {
  _claw_output_offloaded: true
  _claw_tool_call_id: string
  _claw_full_length: number
}

/**
 * Create a smart reference that preserves structure while offloading large content.
 * For bash tools: preserves exitCode, offloads stdout/stderr
 * For generic tools: replaces entire output with reference
 */
export function createOffloadedReference(
  output: unknown,
  toolCallId: string,
  storedInfo: StoredOutputInfo,
): unknown {
  // Handle bash tool outputs specially - preserve structure
  if (
    output !== null &&
    typeof output === "object" &&
    ("stdout" in output || "stderr" in output || "exitCode" in output || "exit_code" in output)
  ) {
    const bashOutput = output as Record<string, unknown>
    const reference: Record<string, unknown> = {
      _claw_output_offloaded: true,
      _claw_tool_call_id: toolCallId,
      _claw_full_length: storedInfo.fullLength,
    }

    // Preserve exit code if present
    if ("exitCode" in bashOutput) {
      reference.exitCode = bashOutput.exitCode
    }
    if ("exit_code" in bashOutput) {
      reference.exit_code = bashOutput.exit_code
    }

    // Preserve small fields (under threshold)
    for (const [key, value] of Object.entries(bashOutput)) {
      if (key === "stdout" || key === "stderr") continue // Will be offloaded

      const valueSize = typeof value === "string" ? value.length : JSON.stringify(value).length
      if (valueSize < 1000) {
        reference[key] = value
      }
    }

    // Add previews for offloaded fields
    if (typeof bashOutput.stdout === "string" && bashOutput.stdout.length > MAX_PREVIEW_LENGTH) {
      reference.stdout = bashOutput.stdout.slice(0, MAX_PREVIEW_LENGTH) + "\n\n[Output truncated...]"
      reference._claw_stdout_preview = true
    }
    if (typeof bashOutput.stderr === "string" && bashOutput.stderr.length > MAX_PREVIEW_LENGTH) {
      reference.stderr = bashOutput.stderr.slice(0, MAX_PREVIEW_LENGTH) + "\n\n[Output truncated...]"
      reference._claw_stderr_preview = true
    }

    return reference
  }

  // For string outputs, return a simple reference with preview
  if (typeof output === "string") {
    return {
      _claw_output_offloaded: true,
      _claw_tool_call_id: toolCallId,
      _claw_full_length: storedInfo.fullLength,
      _claw_preview: output.slice(0, MAX_PREVIEW_LENGTH),
    }
  }

  // For other objects, return reference with partial preview
  return {
    _claw_output_offloaded: true,
    _claw_tool_call_id: toolCallId,
    _claw_full_length: storedInfo.fullLength,
    // Keep first few small fields as preview
    ...Object.fromEntries(
      Object.entries(output as Record<string, unknown>)
        .filter(([, v]) => {
          const size = typeof v === "string" ? v.length : JSON.stringify(v).length
          return size < 500
        })
        .slice(0, 5),
    ),
  }
}
