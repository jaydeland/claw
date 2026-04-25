CREATE TABLE `conductor_checkpoints` (
	`id` text PRIMARY KEY NOT NULL,
	`job_id` text NOT NULL,
	`timestamp` integer NOT NULL,
	`message` text NOT NULL,
	`metadata` text,
	FOREIGN KEY (`job_id`) REFERENCES `conductor_jobs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `conductor_checkpoints_job_id_timestamp_idx` ON `conductor_checkpoints` (`job_id`,`timestamp`);--> statement-breakpoint
CREATE TABLE `conductor_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`intent` text,
	`type` text,
	`status` text DEFAULT 'to_do' NOT NULL,
	`parent_id` text,
	`position` integer DEFAULT 0,
	`jira_key` text,
	`error_message` text,
	`pid` integer,
	`repo_id` text,
	`worktree_path` text,
	`branch_name` text,
	`created_at` integer,
	`updated_at` integer
);
--> statement-breakpoint
CREATE INDEX `conductor_jobs_parent_id_idx` ON `conductor_jobs` (`parent_id`);--> statement-breakpoint
CREATE INDEX `conductor_jobs_status_idx` ON `conductor_jobs` (`status`);--> statement-breakpoint
CREATE INDEX `conductor_jobs_status_position_idx` ON `conductor_jobs` (`status`,`position`);--> statement-breakpoint
CREATE INDEX `conductor_jobs_repo_id_idx` ON `conductor_jobs` (`repo_id`);--> statement-breakpoint
CREATE TABLE `conductor_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`job_id` text NOT NULL,
	`timestamp` integer NOT NULL,
	`level` text DEFAULT 'info' NOT NULL,
	`message` text NOT NULL,
	`metadata` text,
	FOREIGN KEY (`job_id`) REFERENCES `conductor_jobs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `conductor_logs_job_id_level_timestamp_idx` ON `conductor_logs` (`job_id`,`level`,`timestamp`);--> statement-breakpoint
CREATE INDEX `conductor_logs_job_id_timestamp_idx` ON `conductor_logs` (`job_id`,`timestamp`);