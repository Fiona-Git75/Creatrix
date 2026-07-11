ALTER TABLE `connections` ADD `resident_name` text;--> statement-breakpoint
ALTER TABLE `connections` ADD `resident_role` text;--> statement-breakpoint
ALTER TABLE `connections` ADD `resident_description` text;--> statement-breakpoint
ALTER TABLE `connections` ADD `resident_emoji` text;--> statement-breakpoint
ALTER TABLE `memory_entries` ADD `connection_id` text;
