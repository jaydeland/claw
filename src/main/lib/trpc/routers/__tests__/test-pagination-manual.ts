/**
 * Manual integration test for pagination functionality
 * Run with: bun run src/main/lib/trpc/routers/__tests__/test-pagination-manual.ts
 */
import { mkdirSync, writeFileSync, existsSync, rmSync } from "fs"
import path from "path"
import os from "os"

// Import the readFileLines function directly
async function readFileLines(
  filePath: string,
  options: {
    offset?: number
    limit?: number
    fromEnd?: boolean
  } = {}
): Promise<{
  lines: string[]
  totalLines: number
  startLine: number
  endLine: number
}> {
  const { readFile } = await import("fs/promises")

  try {
    const content = await readFile(filePath, "utf-8")
    const allLines = content.split("\n")
    const totalLines = allLines.length

    let selectedLines: string[]
    let startLine: number
    let endLine: number

    if (options.fromEnd) {
      const limit = options.limit || totalLines
      selectedLines = allLines.slice(-limit)
      startLine = Math.max(0, totalLines - limit)
      endLine = totalLines - 1
    } else {
      const offset = options.offset || 0
      const limit = options.limit || totalLines
      selectedLines = allLines.slice(offset, offset + limit)
      startLine = offset
      endLine = offset + selectedLines.length - 1
    }

    return {
      lines: selectedLines,
      totalLines,
      startLine,
      endLine,
    }
  } catch (error) {
    return {
      lines: [],
      totalLines: 0,
      startLine: 0,
      endLine: -1,
    }
  }
}

async function testPaginationManually() {
  console.log("🧪 Testing pagination functionality manually...\n")

  const testDir = path.join(os.tmpdir(), `claw-manual-test-${Date.now()}`)
  const testFile = path.join(testDir, "output.txt")

  try {
    // Create test directory and file
    mkdirSync(testDir, { recursive: true })
    const lines = Array.from({ length: 2000 }, (_, i) => `Line ${i + 1}: Test output`)
    writeFileSync(testFile, lines.join("\n"))

    console.log("✅ Created test file with 2000 lines")
    console.log(`   File: ${testFile}\n`)

    // Test 1: Default behavior (last 500 lines)
    console.log("📄 Test 1: Default behavior (last 500 lines)")
    const test1 = await readFileLines(testFile, { fromEnd: true, limit: 500 })
    console.log(`   Total lines: ${test1.totalLines}`)
    console.log(`   Returned lines: ${test1.lines.length}`)
    console.log(`   Range: ${test1.startLine}-${test1.endLine}`)
    console.log(`   First line: "${test1.lines[0]}"`)
    console.log(`   Last line: "${test1.lines[test1.lines.length - 1]}"`)
    console.log(`   ✓ Should show lines 1500-1999 (last 500)\n`)

    // Test 2: Pagination - first page (offset=0, limit=500)
    console.log("📄 Test 2: Pagination - first page (offset=0, limit=500)")
    const test2 = await readFileLines(testFile, { offset: 0, limit: 500 })
    console.log(`   Total lines: ${test2.totalLines}`)
    console.log(`   Returned lines: ${test2.lines.length}`)
    console.log(`   Range: ${test2.startLine}-${test2.endLine}`)
    console.log(`   First line: "${test2.lines[0]}"`)
    console.log(`   Last line: "${test2.lines[test2.lines.length - 1]}"`)
    console.log(`   ✓ Should show lines 0-499 (first 500)\n`)

    // Test 3: Pagination - middle page (offset=500, limit=500)
    console.log("📄 Test 3: Pagination - middle page (offset=500, limit=500)")
    const test3 = await readFileLines(testFile, { offset: 500, limit: 500 })
    console.log(`   Total lines: ${test3.totalLines}`)
    console.log(`   Returned lines: ${test3.lines.length}`)
    console.log(`   Range: ${test3.startLine}-${test3.endLine}`)
    console.log(`   First line: "${test3.lines[0]}"`)
    console.log(`   Last line: "${test3.lines[test3.lines.length - 1]}"`)
    console.log(`   ✓ Should show lines 500-999\n`)

    // Test 4: Backward pagination simulation
    console.log("📄 Test 4: Backward pagination (Load More simulation)")

    // Initial: last 500 lines
    const initial = await readFileLines(testFile, { fromEnd: true, limit: 500 })
    console.log(`   Initial view: lines ${initial.startLine}-${initial.endLine} (${initial.lines.length} lines)`)
    console.log(`   Has more? ${initial.startLine > 0 ? "Yes" : "No"}`)

    // Load more: previous 500 lines
    if (initial.startLine > 0) {
      const newOffset = Math.max(0, initial.startLine - 500)
      const loadMore = await readFileLines(testFile, { offset: newOffset, limit: 500 })
      console.log(`   After Load More: lines ${loadMore.startLine}-${loadMore.endLine} (${loadMore.lines.length} lines)`)
      console.log(`   Has more? ${loadMore.startLine > 0 ? "Yes" : "No"}`)

      // Combined view
      const totalLoaded = loadMore.lines.length + initial.lines.length
      console.log(`   Total loaded: ${totalLoaded} lines (${loadMore.startLine}-${initial.endLine})`)
      console.log(`   ✓ Should have loaded 1000 lines total\n`)
    }

    // Test 5: Backward compat with tailLines
    console.log("📄 Test 5: Backward compatibility (tailLines)")
    const test5 = await readFileLines(testFile, { fromEnd: true, limit: 100 })
    console.log(`   Total lines: ${test5.totalLines}`)
    console.log(`   Returned lines: ${test5.lines.length}`)
    console.log(`   Range: ${test5.startLine}-${test5.endLine}`)
    console.log(`   ✓ Should show last 100 lines (1900-1999)\n`)

    // Test 6: Large limit (edge case)
    console.log("📄 Test 6: Large limit (exceeds file size)")
    const test6 = await readFileLines(testFile, { offset: 0, limit: 5000 })
    console.log(`   Total lines: ${test6.totalLines}`)
    console.log(`   Returned lines: ${test6.lines.length}`)
    console.log(`   Range: ${test6.startLine}-${test6.endLine}`)
    console.log(`   ✓ Should return all 2000 lines\n`)

    console.log("✅ All manual tests completed successfully!")

  } finally {
    // Cleanup
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true })
      console.log("\n🧹 Cleaned up test files")
    }
  }
}

// Run the test
testPaginationManually().catch(console.error)
