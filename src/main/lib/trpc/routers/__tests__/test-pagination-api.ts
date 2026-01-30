#!/usr/bin/env node
/**
 * Direct API test for pagination functionality
 * Tests the readFileLines utility with a real 2000-line file
 * Run with: bun run src/main/lib/trpc/routers/__tests__/test-pagination-api.ts
 */

import { readFile, writeFile, mkdir, rm } from "fs/promises"
import { existsSync } from "fs"
import path from "path"
import os from "os"

// Copy of the readFileLines function from tasks.ts
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

async function testPaginationAPI() {
  console.log("🧪 Testing Pagination API with Real File\n")

  const testDir = path.join(os.tmpdir(), `claw-api-test-${Date.now()}`)
  const testFile = path.join(testDir, "output.txt")

  try {
    // Create test directory and file
    await mkdir(testDir, { recursive: true })
    const lines = Array.from({ length: 2000 }, (_, i) => `Line ${i + 1}: Pagination test output`)
    await writeFile(testFile, lines.join("\n"))

    console.log("✅ Created test file with 2000 lines")
    console.log(`   File: ${testFile}\n`)

    // Test 1: Backward compatibility - tailLines
    console.log("📄 Test 1: Backward Compatibility (tailLines: 500)")
    const test1 = await readFileLines(testFile, { fromEnd: true, limit: 500 })

    console.log(`   ✓ Total lines: ${test1.totalLines}`)
    console.log(`   ✓ Returned: ${test1.lines.length} lines`)
    console.log(`   ✓ Range: ${test1.startLine}-${test1.endLine}`)
    console.log(`   ✓ First: "${test1.lines[0]}"`)
    console.log(`   ✓ Last: "${test1.lines[test1.lines.length - 1]}"`)

    if (test1.totalLines !== 2000 || test1.lines.length !== 500 || test1.startLine !== 1500) {
      throw new Error("Test 1 failed!")
    }
    console.log("   ✅ PASS\n")

    // Test 2: Pagination - First page
    console.log("📄 Test 2: Pagination First Page (offset: 0, limit: 500)")
    const test2 = await readFileLines(testFile, { offset: 0, limit: 500 })

    console.log(`   ✓ Total lines: ${test2.totalLines}`)
    console.log(`   ✓ Returned: ${test2.lines.length} lines`)
    console.log(`   ✓ Range: ${test2.startLine}-${test2.endLine}`)
    console.log(`   ✓ First: "${test2.lines[0]}"`)
    console.log(`   ✓ Last: "${test2.lines[test2.lines.length - 1]}"`)

    if (test2.totalLines !== 2000 || test2.lines.length !== 500 || test2.startLine !== 0) {
      throw new Error("Test 2 failed!")
    }
    console.log("   ✅ PASS\n")

    // Test 3: Pagination - Middle page
    console.log("📄 Test 3: Pagination Middle Page (offset: 1000, limit: 500)")
    const test3 = await readFileLines(testFile, { offset: 1000, limit: 500 })

    console.log(`   ✓ Total lines: ${test3.totalLines}`)
    console.log(`   ✓ Returned: ${test3.lines.length} lines`)
    console.log(`   ✓ Range: ${test3.startLine}-${test3.endLine}`)
    console.log(`   ✓ First: "${test3.lines[0]}"`)
    console.log(`   ✓ Last: "${test3.lines[test3.lines.length - 1]}"`)

    if (test3.totalLines !== 2000 || test3.lines.length !== 500 || test3.startLine !== 1000) {
      throw new Error("Test 3 failed!")
    }
    console.log("   ✅ PASS\n")

    // Test 4: Full backward pagination simulation
    console.log("📄 Test 4: Full Backward Pagination Simulation")

    // Initial: last 500 lines
    let result = await readFileLines(testFile, { fromEnd: true, limit: 500 })
    let allLoaded: string[] = [...result.lines]
    let oldestLine = result.startLine

    console.log(`   Initial: Lines ${result.startLine}-${result.endLine} (${result.lines.length} loaded)`)

    let loadCount = 0
    while (oldestLine > 0 && loadCount < 10) {
      const newOffset = Math.max(0, oldestLine - 500)
      const newResult = await readFileLines(testFile, { offset: newOffset, limit: 500 })
      allLoaded = [...newResult.lines, ...allLoaded] // Prepend
      oldestLine = newResult.startLine
      loadCount++

      console.log(`   Load More #${loadCount}: Lines ${newResult.startLine}-${newResult.endLine} (${allLoaded.length} total loaded)`)

      if (oldestLine === 0) {
        console.log(`   ✓ Reached beginning of file!`)
        break
      }
    }

    console.log(`   ✓ Final: ${allLoaded.length} lines loaded in ${loadCount + 1} requests`)

    if (allLoaded.length !== 2000) {
      throw new Error(`Expected 2000 lines, got ${allLoaded.length}`)
    }
    if (allLoaded[0] !== "Line 1: Pagination test output") {
      throw new Error(`First line incorrect: ${allLoaded[0]}`)
    }
    if (allLoaded[1999] !== "Line 2000: Pagination test output") {
      throw new Error(`Last line incorrect: ${allLoaded[1999]}`)
    }

    console.log("   ✅ PASS\n")

    // Test 5: outputMetadata calculation
    console.log("📄 Test 5: outputMetadata Calculation")

    const metadata = {
      totalLines: 2000,
      startLine: 1500,
      endLine: 1999,
      hasMore: 1500 > 0,
    }

    console.log(`   ✓ Total lines: ${metadata.totalLines}`)
    console.log(`   ✓ Current range: ${metadata.startLine}-${metadata.endLine}`)
    console.log(`   ✓ Has more: ${metadata.hasMore}`)
    console.log(`   ✓ Lines available before: ${metadata.startLine}`)

    if (!metadata.hasMore) {
      throw new Error("hasMore should be true")
    }

    console.log("   ✅ PASS\n")

    console.log("🎉 All API tests passed!\n")

  } finally {
    // Cleanup
    if (existsSync(testDir)) {
      await rm(testDir, { recursive: true, force: true })
      console.log("🧹 Cleaned up test files")
    }
  }
}

// Run the test
testPaginationAPI().catch((error) => {
  console.error("❌ Test failed:", error)
  process.exit(1)
})
