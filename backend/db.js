import Database from "better-sqlite3";

const db = new Database("alko.db");
db.pragma("journal_mode = WAL");

db.exec(`
CREATE TABLE IF NOT EXISTS places (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT CHECK(type IN ('shop','club','bench','police-history','other')) NOT NULL,
  name TEXT,
  lat REAL NOT NULL,
  lng REAL NOT NULL,
  source TEXT DEFAULT 'manual',
  risk_weight REAL DEFAULT 1.0,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS places_lat_lng ON places(lat,lng);

CREATE TABLE IF NOT EXISTS reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lat REAL NOT NULL,
  lng REAL NOT NULL,
  category TEXT CHECK(category IN ('suspicious','crowd','aggressive','drunk','other')) NOT NULL,
  message TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  status TEXT CHECK(status IN ('active','hidden','resolved')) DEFAULT 'active',
  user_hint TEXT
);

CREATE TABLE IF NOT EXISTS votes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  report_id INTEGER NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  value INTEGER CHECK(value IN (1,-1)) NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);
`);

export default db;
