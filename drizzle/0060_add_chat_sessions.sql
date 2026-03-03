-- Migration: Add chat sessions table for WhatsApp and Slack persistence
-- Created: 2026-03-02

-- Create chat_sessions table
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

-- Create indexes for chat_sessions
CREATE INDEX IF NOT EXISTS chat_sessions_claw_id_idx ON chat_sessions(claw_id);
CREATE INDEX IF NOT EXISTS chat_sessions_external_id_idx ON chat_sessions(external_id);
CREATE INDEX IF NOT EXISTS chat_sessions_platform_idx ON chat_sessions(platform);
CREATE INDEX IF NOT EXISTS chat_sessions_status_idx ON chat_sessions(status);
CREATE INDEX IF NOT EXISTS chat_sessions_last_activity_idx ON chat_sessions(last_activity_at);
CREATE UNIQUE INDEX IF NOT EXISTS chat_sessions_unique_idx ON chat_sessions(claw_id, external_id, platform);

-- Add session_id to claw_executions
ALTER TABLE claw_executions ADD COLUMN session_id TEXT REFERENCES chat_sessions(id) ON DELETE SET NULL;

-- Create index for session_id
CREATE INDEX IF NOT EXISTS claw_executions_session_id_idx ON claw_executions(session_id);
