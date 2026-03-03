ALTER TABLE claw_executions ADD COLUMN session_id TEXT REFERENCES chat_sessions(id) ON DELETE SET NULL;
