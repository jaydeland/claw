/**
 * Data migrations for the 1Code application.
 *
 * These migrations run after schema migrations to update data in the database.
 * They are tracked via the app_settings table to ensure they only run once.
 */

export { migrateWorktreeLocations } from "./worktree-location-migration"
