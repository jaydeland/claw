CREATE TABLE `app_settings` (
	`id` text PRIMARY KEY DEFAULT 'default' NOT NULL,
	`last_migration_version` text,
	`updated_at` integer
);
