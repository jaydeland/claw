CREATE TABLE `mcp_tool_cache` (
	`server_id` text PRIMARY KEY NOT NULL,
	`tool_count` integer NOT NULL,
	`tool_names` text DEFAULT '[]' NOT NULL,
	`last_queried` integer,
	`config_hash` text
);
