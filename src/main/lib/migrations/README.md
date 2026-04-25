# Data Migrations

This directory contains data migrations for the 1Code application. These migrations run **after** schema migrations to update or transform existing data in the database.

## Migration vs Schema Changes

- **Schema migrations** (in `/drizzle`): Change the database structure (add/remove tables, columns, indexes)
- **Data migrations** (in `/src/main/lib/migrations`): Transform or update existing data

## How It Works

1. Schema migrations run first (via Drizzle's `migrate()`)
2. Data migrations run after database initialization (in `src/main/index.ts`)
3. Each migration is tracked in the `app_settings` table via `lastMigrationVersion`
4. Migrations only run once per version

## Creating a New Data Migration

### 1. Create Migration File

```typescript
// src/main/lib/migrations/my-migration.ts
import { getDatabase, myTable } from "../db"
import { eq } from "drizzle-orm"

export async function myMigration(): Promise<number> {
  const db = getDatabase()

  try {
    // Your migration logic here
    const affectedRows = 0

    console.log(`[migration] My migration complete (${affectedRows} rows updated)`)
    return affectedRows
  } catch (error) {
    console.error("[migration] My migration failed:", error)
    throw error
  }
}
```

### 2. Export from Index

```typescript
// src/main/lib/migrations/index.ts
export { myMigration } from "./my-migration"
```

### 3. Add to App Initialization

```typescript
// src/main/index.ts (in app.whenReady())

// After existing migrations...
const MY_MIGRATION_VERSION = "0.2.0"
if (
  !settings?.lastMigrationVersion ||
  settings.lastMigrationVersion < MY_MIGRATION_VERSION
) {
  console.log("[App] Running my migration...")
  const count = await myMigration()

  db.update(appSettings)
    .set({
      lastMigrationVersion: MY_MIGRATION_VERSION,
      updatedAt: new Date(),
    })
    .where(eq(appSettings.id, "default"))
    .run()

  console.log(`[App] My migration complete (${count} items updated)`)
}
```

## Migration Best Practices

### ✅ Do

- Make migrations **idempotent** (safe to run multiple times)
- Log progress and errors clearly
- Return the number of affected rows
- Handle errors gracefully
- Test migrations with realistic data

### ❌ Don't

- Modify the database schema (use Drizzle migrations instead)
- Assume data exists (always check for null/undefined)
- Make breaking changes without user notification
- Delete data without backup/recovery mechanism

## Testing Migrations

Create a test file in `__tests__/`:

```typescript
// __tests__/my-migration.test.ts
import { describe, it, expect } from "bun:test"
import { myMigration } from "../my-migration"

describe("my migration", () => {
  it("should migrate data correctly", () => {
    // Test setup
    // Run migration
    // Assert results
  })

  it("should be idempotent", () => {
    // Run twice, verify same result
  })
})
```

## Version Scheme

Use semantic versioning for migration tracking:

- **Major**: Breaking changes requiring user action
- **Minor**: New features, non-breaking changes
- **Patch**: Bug fixes, small improvements

Examples:
- `0.1.0` - Worktree location migration
- `0.2.0` - Next feature migration
- `1.0.0` - First stable release

## Existing Migrations

### 0.1.0: Worktree Location Migration

**File**: `worktree-location-migration.ts`

**Purpose**: Update existing chats to use new default worktree location pattern.

**Changes**:
- Old: `~/.21st/worktrees/<chatId>/`
- New: `<parent-dir>/wt-<projectname>-<number>/`

**Details**: Clears old worktree paths so new default will be used on next worktree creation. Existing worktrees on disk remain accessible via their stored paths in the database.
