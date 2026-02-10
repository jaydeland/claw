-- Add analysis_diagrams and analysis_jobs tables for the Analyze feature
-- Stores React Flow diagram data for project analysis (Code Flow, DB, Architecture, Build)

-- Analysis diagrams table - stores generated React Flow data
CREATE TABLE IF NOT EXISTS "analysis_diagrams" (
  "id" TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  "project_id" TEXT NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
  "type" TEXT NOT NULL, -- "codeflow" | "db" | "architecture" | "build"
  "status" TEXT NOT NULL DEFAULT 'pending', -- "pending" | "generating" | "complete" | "error"
  "nodes" TEXT NOT NULL DEFAULT '[]', -- JSON array of React Flow nodes
  "edges" TEXT NOT NULL DEFAULT '[]', -- JSON array of React Flow edges
  "viewport" TEXT, -- JSON { x, y, zoom }
  "summary" TEXT, -- Human-readable summary
  "stats" TEXT NOT NULL DEFAULT '{}', -- JSON stats object
  "error_message" TEXT,
  "last_commit_hash" TEXT, -- Git commit hash when generated
  "file_hash" TEXT, -- Hash of analyzed files
  "created_at" INTEGER DEFAULT (unixepoch() * 1000),
  "updated_at" INTEGER DEFAULT (unixepoch() * 1000)
);

-- Analysis jobs table - tracks in-progress analysis tasks
CREATE TABLE IF NOT EXISTS "analysis_jobs" (
  "id" TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  "project_id" TEXT NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
  "diagram_id" TEXT NOT NULL REFERENCES "analysis_diagrams"("id") ON DELETE CASCADE,
  "type" TEXT NOT NULL, -- "codeflow" | "db" | "architecture" | "build"
  "status" TEXT NOT NULL DEFAULT 'running', -- "running" | "completed" | "failed"
  "task_call_id" TEXT, -- Tool call ID from Task tool
  "log" TEXT NOT NULL DEFAULT '[]', -- JSON array of log entries
  "error_message" TEXT,
  "started_at" INTEGER DEFAULT (unixepoch() * 1000),
  "completed_at" INTEGER
);

-- Indexes for analysis_diagrams
CREATE INDEX IF NOT EXISTS "analysis_diagrams_project_id_idx" ON "analysis_diagrams"("project_id");
CREATE INDEX IF NOT EXISTS "analysis_diagrams_type_idx" ON "analysis_diagrams"("type");
CREATE INDEX IF NOT EXISTS "analysis_diagrams_project_type_idx" ON "analysis_diagrams"("project_id", "type");
CREATE INDEX IF NOT EXISTS "analysis_diagrams_status_idx" ON "analysis_diagrams"("status");

-- Indexes for analysis_jobs
CREATE INDEX IF NOT EXISTS "analysis_jobs_project_id_idx" ON "analysis_jobs"("project_id");
CREATE INDEX IF NOT EXISTS "analysis_jobs_diagram_id_idx" ON "analysis_jobs"("diagram_id");
CREATE INDEX IF NOT EXISTS "analysis_jobs_status_idx" ON "analysis_jobs"("status");
