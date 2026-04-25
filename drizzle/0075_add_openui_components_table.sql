-- Create OpenUI generated components table for AI-generated UI components
CREATE TABLE openui_components (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  code TEXT NOT NULL,
  atoms_code TEXT,
  prompt TEXT NOT NULL,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  chat_id TEXT REFERENCES chats(id) ON DELETE SET NULL,
  file_path TEXT,
  is_installed INTEGER NOT NULL DEFAULT 0,
  metadata TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);
--> statement-breakpoint
CREATE INDEX openui_components_project_id_idx ON openui_components(project_id);
--> statement-breakpoint
CREATE INDEX openui_components_chat_id_idx ON openui_components(chat_id);
--> statement-breakpoint
CREATE INDEX openui_components_created_at_idx ON openui_components(created_at);
