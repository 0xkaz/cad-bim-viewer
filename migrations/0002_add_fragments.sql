-- Add Fragments cache tracking to files table
ALTER TABLE files ADD COLUMN fragments_r2_key TEXT;
ALTER TABLE files ADD COLUMN fragments_size_bytes INTEGER;
ALTER TABLE files ADD COLUMN fragments_created_at TEXT;
