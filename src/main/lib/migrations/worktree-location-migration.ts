import { getDatabase, chats } from "../db"
import { eq, isNotNull } from "drizzle-orm"

/**
 * Migrate existing chats that use old worktree location pattern.
 *
 * Old default: ~/.21st/worktrees/<chatId>/
 * New default: <parent-dir>/wt-<projectname>-<number>/
 *
 * This migration clears old worktree paths so they'll use the new default on next creation.
 * Existing worktrees on disk are not affected - they remain accessible via their stored paths.
 */
export async function migrateWorktreeLocations(): Promise<number> {
  const db = getDatabase()

  try {
    // Get all chats with worktree paths (non-null)
    const allChats = db
      .select()
      .from(chats)
      .where(isNotNull(chats.worktreePath))
      .all()

    let migratedCount = 0

    for (const chat of allChats) {
      // Check if this chat uses old default location pattern
      // Old pattern: contains "/.21st/worktrees/"
      if (chat.worktreePath && chat.worktreePath.includes("/.21st/worktrees/")) {
        console.log(`[migration] Migrating chat ${chat.id}: ${chat.worktreePath}`)

        // Clear worktree path so new default will be used
        // Keep branch to indicate it was a worktree chat
        db.update(chats)
          .set({
            worktreePath: null,
            updatedAt: new Date(),
          })
          .where(eq(chats.id, chat.id))
          .run()

        migratedCount++
      }
    }

    console.log(`[migration] Migrated ${migratedCount} worktree paths to new default`)
    return migratedCount
  } catch (error) {
    console.error("[migration] Failed to migrate worktree locations:", error)
    throw error
  }
}
