CREATE TABLE IF NOT EXISTS app_awards_night__ceremonies (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  subtitle TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'voting' CHECK (status IN ('voting', 'revealed', 'archived')),
  created_by_id TEXT NOT NULL,
  created_by_name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  revealed_at TEXT DEFAULT '',
  archived_at TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS app_awards_night__categories (
  id TEXT PRIMARY KEY,
  ceremony_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  nominee_type TEXT NOT NULL DEFAULT 'member' CHECK (nominee_type IN ('member', 'text')),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_by_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (ceremony_id) REFERENCES app_awards_night__ceremonies(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS app_awards_night__ballots (
  id TEXT PRIMARY KEY,
  ceremony_id TEXT NOT NULL,
  category_id TEXT NOT NULL,
  member_id TEXT NOT NULL,
  member_name TEXT NOT NULL,
  nominee_member_id TEXT DEFAULT '',
  nominee_name TEXT NOT NULL,
  reason TEXT DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (ceremony_id) REFERENCES app_awards_night__ceremonies(id) ON DELETE CASCADE,
  FOREIGN KEY (category_id) REFERENCES app_awards_night__categories(id) ON DELETE CASCADE,
  -- Defense in depth: the unique_per_member row policy is the real guard, but a
  -- DB-level constraint backstops any future insert path that bypasses it.
  UNIQUE (category_id, member_id)
);

CREATE INDEX IF NOT EXISTS app_awards_night__ceremonies_status_idx
  ON app_awards_night__ceremonies(status, created_at);

CREATE INDEX IF NOT EXISTS app_awards_night__categories_ceremony_idx
  ON app_awards_night__categories(ceremony_id, sort_order);

CREATE INDEX IF NOT EXISTS app_awards_night__ballots_category_idx
  ON app_awards_night__ballots(category_id, created_at);

CREATE INDEX IF NOT EXISTS app_awards_night__ballots_member_idx
  ON app_awards_night__ballots(ceremony_id, member_id);
