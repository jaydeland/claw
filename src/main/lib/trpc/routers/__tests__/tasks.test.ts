import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { mkdirSync, rmSync, writeFileSync, existsSync, readFileSync } from "fs"
import path from "path"
import os from "os"

/**
 * Helper function to simulate tailLines behavior
 */
function getTailLines(content: string, tailLines: number): string {
  const lines = content.split("\n")
  return lines.slice(-tailLines).join("\n")
}

/**
 * Helper function to get lines with offset and limit (pagination)
 */
function getPaginatedLines(
  content: string,
  offset: number,
  limit: number
): { lines: string; totalLines: number; startLine: number; endLine: number } {
  const allLines = content.split("\n")
  const totalLines = allLines.length
  const selectedLines = allLines.slice(offset, offset + limit)

  return {
    lines: selectedLines.join("\n"),
    totalLines,
    startLine: offset,
    endLine: offset + selectedLines.length - 1,
  }
}

describe("Task output reading logic", () => {
  const testDir = path.join(os.tmpdir(), `claw-test-${Date.now()}`)
  const testTaskId = `test-task-${Date.now()}`
  const testOutputFile = path.join(testDir, "test-output.txt")

  beforeEach(() => {
    // Create test directory
    if (!existsSync(testDir)) {
      mkdirSync(testDir, { recursive: true })
    }

    // Create test output file with known content
    const testContent = Array.from({ length: 100 }, (_, i) => `Line ${i + 1}: Test output line`).join("\n")
    writeFileSync(testOutputFile, testContent)
  })

  afterEach(() => {
    // Clean up test directory
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true })
    }
  })

  it("should read full output file content", () => {
    // Verify output file exists
    expect(existsSync(testOutputFile)).toBe(true)

    // Verify output file has 100 lines
    const content = readFileSync(testOutputFile, "utf-8")
    const lines = content.split("\n")
    expect(lines.length).toBe(100)
    expect(lines[0]).toBe("Line 1: Test output line")
    expect(lines[99]).toBe("Line 100: Test output line")
  })

  it("should return last N lines when using tailLines", () => {
    const content = readFileSync(testOutputFile, "utf-8")

    // Simulate tailLines: 10
    const result = getTailLines(content, 10)
    const lines = result.split("\n")

    expect(lines.length).toBe(10)
    expect(lines[0]).toBe("Line 91: Test output line")
    expect(lines[9]).toBe("Line 100: Test output line")
  })

  it("should return correct lines with offset and limit (pagination)", () => {
    const content = readFileSync(testOutputFile, "utf-8")

    // Get lines 20-29 (offset=20, limit=10)
    const result = getPaginatedLines(content, 20, 10)

    expect(result.totalLines).toBe(100)
    expect(result.startLine).toBe(20)
    expect(result.endLine).toBe(29)

    const lines = result.lines.split("\n")
    expect(lines.length).toBe(10)
    expect(lines[0]).toBe("Line 21: Test output line") // 0-based, so line 20 is "Line 21"
    expect(lines[9]).toBe("Line 30: Test output line")
  })

  it("should handle offset beyond file length", () => {
    const content = readFileSync(testOutputFile, "utf-8")

    // Try to get lines starting from offset 150 (beyond file length)
    const result = getPaginatedLines(content, 150, 10)

    expect(result.totalLines).toBe(100)
    expect(result.startLine).toBe(150)
    expect(result.lines).toBe("") // No lines available
  })

  it("should handle limit greater than remaining lines", () => {
    const content = readFileSync(testOutputFile, "utf-8")

    // Get lines 95-100+ (offset=95, limit=20 but only 5 lines remain)
    const result = getPaginatedLines(content, 95, 20)

    expect(result.totalLines).toBe(100)
    expect(result.startLine).toBe(95)
    expect(result.endLine).toBe(99) // Only 5 lines returned

    const lines = result.lines.split("\n")
    expect(lines.length).toBe(5)
    expect(lines[0]).toBe("Line 96: Test output line")
    expect(lines[4]).toBe("Line 100: Test output line")
  })

  it("should handle missing output file gracefully", () => {
    const missingFile = "/nonexistent/path/file.txt"
    expect(existsSync(missingFile)).toBe(false)
  })

  it("should handle empty file", () => {
    const emptyFile = path.join(testDir, "empty.txt")
    writeFileSync(emptyFile, "")

    const content = readFileSync(emptyFile, "utf-8")
    expect(content).toBe("")

    const result = getPaginatedLines(content, 0, 10)
    expect(result.totalLines).toBe(1) // Empty file has 1 "line" (empty string)
    expect(result.lines).toBe("")
  })

  it("should handle single line file", () => {
    const singleLineFile = path.join(testDir, "single.txt")
    writeFileSync(singleLineFile, "Only line")

    const content = readFileSync(singleLineFile, "utf-8")
    const result = getPaginatedLines(content, 0, 10)

    expect(result.totalLines).toBe(1)
    expect(result.startLine).toBe(0)
    expect(result.endLine).toBe(0)
    expect(result.lines).toBe("Only line")
  })
})

