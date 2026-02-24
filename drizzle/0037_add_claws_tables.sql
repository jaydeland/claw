-- Create headless_claws table
CREATE TABLE `headless_claws` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`instruction` text NOT NULL,
	`target_worktree` text NOT NULL,
	`trigger_type` text NOT NULL,
	`trigger_config` text NOT NULL,
	`is_enabled` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint

-- Create claw_executions table
CREATE TABLE `claw_executions` (
	`id` text PRIMARY KEY NOT NULL,
	`claw_id` text NOT NULL,
	`status` text NOT NULL,
	`logs` text DEFAULT '' NOT NULL,
	`exit_code` integer,
	`started_at` integer DEFAULT (unixepoch()) NOT NULL,
	`completed_at` integer,
	FOREIGN KEY (`claw_id`) REFERENCES `headless_claws`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint

-- Create indexes for claw_executions
CREATE INDEX `claw_executions_claw_id_idx` ON `claw_executions` (`claw_id`);
--> statement-breakpoint
CREATE INDEX `claw_executions_status_idx` ON `claw_executions` (`status`);
--> statement-breakpoint
CREATE INDEX `claw_executions_started_at_idx` ON `claw_executions` (`started_at`);
--> statement-breakpoint

-- Create github_settings table
CREATE TABLE `github_settings` (
	`id` text PRIMARY KEY NOT NULL,
	`encrypted_token` text,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
