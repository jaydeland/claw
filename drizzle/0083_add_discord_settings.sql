CREATE TABLE `discord_settings` (
	`id` text PRIMARY KEY DEFAULT 'default' NOT NULL,
	`encrypted_bot_token` text,
	`guild_id` text,
	`guild_name` text,
	`is_connected` integer DEFAULT false,
	`updated_at` integer
);
