CREATE TABLE `hooks` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`hook_type` text NOT NULL,
	`matcher` text NOT NULL,
	`command` text NOT NULL,
	`scope` text NOT NULL,
	`project_id` text REFERENCES projects(id) ON DELETE cascade,
	`enabled` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
