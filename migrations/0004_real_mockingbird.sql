DROP TABLE `knowledge_documents`;--> statement-breakpoint
ALTER TABLE `library_items` ADD `notes` text;--> statement-breakpoint
ALTER TABLE `projects` ADD `notes` text;--> statement-breakpoint
ALTER TABLE `projects` ADD `context_files` text;