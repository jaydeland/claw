# Default Home Workspace

## Feature
Added automatic creation of a default "Home" workspace that:
- Points to the user's home directory (`os.homedir()`)
- Has no git repository requirement
- Is created automatically on first app launch
- Provides a workspace for users without needing to select a project folder

## Implementation

### Database Initialization
Modified `src/main/lib/db/index.ts`:

1. **Added `ensureDefaultHomeWorkspace()` function**
   - Checks if a workspace already exists for home directory
   - Creates "Home" workspace if it doesn't exist
   - Sets all git fields to `null` (non-git workspace)
   - Called after migrations complete

2. **Called during app startup**
   - Runs after database migrations
   - Non-blocking (errors are logged but don't crash app)
   - Idempotent (safe to run multiple times)

### Code Changes
```typescript
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
```

## Git Compatibility

The existing git utilities already handle non-git directories gracefully:

### `getGitRemoteInfo()`
- Checks if path is a git repo first
- Returns all `null` values for non-git directories
- No errors thrown

### Project Schema
- All git fields are already optional:
  - `gitRemoteUrl: text("git_remote_url")`
  - `gitProvider: text("git_provider")`
  - `gitOwner: text("git_owner")`
  - `gitRepo: text("git_repo")`

## User Experience

1. **First Launch**
   - App creates "Home" workspace automatically
   - Points to user's home directory (e.g., `/Users/jdeland`)
   - Appears in project list alongside other workspaces

2. **Subsequent Launches**
   - Checks if Home workspace exists
   - Skips creation if already present
   - Updates timestamp like any other workspace

3. **No Git Required**
   - Users can work with files in home directory
   - No git validation or requirements
   - Can still use git commands if home directory happens to be a git repo

## Benefits

1. **Lower Barrier to Entry**
   - Users don't need to select a folder on first launch
   - Can start using the app immediately
   - Especially useful for quick tasks or testing

2. **Flexible Workspace**
   - Good for general-purpose file editing
   - Useful for scripts, dotfiles, or system files
   - Can access any subdirectory

3. **No Breaking Changes**
   - Existing workspaces unaffected
   - Users can still create project-specific workspaces
   - Git features work as before for git repos

## Testing

Build completed successfully:
```bash
$ bun run build
✓ built in 20.02s
```

No TypeScript errors or warnings.

## Related

- Addresses todo item from commit `7414bf9`: "Allow workspaces without git repos"
- Complements the slash commands fix (both improve initial user experience)
