CREATE TABLE `background_tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`sub_chat_id` text NOT NULL,
	`chat_id` text NOT NULL,
	`tool_call_id` text NOT NULL,
	`command` text NOT NULL,
	`description` text,
	`output_file` text,
	`status` text DEFAULT 'running' NOT NULL,
	`exit_code` integer,
	`started_at` integer,
	`completed_at` integer,
	`pid` integer,
	FOREIGN KEY (`sub_chat_id`) REFERENCES `sub_chats`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`chat_id`) REFERENCES `chats`(`id`) ON UPDATE no action ON DELETE cascade
);
