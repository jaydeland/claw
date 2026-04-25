CREATE UNIQUE INDEX IF NOT EXISTS chat_sessions_unique_idx ON chat_sessions(claw_id, external_id, platform);
