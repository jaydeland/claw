-- Simplify background_tasks table to minimal essential fields
-- All display data (command, description, status, etc.) will be derived from messages

-- Create temporary table with new simplified schema
CREATE TABLE background_tasks_new (
  id TEXT PRIMARY KEY NOT NULL,
  sub_chat_id TEXT NOT NULL REFERENCES sub_chats(id) ON DELETE CASCADE,
  chat_id TEXT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  tool_call_id TEXT NOT NULL UNIQUE,
  output_file TEXT,
  pid INTEGER
);

-- Copy essential data from old table
INSERT INTO background_tasks_new (id, sub_chat_id, chat_id, tool_call_id, output_file, pid)
SELECT id, sub_chat_id, chat_id, tool_call_id, output_file, pid
FROM background_tasks;

-- Drop old table
DROP TABLE background_tasks;

-- Rename new table
ALTER TABLE background_tasks_new RENAME TO background_tasks;

-- Create index on tool_call_id for fast lookups
CREATE UNIQUE INDEX idx_background_tasks_tool_call_id ON background_tasks(tool_call_id);
