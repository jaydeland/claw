import Database from "better-sqlite3"
import { drizzle } from "drizzle-orm/better-sqlite3"
import { migrate } from "drizzle-orm/better-sqlite3/migrator"
import { app } from "electron"
import { join } from "path"
import { existsSync, mkdirSync } from "fs"
import { homedir } from "os"
import { eq } from "drizzle-orm"
import * as schema from "./schema"

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

  // Create Drizzle instance
  db = drizzle(sqlite, { schema })

  // Run migrations
  const migrationsPath = getMigrationsPath()
  console.log(`[DB] Running migrations from: ${migrationsPath}`)

  try {
    migrate(db, { migrationsFolder: migrationsPath })
    console.log("[DB] Migrations completed")
  } catch (error) {
    console.error("[DB] Migration error:", error)
    throw error
  }

  // Ensure default Home workspace exists
  ensureDefaultHomeWorkspace(db)

  return db
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
