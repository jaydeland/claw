CREATE TABLE `claude_code_settings` (
	`id` text PRIMARY KEY DEFAULT 'default' NOT NULL,
	`custom_binary_path` text,
	`custom_env_vars` text DEFAULT '{}' NOT NULL,
	`updated_at` integer
);
