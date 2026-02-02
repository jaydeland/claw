ALTER TABLE `claude_code_settings` ADD `default_start_commands` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `conductor_jobs` ADD `gsd_source` text;--> statement-breakpoint
ALTER TABLE `conductor_jobs` ADD `gsd_verified` integer DEFAULT false;