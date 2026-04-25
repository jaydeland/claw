CREATE TABLE IF NOT EXISTS chat_sessions (
  id TEXT PRIMARY KEY,
  claw_id TEXT NOT NULL REFERENCES headless_claws(id) ON DELETE CASCADE,
  external_id TEXT NOT NULL,
  platform TEXT NOT NULL CHECK (platform IN ('whatsapp', 'slack')),
  status TEXT NOT NULL DEFAULT 'idle' CHECK (status IN ('idle', 'active', 'completed', 'error')),
  current_execution_id TEXT REFERENCES claw_executions(id),
  context TEXT NOT NULL DEFAULT '{}',
  last_activity_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);
