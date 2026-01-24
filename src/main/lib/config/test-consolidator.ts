/**
 * Test script for config consolidation module
 * Run with: bun run src/main/lib/config/test-consolidator.ts
 */
import { getConsolidatedConfig, getConfigSummary, getMergedMcpConfig } from "./consolidator"

async function main() {
  console.log("Testing MCP Config Consolidation\n")
  console.log("=".repeat(60))

  // Test 1: Get consolidated config without project path
  console.log("\n📋 Test 1: User-level config only\n")
  try {
    const config = await getConsolidatedConfig()
    console.log("Sources found:", config.sources.length)
    console.log(
      "Merged servers:",
      Object.keys(config.mergedServers).length
    )
    console.log("Conflicts:", config.conflicts.length)

    if (config.sources.length > 0) {
      console.log("\nConfig sources:")
      for (const source of config.sources) {
        const status = source.parseError
          ? `❌ ${source.parseError}`
          : `✓ ${source.serverNames.length} servers`
        console.log(`  - ${source.source.type} (priority ${source.source.priority}): ${status}`)
        console.log(`    ${source.source.path}`)
      }
    }

    if (config.conflicts.length > 0) {
      console.log("\n⚠️ Conflicts detected:")
      for (const conflict of config.conflicts) {
        console.log(`  - ${conflict.serverName}`)
        console.log(`    Winner: ${conflict.winningSource.type}`)
        console.log(
          `    Ignored: ${conflict.ignoredSources.map((s) => s.type).join(", ")}`
        )
      }
    }
  } catch (error) {
    console.error("❌ Error:", error)
  }

  // Test 2: Get merged MCP config (what Claude SDK uses)
  console.log("\n📋 Test 2: Get merged config for Claude SDK\n")
  try {
    const mcpConfig = await getMergedMcpConfig()
    console.log("MCP Config structure:")
    console.log(JSON.stringify(mcpConfig, null, 2))
  } catch (error) {
    console.error("❌ Error:", error)
  }

  // Test 3: Get human-readable summary
  console.log("\n📋 Test 3: Config summary\n")
  try {
    const summary = await getConfigSummary()
    console.log(summary)
  } catch (error) {
    console.error("❌ Error:", error)
  }

  console.log("\n" + "=".repeat(60))
  console.log("✅ Tests completed\n")
}

main().catch(console.error)
