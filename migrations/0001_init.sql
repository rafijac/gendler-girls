-- 0001_init.sql — initial schema for the Gendler Girls memorial site.
-- Content entities (soft-deletable, versioned) + site settings (versioned).
-- All timestamps are ISO 8601 UTC strings. `data` / settings `value` hold JSON text.

CREATE TABLE IF NOT EXISTS entities (
  id TEXT PRIMARY KEY,
  type TEXT,
  slug TEXT,
  title TEXT,
  data TEXT,
  position INTEGER,
  visible INTEGER DEFAULT 1,
  album TEXT,
  image_key TEXT,
  created_at TEXT,
  updated_at TEXT,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_id TEXT,
  data TEXT,
  action TEXT,
  created_at TEXT
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS settings_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key TEXT,
  value TEXT,
  action TEXT,
  created_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_entities_type ON entities(type);
CREATE INDEX IF NOT EXISTS idx_entities_deleted_at ON entities(deleted_at);
CREATE INDEX IF NOT EXISTS idx_versions_entity_id ON versions(entity_id);
CREATE INDEX IF NOT EXISTS idx_settings_versions_key ON settings_versions(key);
