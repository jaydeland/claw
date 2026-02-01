-- Add default terminal start commands to claudeCodeSettings
ALTER TABLE claude_code_settings ADD COLUMN default_start_commands text DEFAULT '[]' NOT NULL;