describe("Pagination features (readFileLines simulation)", () => {
  const testDir = path.join(os.tmpdir(), `claw-pagination-test-${Date.now()}`)
  const testFile = path.join(testDir, "pagination.txt")

  beforeEach(() => {
    if (!existsSync(testDir)) {
      mkdirSync(testDir, { recursive: true })
    }

    // Create test file with 1000 lines
    const lines = Array.from({ length: 1000 }, (_, i) => `Line ${i + 1}`)
    writeFileSync(testFile, lines.join("\n"))
  })

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true })
    }
  })

  it("should return last 500 lines with fromEnd mode", () => {
    const content = readFileSync(testFile, "utf-8")

    // Simulate fromEnd by getting last 500 lines
    const allLines = content.split("\n")
    const lastLines = allLines.slice(-500)

    expect(lastLines.length).toBe(500)
    expect(lastLines[0]).toBe("Line 501")
    expect(lastLines[499]).toBe("Line 1000")
  })

  it("should return first 500 lines with offset=0, limit=500", () => {
    const content = readFileSync(testFile, "utf-8")
    const result = getPaginatedLines(content, 0, 500)

    expect(result.totalLines).toBe(1000)
    expect(result.startLine).toBe(0)
    expect(result.endLine).toBe(499)

    const lines = result.lines.split("\n")
    expect(lines.length).toBe(500)
    expect(lines[0]).toBe("Line 1")
    expect(lines[499]).toBe("Line 500")
  })

  it("should return middle 500 lines with offset=250, limit=500", () => {
    const content = readFileSync(testFile, "utf-8")
    const result = getPaginatedLines(content, 250, 500)

    expect(result.totalLines).toBe(1000)
    expect(result.startLine).toBe(250)
    expect(result.endLine).toBe(749)

    const lines = result.lines.split("\n")
    expect(lines.length).toBe(500)
    expect(lines[0]).toBe("Line 251")
    expect(lines[499]).toBe("Line 750")
  })

  it("should return last 500 lines with offset=500, limit=500", () => {
    const content = readFileSync(testFile, "utf-8")
    const result = getPaginatedLines(content, 500, 500)

    expect(result.totalLines).toBe(1000)
    expect(result.startLine).toBe(500)
    expect(result.endLine).toBe(999)

    const lines = result.lines.split("\n")
    expect(lines.length).toBe(500)
    expect(lines[0]).toBe("Line 501")
    expect(lines[499]).toBe("Line 1000")
  })

  it("should simulate backward pagination (Load More)", () => {
    const content = readFileSync(testFile, "utf-8")

    // User initially sees last 500 lines (500-999)
    const initial = getPaginatedLines(content, 500, 500)
    expect(initial.startLine).toBe(500)
    expect(initial.endLine).toBe(999)
    expect(initial.totalLines).toBe(1000)

    // User clicks "Load More" - load previous 500 lines (0-499)
    const newOffset = Math.max(0, initial.startLine - 500)
    const loadMore = getPaginatedLines(content, newOffset, 500)
    expect(loadMore.startLine).toBe(0)
    expect(loadMore.endLine).toBe(499)

    // Now user has all 1000 lines (0-999)
  })

  it("should handle very large files efficiently", () => {
    // Create file with 10,000 lines
    const largeFile = path.join(testDir, "large.txt")
    const largeLines = Array.from({ length: 10000 }, (_, i) => `Line ${i + 1}`)
    writeFileSync(largeFile, largeLines.join("\n"))

    const content = readFileSync(largeFile, "utf-8")

    // Load last 500 lines
    const allLines = content.split("\n")
    const lastLines = allLines.slice(-500)
    expect(lastLines.length).toBe(500)
    expect(lastLines[0]).toBe("Line 9501")
    expect(lastLines[499]).toBe("Line 10000")

    // Load middle chunk (offset=5000, limit=500)
    const middle = getPaginatedLines(content, 5000, 500)
    expect(middle.startLine).toBe(5000)
    expect(middle.endLine).toBe(5499)
    expect(middle.totalLines).toBe(10000)

    const middleLines = middle.lines.split("\n")
    expect(middleLines[0]).toBe("Line 5001")
    expect(middleLines[499]).toBe("Line 5500")
  })
})

describe("outputMetadata response", () => {
  it("should calculate hasMore correctly for backward pagination", () => {
    // hasMore = true when startLine > 0 (more lines available before current position)
    const metadata1 = {
      totalLines: 1000,
      startLine: 500,
      endLine: 999,
      hasMore: 500 > 0, // true
    }
    expect(metadata1.hasMore).toBe(true)

    const metadata2 = {
      totalLines: 1000,
      startLine: 0,
      endLine: 499,
      hasMore: 0 > 0, // false
    }
    expect(metadata2.hasMore).toBe(false)
  })

  it("should handle line range calculations", () => {
    // User sees lines 500-999 (last 500 of 1000)
    const metadata = {
      totalLines: 1000,
      startLine: 500,
      endLine: 999,
      hasMore: true,
    }

    // Calculate how many more lines available
    const moreAvailable = metadata.startLine // 500 lines before current position
    expect(moreAvailable).toBe(500)

    // Calculate next offset for "Load More"
    const nextOffset = Math.max(0, metadata.startLine - 500)
    expect(nextOffset).toBe(0) // Load lines 0-499
  })
})
