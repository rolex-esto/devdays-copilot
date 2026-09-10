import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dataDir = path.resolve(__dirname, '..', 'data');

fs.mkdirSync(dataDir, { recursive: true });

const dbPath = path.join(dataDir, 'datapulse.db');
const db = new Database(dbPath);

db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS datasets (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    source_type TEXT NOT NULL CHECK (source_type IN ('CSV', 'Manual', 'Generated Sample')),
    file_name TEXT,
    row_count INTEGER NOT NULL DEFAULT 0,
    column_count INTEGER NOT NULL DEFAULT 0,
    records TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    analysis_status TEXT NOT NULL DEFAULT 'NOT_ANALYZED',
    last_analyzed_at TEXT,
    quality_score INTEGER,
    analysis_run_id TEXT,
    quality_report TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_datasets_updated_at ON datasets(updated_at DESC);
`);

const columns = db.prepare('PRAGMA table_info(datasets)').all() as Array<{ name: string }>;
const existingColumns = new Set(columns.map((column) => column.name));
const migrations = [
  ['analysis_status', "ALTER TABLE datasets ADD COLUMN analysis_status TEXT NOT NULL DEFAULT 'NOT_ANALYZED'"],
  ['last_analyzed_at', 'ALTER TABLE datasets ADD COLUMN last_analyzed_at TEXT'],
  ['quality_score', 'ALTER TABLE datasets ADD COLUMN quality_score INTEGER'],
  ['analysis_run_id', 'ALTER TABLE datasets ADD COLUMN analysis_run_id TEXT'],
  ['quality_report', 'ALTER TABLE datasets ADD COLUMN quality_report TEXT']
] as const;
migrations.forEach(([name, statement]) => {
  if (!existingColumns.has(name)) db.exec(statement);
});

export default db;
