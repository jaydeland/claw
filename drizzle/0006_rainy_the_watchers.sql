ALTER TABLE `claude_code_settings` ADD `custom_config_dir` text;--> statement-breakpoint
ALTER TABLE `claude_code_settings` ADD `mcp_server_settings` text DEFAULT '{}' NOT NULL;