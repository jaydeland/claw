ALTER TABLE `claude_code_settings` ADD `enable_agent_teams` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `claude_code_settings` ADD `max_budget_usd` integer;