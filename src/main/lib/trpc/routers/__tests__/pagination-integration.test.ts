/**
 * Integration test for pagination with actual database and file operations
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { mkdirSync, rmSync, writeFileSync, existsSync } from "fs"
import path from "path"
import os from "os"
import { getDatabase, backgroundTasks, subChats, chats, projects } from "../../../db"
import { eq } from "drizzle-orm"

describe("Pagination Integration Test with Real Database", () => {
  const testDir = path.join(os.tmpdir(), `claw-integration-test-${Date.now()}`)
  const testOutputFile = path.join(testDir, "task-output.txt")
  const testTaskId = `integration-task-${Date.now()}`

  beforeEach(() => {
    // Create test directory
    if (!existsSync(testDir)) {
      mkdirSync(testDir, { recursive: true })
    }

    // Create test output file with 2000 lines
    const lines = Array.from({ length: 2000 }, (_, i) => `Line ${i + 1}: Test pagination output line with realistic content`)
    writeFileSync(testOutputFile, lines.join("\n"))

    // Insert test data into database
    const db = getDatabase()

    // Create test project
    db.insert(projects)
      .values({
        id: "integration-project",
        name: "Integration Test Project",
        path: testDir,
      })
      .run()

    // Create test chat
    db.insert(chats)
      .values({
        id: "integration-chat",
        name: "Integration Test Chat",
        projectId: "integration-project",
      })
      .run()

    // Create test sub-chat
    db.insert(subChats)
      .values({
        id: "integration-subchat",
        name: "Integration Test Sub-Chat",
        chatId: "integration-chat",
        sessionId: "integration-session",
        mode: "agent",
        messages: [],
      })
      .run()

    // Create test background task
    db.insert(backgroundTasks)
      .values({
        id: testTaskId,
        subChatId: "integration-subchat",
        chatId: "integration-chat",
        toolCallId: "integration-tool-call",
        outputFile: testOutputFile,
        sdkTaskId: "integration-sdk-task",
        sdkStatus: "completed",
      })
      .run()
  })

  afterEach(() => {
    // Clean up test data
    const db = getDatabase()
    db.delete(backgroundTasks).where(eq(backgroundTasks.id, testTaskId)).run()
    db.delete(subChats).where(eq(subChats.id, "integration-subchat")).run()
    db.delete(chats).where(eq(chats.id, "integration-chat")).run()
    db.delete(projects).where(eq(projects.id, "integration-project")).run()

    // Clean up test directory
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true })
    }
  })

  it("should load task from database with output file", () => {
    const db = getDatabase()
    const task = db
      .select()
      .from(backgroundTasks)
      .where(eq(backgroundTasks.id, testTaskId))
      .get()

    expect(task).toBeDefined()
    expect(task?.id).toBe(testTaskId)
    expect(task?.outputFile).toBe(testOutputFile)
    expect(task?.sdkTaskId).toBe("integration-sdk-task")
    expect(task?.sdkStatus).toBe("completed")
    expect(existsSync(testOutputFile)).toBe(true)
  })

  it("should read output file and verify line count", () => {
    const fs = require("fs")
    const content = fs.readFileSync(testOutputFile, "utf-8")
    const lines = content.split("\n")

    expect(lines.length).toBe(2000)
    expect(lines[0]).toBe("Line 1: Test pagination output line with realistic content")
    expect(lines[1999]).toBe("Line 2000: Test pagination output line with realistic content")
  })

  it("should simulate getWithOutput with tailLines (backward compat)", async () => {
    const { readFile } = await import("fs/promises")

    // Simulate the procedure logic
    const content = await readFile(testOutputFile, "utf-8")
    const allLines = content.split("\n")

    // tailLines: 500 should return last 500 lines
    const tailLines = 500
    const lastLines = allLines.slice(-tailLines)

    expect(lastLines.length).toBe(500)
    expect(lastLines[0]).toBe("Line 1501: Test pagination output line with realistic content")
    expect(lastLines[499]).toBe("Line 2000: Test pagination output line with realistic content")

    // Metadata
    const metadata = {
      totalLines: allLines.length,
      startLine: allLines.length - tailLines,
      endLine: allLines.length - 1,
      hasMore: (allLines.length - tailLines) > 0,
    }

    expect(metadata.totalLines).toBe(2000)
    expect(metadata.startLine).toBe(1500)
    expect(metadata.endLine).toBe(1999)
    expect(metadata.hasMore).toBe(true)
  })

  it("should simulate getWithOutput with pagination (offset + limit)", async () => {
    const { readFile } = await import("fs/promises")

    // Simulate the procedure logic
    const content = await readFile(testOutputFile, "utf-8")
    const allLines = content.split("\n")

    // offset: 1000, limit: 500 should return lines 1000-1499
    const offset = 1000
    const limit = 500
    const selectedLines = allLines.slice(offset, offset + limit)

    expect(selectedLines.length).toBe(500)
    expect(selectedLines[0]).toBe("Line 1001: Test pagination output line with realistic content")
    expect(selectedLines[499]).toBe("Line 1500: Test pagination output line with realistic content")

    // Metadata
    const metadata = {
      totalLines: allLines.length,
      startLine: offset,
      endLine: offset + selectedLines.length - 1,
      hasMore: offset > 0,
    }

    expect(metadata.totalLines).toBe(2000)
    expect(metadata.startLine).toBe(1000)
    expect(metadata.endLine).toBe(1499)
    expect(metadata.hasMore).toBe(true)
  })

  it("should simulate full backward pagination flow", async () => {
    const { readFile } = await import("fs/promises")
    const content = await readFile(testOutputFile, "utf-8")
    const allLines = content.split("\n")

    console.log("\n📊 Simulating full pagination flow:")

    // Step 1: Initial load (last 500 lines)
    let currentStartLine = 1500
    let currentEndLine = 1999
    let loadedLines: string[] = allLines.slice(currentStartLine, currentEndLine + 1)

    console.log(`  Step 1: Initial load - Lines ${currentStartLine}-${currentEndLine} (${loadedLines.length} lines)`)
    expect(loadedLines.length).toBe(500)
    expect(currentStartLine > 0).toBe(true) // hasOlderLines

    // Step 2: Load More #1 (lines 1000-1499)
    const loadMore1Offset = Math.max(0, currentStartLine - 500)
    const loadMore1Lines = allLines.slice(loadMore1Offset, loadMore1Offset + 500)
    loadedLines = [...loadMore1Lines, ...loadedLines] // Prepend
    currentStartLine = loadMore1Offset

    console.log(`  Step 2: Load More #1 - Lines ${currentStartLine}-${currentEndLine} (${loadedLines.length} total)`)
    expect(loadedLines.length).toBe(1000)
    expect(loadMore1Lines[0]).toBe("Line 1001: Test pagination output line with realistic content")

    // Step 3: Load More #2 (lines 500-999)
    const loadMore2Offset = Math.max(0, currentStartLine - 500)
    const loadMore2Lines = allLines.slice(loadMore2Offset, loadMore2Offset + 500)
    loadedLines = [...loadMore2Lines, ...loadedLines] // Prepend
    currentStartLine = loadMore2Offset

    console.log(`  Step 3: Load More #2 - Lines ${currentStartLine}-${currentEndLine} (${loadedLines.length} total)`)
    expect(loadedLines.length).toBe(1500)
    expect(loadMore2Lines[0]).toBe("Line 501: Test pagination output line with realistic content")

    // Step 4: Load More #3 (lines 0-499)
    const loadMore3Offset = Math.max(0, currentStartLine - 500)
    const loadMore3Lines = allLines.slice(loadMore3Offset, loadMore3Offset + 500)
    loadedLines = [...loadMore3Lines, ...loadedLines] // Prepend
    currentStartLine = loadMore3Offset

    console.log(`  Step 4: Load More #3 - Lines ${currentStartLine}-${currentEndLine} (${loadedLines.length} total)`)
    expect(loadedLines.length).toBe(2000)
    expect(loadMore3Lines[0]).toBe("Line 1: Test pagination output line with realistic content")
    expect(currentStartLine).toBe(0) // No more older lines

    // Final verification
    console.log(`  ✅ Complete: All ${loadedLines.length} lines loaded\n`)
    expect(loadedLines[0]).toBe("Line 1: Test pagination output line with realistic content")
    expect(loadedLines[1999]).toBe("Line 2000: Test pagination output line with realistic content")
  })

  it("should verify database query returns correct task", () => {
    const db = getDatabase()

    // This simulates what the tRPC procedure does
    const task = db
      .select()
      .from(backgroundTasks)
      .where(eq(backgroundTasks.id, testTaskId))
      .get()

    expect(task).not.toBeNull()
    expect(task?.outputFile).toBe(testOutputFile)
    expect(task?.sdkStatus).toBe("completed")

    console.log("\n✅ Database query successful:", {
      taskId: task?.id,
      outputFile: task?.outputFile,
      sdkStatus: task?.sdkStatus,
      fileExists: existsSync(task?.outputFile || ""),
    })
  })
})
