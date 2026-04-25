import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const dbPath = "/Users/jasondeland/Library/Application Support/Agents Dev/data/agents.db";
const migrationsPath = "/Users/jasondeland/dev/claw/drizzle";

console.log("DB:", dbPath);
console.log("Migrations:", migrationsPath);

const sqlite = new Database(dbPath);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

try {
  const db = drizzle(sqlite);
  console.log("Starting migration...");
  migrate(db, { migrationsFolder: migrationsPath });
  console.log("MIGRATIONS COMPLETE");

  const result = sqlite.prepare("SELECT COUNT(*) as count FROM __drizzle_migrations").get();
  console.log("Migration count:", result.count);
} catch (e) {
  console.error("MIGRATION ERROR:", e.message);
  console.error(e.stack);
} finally {
  sqlite.close();
}
