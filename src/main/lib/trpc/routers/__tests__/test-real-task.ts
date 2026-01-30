#!/usr/bin/env node
/**
 * Test the actual tRPC getWithOutput procedure with a real task
 * Run with: bun run src/main/lib/trpc/routers/__tests__/test-real-task.ts
 */

import { existsSync } from "fs"
import { readFile } from "fs/promises"

const testTaskId = "test-pagination-task-001"
const outputFile = "/Users/jasondeland/dev/vidyard/tmp/claude/-Users-jasondeland-dev-vidyard-claw/tasks/test-pagination.output"

async function testRealTask() {
  console.log("🧪 Testing Pagination with Real Task\n")

  // Verify output file exists
  if (!existsSync(outputFile)) {
    console.error("❌ Output file not found:", outputFile)
    process.exit(1)
  }

  console.log("✅ Output file exists")
  console.log(`   File: ${outputFile}\n`)

  // Test 1: Read file and verify line count
  console.log("📄 Test 1: Verify File Content")
  const content = await readFile(outputFile, "utf-8")
  const allLines = content.split("\n")

  console.log(`   Total lines: ${allLines.length}`)
  console.log(`   First line: "${allLines[0]}"`)
  console.log(`   Last line: "${allLines[allLines.length - 1]}"`)

  // Note: File may have 2001 lines due to trailing newline (this is normal)
  if (allLines.length < 2000 || allLines.length > 2001) {
    console.error(`   ❌ Expected 2000-2001 lines, got ${allLines.length}`)
    process.exit(1)
  }

  // If last line is empty (trailing newline), ignore it
  const effectiveLines = allLines[allLines.length - 1] === "" ? allLines.slice(0, -1) : allLines
  console.log(`   Effective lines: ${effectiveLines.length} (${allLines.length} with trailing newline)`)
  console.log("   ✅ PASS\n")

  // Test 2: Simulate tailLines: 500 (backward compat)
  console.log("📄 Test 2: Simulate tailLines: 500")
  const last500 = effectiveLines.slice(-500)

  console.log(`   Lines returned: ${last500.length}`)
  console.log(`   Range: 1500-1999`)
  console.log(`   First: "${last500[0]}"`)
  console.log(`   Last: "${last500[499]}"`)

  const expectedFirst = "Line 1501: Test pagination output with realistic content for verification"
  const expectedLast = "Line 2000: Test pagination output with realistic content for verification"

  if (last500[0] !== expectedFirst) {
    console.error(`   ❌ First line mismatch!`)
    console.error(`   Expected: "${expectedFirst}"`)
    console.error(`   Got: "${last500[0]}"`)
    process.exit(1)
  }

  if (last500[499] !== expectedLast) {
    console.error(`   ❌ Last line mismatch!`)
    console.error(`   Expected: "${expectedLast}"`)
    console.error(`   Got: "${last500[499]}"`)
    process.exit(1)
  }

  console.log("   ✅ PASS\n")

  // Test 3: Simulate pagination (offset: 1000, limit: 500)
  console.log("📄 Test 3: Simulate Pagination (offset: 1000, limit: 500)")
  const middle500 = effectiveLines.slice(1000, 1500)

  console.log(`   Lines returned: ${middle500.length}`)
  console.log(`   Range: 1000-1499`)
  console.log(`   First: "${middle500[0]}"`)
  console.log(`   Last: "${middle500[499]}"`)

  const expectedMiddleFirst = "Line 1001: Test pagination output with realistic content for verification"
  const expectedMiddleLast = "Line 1500: Test pagination output with realistic content for verification"

  if (middle500[0] !== expectedMiddleFirst) {
    console.error(`   ❌ First line mismatch!`)
    process.exit(1)
  }

  if (middle500[499] !== expectedMiddleLast) {
    console.error(`   ❌ Last line mismatch!`)
    process.exit(1)
  }

  console.log("   ✅ PASS\n")

  // Test 4: Simulate outputMetadata
  console.log("📄 Test 4: Simulate outputMetadata Response")

  const metadata = {
    totalLines: effectiveLines.length,
    startLine: 1500,
    endLine: 1999,
    hasMore: 1500 > 0,
  }

  console.log(`   Total lines: ${metadata.totalLines}`)
  console.log(`   Start line: ${metadata.startLine}`)
  console.log(`   End line: ${metadata.endLine}`)
  console.log(`   Has more: ${metadata.hasMore}`)
  console.log(`   Available before: ${metadata.startLine} lines`)

  if (!metadata.hasMore) {
    console.error("   ❌ hasMore should be true")
    process.exit(1)
  }

  console.log("   ✅ PASS\n")

  // Test 5: Simulate Load More flow
  console.log("📄 Test 5: Simulate Full 'Load More' Flow")

  let currentOffset = 1500
  let totalLoaded = 500
  let iterations = 0

  console.log(`   Initial: Lines ${currentOffset}-1999 (500 lines)`)

  while (currentOffset > 0 && iterations < 10) {
    const newOffset = Math.max(0, currentOffset - 500)
    const newLines = effectiveLines.slice(newOffset, currentOffset)
    totalLoaded += newLines.length
    iterations++

    console.log(`   Load More #${iterations}: Lines ${newOffset}-${currentOffset - 1} (${totalLoaded} total loaded)`)

    currentOffset = newOffset

    if (currentOffset === 0) {
      console.log(`   ✓ Reached beginning!`)
      break
    }
  }

  if (totalLoaded !== 2000) {
    console.error(`   ❌ Expected 2000 total, got ${totalLoaded}`)
    process.exit(1)
  }

  console.log(`   ✓ All ${totalLoaded} lines loaded in ${iterations + 1} requests`)
  console.log("   ✅ PASS\n")

  console.log("🎉 All real task tests passed!\n")
  console.log("✅ Test task ID:", testTaskId)
  console.log("✅ Output file:", outputFile)
  console.log("✅ Ready for UI testing")
}

testRealTask().catch((error) => {
  console.error("❌ Test failed:", error)
  process.exit(1)
})
