// @ts-expect-error - bun:test is a Bun-specific module not recognized by TypeScript
import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import { mkdtempSync, rmSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"
import Database from "better-sqlite3"
import { drizzle } from "drizzle-orm/better-sqlite3"
import { migrate } from "drizzle-orm/better-sqlite3/migrator"
import { eq } from "drizzle-orm"
import * as schema from "../../db/schema"
import { migrateWorktreeLocations } from "../worktree-location-migration"

describe("worktree location migration", () => {
  let testDir: string
  let dbPath: string
  let db: ReturnType<typeof drizzle<typeof schema>>
  let sqlite: Database.Database

  beforeEach(() => {
    // Create temporary directory for test database
    testDir = mkdtempSync(join(tmpdir(), "worktree-migration-test-"))
    dbPath = join(testDir, "test.db")

    // Initialize test database
    sqlite = new Database(dbPath)
    sqlite.pragma("journal_mode = WAL")
    sqlite.pragma("foreign_keys = ON")
    db = drizzle(sqlite, { schema })

    // Run migrations to set up schema
    migrate(db, { migrationsFolder: join(__dirname, "../../../../drizzle") })
  })

  afterEach(() => {
    // Clean up
    if (sqlite) {
      sqlite.close()
    }
    rmSync(testDir, { recursive: true, force: true })
  })

  it("should migrate chats with old worktree paths", () => {
    // Create a test project
    const project = db
      .insert(schema.projects)
      .values({
        name: "Test Project",
        path: "/test/project",
      })
      .returning()
      .get()

    // Create chats with old worktree paths
    const oldChat1 = db
      .insert(schema.chats)
      .values({
        name: "Old Chat 1",
        projectId: project.id,
        worktreePath: "~/.21st/worktrees/abc123/",
        branch: "feature/test",
      })
      .returning()
      .get()

    const oldChat2 = db
      .insert(schema.chats)
      .values({
        name: "Old Chat 2",
        projectId: project.id,
        worktreePath: "/Users/test/.21st/worktrees/xyz789/",
        branch: "feature/another",
      })
      .returning()
      .get()

    // Create chat with new worktree path (should not be migrated)
    const newChat = db
      .insert(schema.chats)
      .values({
        name: "New Chat",
        projectId: project.id,
        worktreePath: "/test/project-parent/wt-project-1/",
        branch: "feature/new",
      })
      .returning()
      .get()

    // Create chat without worktree (should not be affected)
    const noWorktreeChat = db
      .insert(schema.chats)
      .values({
        name: "No Worktree Chat",
        projectId: project.id,
        worktreePath: null,
        branch: null,
      })
      .returning()
      .get()

    // Run migration
    const migratedCount = migrateWorktreeLocations()

    // Verify migration count
    expect(migratedCount).toBe(2)

    // Verify old chats have null worktree paths
    const migratedChat1 = db
      .select()
      .from(schema.chats)
      .where(eq(schema.chats.id, oldChat1.id))
      .get()
    expect(migratedChat1?.worktreePath).toBeNull()
    expect(migratedChat1?.branch).toBe("feature/test") // Branch should be preserved

    const migratedChat2 = db
      .select()
      .from(schema.chats)
      .where(eq(schema.chats.id, oldChat2.id))
      .get()
    expect(migratedChat2?.worktreePath).toBeNull()
    expect(migratedChat2?.branch).toBe("feature/another")

    // Verify new chat is unchanged
    const unchangedNewChat = db
      .select()
      .from(schema.chats)
      .where(eq(schema.chats.id, newChat.id))
      .get()
    expect(unchangedNewChat?.worktreePath).toBe("/test/project-parent/wt-project-1/")
    expect(unchangedNewChat?.branch).toBe("feature/new")

    // Verify no-worktree chat is unchanged
    const unchangedNoWorktreeChat = db
      .select()
      .from(schema.chats)
      .where(eq(schema.chats.id, noWorktreeChat.id))
      .get()
    expect(unchangedNoWorktreeChat?.worktreePath).toBeNull()
    expect(unchangedNoWorktreeChat?.branch).toBeNull()
  })

  it("should be idempotent (safe to run multiple times)", () => {
    // Create a test project
    const project = db
      .insert(schema.projects)
      .values({
        name: "Test Project",
        path: "/test/project",
      })
      .returning()
      .get()

    // Create chat with old worktree path
    db.insert(schema.chats)
      .values({
        name: "Old Chat",
        projectId: project.id,
        worktreePath: "~/.21st/worktrees/abc123/",
        branch: "feature/test",
      })
      .run()

    // Run migration first time
    const count1 = migrateWorktreeLocations()
    expect(count1).toBe(1)

    // Run migration second time (should not find any more to migrate)
    const count2 = migrateWorktreeLocations()
    expect(count2).toBe(0)
  })
})
