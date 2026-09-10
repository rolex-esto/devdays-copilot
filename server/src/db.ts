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

  CREATE TABLE IF NOT EXISTS agent_runs (
    id TEXT PRIMARY KEY,
    dataset_id TEXT,
    user_prompt TEXT NOT NULL,
    classified_intent TEXT NOT NULL,
    status TEXT NOT NULL,
    iteration_count INTEGER NOT NULL DEFAULT 1,
    started_at TEXT NOT NULL,
    completed_at TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS agent_steps (
    id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL,
    agent_id TEXT NOT NULL,
    iteration INTEGER NOT NULL,
    status TEXT NOT NULL,
    summary TEXT NOT NULL,
    started_at TEXT NOT NULL,
    completed_at TEXT,
    FOREIGN KEY (run_id) REFERENCES agent_runs(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS agent_verifications (
    run_id TEXT PRIMARY KEY,
    passed INTEGER NOT NULL,
    score REAL NOT NULL,
    criteria_passed TEXT NOT NULL,
    criteria_failed TEXT NOT NULL,
    recommendation TEXT NOT NULL,
    FOREIGN KEY (run_id) REFERENCES agent_runs(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_agent_runs_dataset ON agent_runs(dataset_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_agent_steps_run ON agent_steps(run_id, started_at);
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
