-- Add analysis diagrams table
CREATE TABLE IF NOT EXISTS "analysis_diagrams" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL REFERENCES projects("id") ON DELETE cascade,
	"type" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"nodes" text DEFAULT '[]' NOT NULL,
	"edges" text DEFAULT '[]' NOT NULL,
	"viewport" text,
	"summary" text,
	"stats" text DEFAULT '{}' NOT NULL,
	"error_message" text,
	"last_commit_hash" text,
	"file_hash" text,
	"created_at" integer DEFAULT (strftime('%s', 'now') * 1000),
	"updated_at" integer DEFAULT (strftime('%s', 'now') * 1000)
);

-- Add analysis jobs table
CREATE TABLE IF NOT EXISTS "analysis_jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL REFERENCES projects("id") ON DELETE cascade,
	"diagram_id" text NOT NULL REFERENCES analysis_diagrams("id") ON DELETE cascade,
	"type" text NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"task_call_id" text,
	"log" text DEFAULT '[]' NOT NULL,
	"error_message" text,
	"started_at" integer DEFAULT (strftime('%s', 'now') * 1000),
	"completed_at" integer
);

-- Create indexes for analysis_diagrams
CREATE INDEX IF NOT EXISTS "analysis_diagrams_project_id_idx" ON "analysis_diagrams" ("project_id");
CREATE INDEX IF NOT EXISTS "analysis_diagrams_type_idx" ON "analysis_diagrams" ("type");
CREATE INDEX IF NOT EXISTS "analysis_diagrams_project_type_idx" ON "analysis_diagrams" ("project_id", "type");
CREATE INDEX IF NOT EXISTS "analysis_diagrams_status_idx" ON "analysis_diagrams" ("status");

-- Create indexes for analysis_jobs
CREATE INDEX IF NOT EXISTS "analysis_jobs_project_id_idx" ON "analysis_jobs" ("project_id");
CREATE INDEX IF NOT EXISTS "analysis_jobs_diagram_id_idx" ON "analysis_jobs" ("diagram_id");
CREATE INDEX IF NOT EXISTS "analysis_jobs_status_idx" ON "analysis_jobs" ("status");
