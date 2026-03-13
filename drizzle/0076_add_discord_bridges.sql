CREATE TABLE `discord_bridges` (
	`id` text PRIMARY KEY NOT NULL,
	`chat_id` text NOT NULL REFERENCES `chats`(`id`) ON DELETE CASCADE,
	`sub_chat_id` text REFERENCES `sub_chats`(`id`) ON DELETE CASCADE,
	`discord_guild_id` text NOT NULL,
	`discord_channel_id` text NOT NULL,
	`discord_channel_name` text,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (unixepoch()),
	`updated_at` integer DEFAULT (unixepoch())
);
