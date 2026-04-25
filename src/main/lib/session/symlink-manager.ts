import * as fs from "fs/promises"
import * as os from "os"
import * as path from "path"

/**
 * Ensure symlinks exist for skills, agents, commands, and rules directories
 * This is idempotent - recreates symlinks if the isolated config directory was deleted
 *
 * SDK looks for skills at $CLAUDE_CONFIG_DIR/skills/, agents at $CLAUDE_CONFIG_DIR/agents/, etc.
 * We symlink these from the user's ~/.claude/ directory.
 */
export async function ensureSymlinks(isolatedConfigDir: string): Promise<void> {
  try {
    // Ensure isolated config dir exists
    await fs.mkdir(isolatedConfigDir, { recursive: true })

    const homeClaudeDir = path.join(os.homedir(), ".claude")

    // Helper to check if path exists
    const pathExists = async (p: string) => fs.stat(p).then(() => true).catch(() => false)

    // Symlink skills directory from ~/.claude/
    try {
      const skillsTarget = path.join(isolatedConfigDir, "skills")
      const skillsTargetExists = await fs.lstat(skillsTarget).then(() => true).catch(() => false)
      if (!skillsTargetExists) {
        const skillsSource = path.join(homeClaudeDir, "skills")
        if (await pathExists(skillsSource)) {
          await fs.symlink(skillsSource, skillsTarget, "dir")
          console.log(`[symlink] Created skills symlink: ${skillsSource} → ${skillsTarget}`)
        }
      }
    } catch (symlinkErr) {
      console.error(`[symlink] Failed to symlink skills directory:`, symlinkErr)
    }

    // Symlink agents directory from ~/.claude/
    try {
      const agentsTarget = path.join(isolatedConfigDir, "agents")
      const agentsTargetExists = await fs.lstat(agentsTarget).then(() => true).catch(() => false)
      if (!agentsTargetExists) {
        const agentsSource = path.join(homeClaudeDir, "agents")
        if (await pathExists(agentsSource)) {
          await fs.symlink(agentsSource, agentsTarget, "dir")
          console.log(`[symlink] Created agents symlink: ${agentsSource} → ${agentsTarget}`)
        }
      }
    } catch (symlinkErr) {
      console.error(`[symlink] Failed to symlink agents directory:`, symlinkErr)
    }

    // Symlink commands directory from ~/.claude/
    try {
      const commandsTarget = path.join(isolatedConfigDir, "commands")
      const commandsTargetExists = await fs.lstat(commandsTarget).then(() => true).catch(() => false)
      if (!commandsTargetExists) {
        const commandsSource = path.join(homeClaudeDir, "commands")
        if (await pathExists(commandsSource)) {
          await fs.symlink(commandsSource, commandsTarget, "dir")
          console.log(`[symlink] Created commands symlink: ${commandsSource} → ${commandsTarget}`)
        }
      }
    } catch (symlinkErr) {
      console.error(`[symlink] Failed to symlink commands directory:`, symlinkErr)
    }

    // Symlink rules directory from ~/.claude/
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
