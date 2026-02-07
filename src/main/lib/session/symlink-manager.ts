import * as fs from "fs/promises"
import * as os from "os"
import * as path from "path"
import { getBundledGsdPath } from "../trpc/routers/gsd"

/**
 * Ensure symlinks exist for skills, agents, commands, and rules directories
 * This is idempotent - recreates symlinks if the isolated config directory was deleted
 *
 * SDK looks for skills at $CLAUDE_CONFIG_DIR/skills/, agents at $CLAUDE_CONFIG_DIR/agents/, etc.
 * We symlink these from either:
 * 1. Bundled GSD resources (preferred for agents/commands)
 * 2. User's ~/.claude/ directory (fallback, and only option for rules)
 */
export async function ensureSymlinks(isolatedConfigDir: string): Promise<void> {
  try {
    // Ensure isolated config dir exists
    await fs.mkdir(isolatedConfigDir, { recursive: true })

    const homeClaudeDir = path.join(os.homedir(), ".claude")
    const bundledGsdPath = getBundledGsdPath()

    // Helper to check if path exists
    const pathExists = async (p: string) => fs.stat(p).then(() => true).catch(() => false)

    // Symlink skills directory - prefer bundled GSD, fallback to ~/.claude/
    try {
      const skillsTarget = path.join(isolatedConfigDir, "skills")
      const skillsTargetExists = await fs.lstat(skillsTarget).then(() => true).catch(() => false)
      if (!skillsTargetExists) {
        // Check bundled GSD first (GSD doesn't have skills, but keep pattern consistent)
        const bundledSkillsSource = path.join(bundledGsdPath, "skills")
        const userSkillsSource = path.join(homeClaudeDir, "skills")
        const bundledExists = await pathExists(bundledSkillsSource)
        const userExists = await pathExists(userSkillsSource)
        const skillsSource = bundledExists ? bundledSkillsSource : (userExists ? userSkillsSource : null)
        if (skillsSource) {
          await fs.symlink(skillsSource, skillsTarget, "dir")
          console.log(`[symlink] Created skills symlink: ${skillsSource} → ${skillsTarget}`)
        }
      }
    } catch (symlinkErr) {
      console.error(`[symlink] Failed to symlink skills directory:`, symlinkErr)
    }

    // Symlink agents directory - prefer bundled GSD, fallback to ~/.claude/
    try {
      const agentsTarget = path.join(isolatedConfigDir, "agents")
      const agentsTargetExists = await fs.lstat(agentsTarget).then(() => true).catch(() => false)
      if (!agentsTargetExists) {
        const bundledAgentsSource = path.join(bundledGsdPath, "agents")
        const userAgentsSource = path.join(homeClaudeDir, "agents")
        const bundledExists = await pathExists(bundledAgentsSource)
        const userExists = await pathExists(userAgentsSource)
        const agentsSource = bundledExists ? bundledAgentsSource : (userExists ? userAgentsSource : null)
        if (agentsSource) {
          await fs.symlink(agentsSource, agentsTarget, "dir")
          console.log(`[symlink] Created agents symlink: ${agentsSource} → ${agentsTarget}${bundledExists ? " (bundled GSD)" : ""}`)
        }
      }
    } catch (symlinkErr) {
      console.error(`[symlink] Failed to symlink agents directory:`, symlinkErr)
    }

    // Symlink commands directory - prefer bundled GSD, fallback to ~/.claude/
    try {
      const commandsTarget = path.join(isolatedConfigDir, "commands")
      const commandsTargetExists = await fs.lstat(commandsTarget).then(() => true).catch(() => false)
      if (!commandsTargetExists) {
        const bundledCommandsSource = path.join(bundledGsdPath, "commands")
        const userCommandsSource = path.join(homeClaudeDir, "commands")
        const bundledExists = await pathExists(bundledCommandsSource)
        const userExists = await pathExists(userCommandsSource)
        const commandsSource = bundledExists ? bundledCommandsSource : (userExists ? userCommandsSource : null)
        if (commandsSource) {
          await fs.symlink(commandsSource, commandsTarget, "dir")
          console.log(`[symlink] Created commands symlink: ${commandsSource} → ${commandsTarget}${bundledExists ? " (bundled GSD)" : ""}`)
        }
      }
    } catch (symlinkErr) {
      console.error(`[symlink] Failed to symlink commands directory:`, symlinkErr)
    }

    // Symlink rules directory - only from ~/.claude/ (GSD doesn't have rules)
    try {
      const rulesSource = path.join(homeClaudeDir, "rules")
      const rulesTarget = path.join(isolatedConfigDir, "rules")
      const rulesSourceExists = await pathExists(rulesSource)
      const rulesTargetExists = await fs.lstat(rulesTarget).then(() => true).catch(() => false)
      if (rulesSourceExists && !rulesTargetExists) {
        await fs.symlink(rulesSource, rulesTarget, "dir")
        console.log(`[symlink] Created rules symlink: ${rulesSource} → ${rulesTarget}`)
      }
    } catch (symlinkErr) {
      console.error(`[symlink] Failed to symlink rules directory:`, symlinkErr)
    }
  } catch (error) {
    console.error(`[symlink] Error ensuring symlinks for ${isolatedConfigDir}:`, error)
    throw error
  }
}
