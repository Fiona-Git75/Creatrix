ALTER TABLE conversations ADD COLUMN archived_at text;
ALTER TABLE projects ADD COLUMN archived_at text;
ALTER TABLE library_folders ADD COLUMN archived_at text;
ALTER TABLE library_items ADD COLUMN archived_at text;
