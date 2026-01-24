CREATE TABLE `config_sources` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`path` text NOT NULL,
	`priority` integer DEFAULT 50 NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`created_at` integer
);
