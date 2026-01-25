CREATE TABLE `claude_binary_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`platform` text NOT NULL,
	`path` text NOT NULL,
	`checksum` text,
	`size` integer,
	`downloaded_at` integer DEFAULT (unixepoch()),
	`is_active` integer DEFAULT false NOT NULL,
	`is_bundled` integer DEFAULT false NOT NULL
);
