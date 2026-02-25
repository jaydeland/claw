-- System prompts table for storing editable AI prompts
CREATE TABLE IF NOT EXISTS system_prompts (
  id TEXT PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  content TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'general',
  is_editable INTEGER NOT NULL DEFAULT 1,
  default_value TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS system_prompts_category_idx ON system_prompts(category);
CREATE INDEX IF NOT EXISTS system_prompts_key_idx ON system_prompts(key);