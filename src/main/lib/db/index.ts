import Database from "better-sqlite3"
import { drizzle } from "drizzle-orm/better-sqlite3"
import { migrate } from "drizzle-orm/better-sqlite3/migrator"
import { app } from "electron"
import { join } from "path"
import { existsSync, mkdirSync } from "fs"
import { homedir } from "os"
import { eq } from "drizzle-orm"
import * as schema from "./schema"
import { seedSystemPrompts } from "./seeds/system-prompts"
import { preloadPrompts } from "../prompts/prompt-service"

let db: ReturnType<typeof drizzle<typeof schema>> | null = null
let sqlite: Database.Database | null = null

/**
 * Get the database path in the app's user data directory
 */
function getDatabasePath(): string {
  const userDataPath = app.getPath("userData")
  const dataDir = join(userDataPath, "data")

  // Ensure data directory exists
  if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true })
  }

  return join(dataDir, "agents.db")
}

/**
 * Get the migrations folder path
 * Handles both development and production (packaged) environments
 */
function getMigrationsPath(): string {
  if (app.isPackaged) {
    // Production: migrations bundled in resources
    return join(process.resourcesPath, "migrations")
  }
  // Development: from out/main -> apps/desktop/drizzle
  return join(__dirname, "../../drizzle")
}

/**
 * Ensure default "Home" workspace exists
 * Creates a non-git workspace pointing to the user's home directory
 */
function ensureDefaultHomeWorkspace(database: ReturnType<typeof drizzle<typeof schema>>) {
  try {
    const homeDir = homedir()

    // Check if a project already exists for the home directory
    const existing = database
      .select()
      .from(schema.projects)
      .where(eq(schema.projects.path, homeDir))
      .get()

    if (existing) {
      console.log("[DB] Home workspace already exists")
      return existing
    }

    // Create the default Home workspace
    const homeWorkspace = database
      .insert(schema.projects)
      .values({
        name: "Home",
        path: homeDir,
        // All git fields are null for non-git workspace
        gitRemoteUrl: null,
        gitProvider: null,
        gitOwner: null,
        gitRepo: null,
      })
      .returning()
      .get()

    console.log(`[DB] Created default Home workspace at: ${homeDir}`)
    return homeWorkspace
  } catch (error) {
    console.error("[DB] Failed to create default Home workspace:", error)
    // Don't throw - this is not critical for app startup
    return null
  }
}

/**
 * Initialize the database with Drizzle ORM
 */
export function initDatabase() {
  if (db) {
    return db
  }

  const dbPath = getDatabasePath()
  console.log(`[DB] Initializing database at: ${dbPath}`)

  // Create SQLite connection
  sqlite = new Database(dbPath)
  sqlite.pragma("journal_mode = WAL")
  sqlite.pragma("foreign_keys = ON")

  // Create Drizzle instance (but don't assign to global `db` yet)
  const drizzleInstance = drizzle(sqlite, { schema })

  // Run migrations BEFORE setting the global db variable
  // This ensures that if migrations fail, getDatabase() will retry on next call
  const migrationsPath = getMigrationsPath()
  console.log(`[DB] Running migrations from: ${migrationsPath}`)

  try {
    migrate(drizzleInstance, { migrationsFolder: migrationsPath })
    console.log("[DB] Migrations completed")
  } catch (error) {
    // Close the SQLite connection since we're not going to use it
    sqlite.close()
    sqlite = null
    console.error("[DB] Migration error:", error)
    throw error
  }

  // Only set the global db AFTER migrations complete successfully
  db = drizzleInstance

  // Ensure default Home workspace exists
  ensureDefaultHomeWorkspace(db)

  // Clean up any orphaned transient chats from previous sessions
  cleanupTransientChats(db)

  // Seed system prompts if they don't exist
  seedSystemPrompts(db)

  // Preload prompts into memory cache
  preloadPrompts()

  return db
}

/**
 * Clean up transient chats that weren't properly cleaned up
 * This can happen if the app crashed or the dialog was closed unexpectedly
 */
function cleanupTransientChats(database: ReturnType<typeof drizzle<typeof schema>>) {
  try {
    // Get all transient chat IDs
    const transientChats = database
      .select({ id: schema.chats.id })
      .from(schema.chats)
      .where(eq(schema.chats.isTransient, true))
      .all()

    if (transientChats.length === 0) {
      return
    }

    console.log(`[DB] Cleaning up ${transientChats.length} orphaned transient chats`)

    // Delete sub-chats for all transient chats
    for (const chat of transientChats) {
      database
        .delete(schema.subChats)
        .where(eq(schema.subChats.chatId, chat.id))
        .run()
    }

    // Delete transient chats
    database
      .delete(schema.chats)
      .where(eq(schema.chats.isTransient, true))
      .run()

    console.log(`[DB] Cleaned up ${transientChats.length} transient chats`)
  } catch (error) {
    console.error("[DB] Failed to cleanup transient chats:", error)
    // Don't throw - this is not critical for app startup
  }
}

/**
 * Get the database instance
 */
export function getDatabase() {
  if (!db) {
    return initDatabase()
  }
  return db
}

/**
 * Close the database connection
 */
export function closeDatabase(): void {
  if (sqlite) {
    sqlite.close()
    sqlite = null
    db = null
    console.log("[DB] Database connection closed")
  }
}

// Re-export schema for convenience
export * from "./schema"
