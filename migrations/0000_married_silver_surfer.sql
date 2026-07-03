CREATE TABLE "connections" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"provider" varchar(20) NOT NULL,
	"endpoint" text NOT NULL,
	"api_key" text,
	"default_model" text NOT NULL,
	"is_default" boolean DEFAULT false,
	"max_image_size_mb" integer,
	"order_index" integer DEFAULT 0
);
--> statement-breakpoint
CREATE TABLE "consultants" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"project_id" varchar(36) NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"connection_id" varchar(36) NOT NULL,
	"model" text NOT NULL,
	"system_prompt" text NOT NULL,
	"created_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversation_flags" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"conversation_id" varchar(36) NOT NULL,
	"conversation_title" text NOT NULL,
	"project_id" varchar(36),
	"message_index" integer DEFAULT 0 NOT NULL,
	"pivot_sentence" text NOT NULL,
	"note" text,
	"created_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"project_id" varchar(36),
	"connection_id" varchar(36),
	"model" text NOT NULL,
	"messages" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "journal_entries" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"type" varchar(20) NOT NULL,
	"title" text NOT NULL,
	"detail" text,
	"related_path" text,
	"related_library_item_id" varchar(36),
	"related_conversation_id" varchar(36),
	"resolved" boolean DEFAULT false,
	"created_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledge_documents" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"project_id" varchar(36),
	"title" text NOT NULL,
	"source" text NOT NULL,
	"content" text NOT NULL,
	"chunks" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "library_folders" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"parent_id" varchar(36),
	"description" text,
	"created_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "library_items" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"folder_id" varchar(36),
	"title" text NOT NULL,
	"file_path" text,
	"source" varchar(20) NOT NULL,
	"mime_type" text,
	"content" text,
	"summary" text,
	"tags" text[],
	"created_at" text NOT NULL,
	"accessed_at" text
);
--> statement-breakpoint
CREATE TABLE "memory_entries" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"scope" varchar(20) NOT NULL,
	"project_id" varchar(36),
	"conversation_id" varchar(36),
	"content" text NOT NULL,
	"summary" text,
	"created_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"connection_id" varchar(36),
	"system_prompt" text,
	"current_task" text,
	"folder_path" text,
	"created_at" text NOT NULL,
	"order_index" integer DEFAULT 0
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"id" varchar(36) PRIMARY KEY DEFAULT 'default' NOT NULL,
	"default_connection_id" varchar(36),
	"default_project_id" varchar(36),
	"theme" varchar(10) DEFAULT 'system',
	"root_folder" text,
	"library_paths" text[],
	"morning_orientation_enabled" boolean DEFAULT false,
	"whisper_endpoint" text,
	"search_endpoint" text,
	"embedding_model" text,
	"day_note" text
);
--> statement-breakpoint
CREATE TABLE "system_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"timestamp" timestamp DEFAULT now() NOT NULL,
	"level" varchar(10) NOT NULL,
	"category" varchar(20) NOT NULL,
	"message" text NOT NULL,
	"detail" text
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"username" text NOT NULL,
	"password" text NOT NULL,
	CONSTRAINT "users_username_unique" UNIQUE("username")
);
--> statement-breakpoint
CREATE TABLE "workspace_docs" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"content" text DEFAULT '' NOT NULL,
	"project_id" varchar(36),
	"updated_at" text NOT NULL,
	"created_at" text NOT NULL
);
