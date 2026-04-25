ALTER TABLE `claude_code_settings` ADD `bedrock_opus_model` text DEFAULT 'global.anthropic.claude-opus-4-5-20251101-v1:0';--> statement-breakpoint
ALTER TABLE `claude_code_settings` ADD `bedrock_sonnet_model` text DEFAULT 'us.anthropic.claude-sonnet-4-5-20250929-v1:0[1m]';--> statement-breakpoint
ALTER TABLE `claude_code_settings` ADD `bedrock_haiku_model` text DEFAULT 'us.anthropic.claude-haiku-4-5-20251001-v1:0[1m]';--> statement-breakpoint
ALTER TABLE `claude_code_settings` ADD `max_mcp_output_tokens` integer DEFAULT 200000 NOT NULL;--> statement-breakpoint
ALTER TABLE `claude_code_settings` ADD `max_thinking_tokens` integer DEFAULT 1000000 NOT NULL;