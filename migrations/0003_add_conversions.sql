CREATE TABLE IF NOT EXISTS conversions (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  source_file_id TEXT NOT NULL,
  source_format TEXT NOT NULL,
  target_format TEXT NOT NULL,
  target_file_id TEXT,
  status TEXT NOT NULL DEFAULT 'queued',
  provider TEXT,
  started_at TEXT,
  completed_at TEXT,
  error_message TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (owner_id) REFERENCES users(id),
  FOREIGN KEY (source_file_id) REFERENCES files(id),
  FOREIGN KEY (target_file_id) REFERENCES files(id)
);

CREATE INDEX IF NOT EXISTS idx_conversions_owner ON conversions(owner_id);
CREATE INDEX IF NOT EXISTS idx_conversions_source ON conversions(source_file_id);
CREATE INDEX IF NOT EXISTS idx_conversions_status ON conversions(status);

CREATE TABLE IF NOT EXISTS conversion_quotas (
  user_id TEXT PRIMARY KEY,
  period TEXT NOT NULL,
  used_count INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id)
);
