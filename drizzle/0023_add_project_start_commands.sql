-- Add start_commands field to projects table
-- This stores JSON array of commands to run when a new chat terminal is created
-- Commands run in the persistent PTY shell session after the prompt is ready

ALTER TABLE `projects` ADD `start_commands` text DEFAULT '[]' NOT NULL;
