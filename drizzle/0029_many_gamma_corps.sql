ALTER TABLE `conductor_jobs` ADD `gsd_source` text;--> statement-breakpoint
ALTER TABLE `conductor_jobs` ADD `gsd_verified` integer DEFAULT false;