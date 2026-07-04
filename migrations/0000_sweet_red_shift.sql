CREATE TABLE `connections` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`provider` text NOT NULL,
	`endpoint` text NOT NULL,
	`api_key` text,
	`default_model` text NOT NULL,
	`is_default` integer DEFAULT false,
	`max_image_size_mb` integer,
	`order_index` integer DEFAULT 0
);
--> statement-breakpoint
CREATE TABLE `consultants` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text NOT NULL,
	`connection_id` text NOT NULL,
	`model` text NOT NULL,
	`system_prompt` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `conversation_flags` (
	`id` text PRIMARY KEY NOT NULL,
	`conversation_id` text NOT NULL,
	`conversation_title` text NOT NULL,
	`project_id` text,
	`message_index` integer DEFAULT 0 NOT NULL,
	`pivot_sentence` text NOT NULL,
	`note` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `conversations` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`project_id` text,
	`connection_id` text,
	`model` text NOT NULL,
	`messages` text DEFAULT '[]' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `journal_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`title` text NOT NULL,
	`detail` text,
	`related_path` text,
	`related_library_item_id` text,
	`related_conversation_id` text,
	`resolved` integer DEFAULT false,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `knowledge_documents` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text,
	`title` text NOT NULL,
	`source` text NOT NULL,
	`content` text NOT NULL,
	`chunks` text DEFAULT '[]' NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `library_folders` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`parent_id` text,
	`description` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `library_items` (
	`id` text PRIMARY KEY NOT NULL,
	`folder_id` text,
	`title` text NOT NULL,
	`file_path` text,
	`source` text NOT NULL,
	`mime_type` text,
	`content` text,
	`summary` text,
	`tags` text,
	`created_at` text NOT NULL,
	`accessed_at` text
);
--> statement-breakpoint
CREATE TABLE `memory_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`scope` text NOT NULL,
	`project_id` text,
	`conversation_id` text,
	`content` text NOT NULL,
	`summary` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `projects` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`connection_id` text,
	`system_prompt` text,
	`current_task` text,
	`folder_path` text,
	`created_at` text NOT NULL,
	`order_index` integer DEFAULT 0
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`id` text PRIMARY KEY DEFAULT 'default' NOT NULL,
	`default_connection_id` text,
	`default_project_id` text,
	`theme` text DEFAULT 'system',
	`root_folder` text,
	`library_paths` text,
	`morning_orientation_enabled` integer DEFAULT false,
	`whisper_endpoint` text,
	`search_endpoint` text,
	`embedding_model` text,
	`day_note` text
);
--> statement-breakpoint
CREATE TABLE `system_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`timestamp` integer NOT NULL,
	`level` text NOT NULL,
	`category` text NOT NULL,
	`message` text NOT NULL,
	`detail` text
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`username` text NOT NULL,
	`password` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_username_unique` ON `users` (`username`);--> statement-breakpoint
CREATE TABLE `workspace_docs` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`content` text DEFAULT '' NOT NULL,
	`project_id` text,
	`updated_at` text NOT NULL,
	`created_at` text NOT NULL
);
