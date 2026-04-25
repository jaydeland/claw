-- Add vpn_check_enabled boolean field (defaults to false)
ALTER TABLE `claude_code_settings` ADD `vpn_check_enabled` integer DEFAULT 0 NOT NULL;--> statement-breakpoint

-- Drop the old vpn_check_url field
ALTER TABLE `claude_code_settings` DROP COLUMN `vpn_check_url`;
