import fs from 'node:fs';
import { createHash } from 'node:crypto';
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
    quality_report TEXT,
    revision INTEGER NOT NULL DEFAULT 1,
    content_version TEXT NOT NULL DEFAULT ''
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
    payload TEXT,
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

  CREATE TABLE IF NOT EXISTS mutation_proposals (
    id TEXT PRIMARY KEY,
    dataset_id TEXT NOT NULL,
    operation TEXT NOT NULL,
    status TEXT NOT NULL,
    requested_by TEXT NOT NULL,
    reason TEXT NOT NULL,
    before_values TEXT NOT NULL,
    after_values TEXT NOT NULL,
    dataset_revision INTEGER NOT NULL,
    content_version TEXT NOT NULL,
    idempotency_key TEXT NOT NULL UNIQUE,
    approval_token TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    approved_at TEXT,
    executed_at TEXT,
    rolled_back_at TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (dataset_id) REFERENCES datasets(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS mutation_audit_log (
    id TEXT PRIMARY KEY,
    proposal_id TEXT,
    dataset_id TEXT,
    action TEXT NOT NULL,
    actor TEXT NOT NULL,
    details TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_mutation_proposals_dataset ON mutation_proposals(dataset_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_mutation_audit_dataset ON mutation_audit_log(dataset_id, created_at DESC);
`);

// Run details are intentionally persisted as JSON alongside the human-readable
// activity rows. This keeps the existing persistence seam intact while making
// verified SQL/chart/proposal evidence available after a restart.
const agentStepColumns = new Set((db.prepare('PRAGMA table_info(agent_steps)').all() as Array<{ name: string }>).map((column) => column.name));
if (!agentStepColumns.has('payload')) db.exec('ALTER TABLE agent_steps ADD COLUMN payload TEXT');

const columns = db.prepare('PRAGMA table_info(datasets)').all() as Array<{ name: string }>;
const existingColumns = new Set(columns.map((column) => column.name));
const migrations = [
  ['analysis_status', "ALTER TABLE datasets ADD COLUMN analysis_status TEXT NOT NULL DEFAULT 'NOT_ANALYZED'"],
  ['last_analyzed_at', 'ALTER TABLE datasets ADD COLUMN last_analyzed_at TEXT'],
  ['quality_score', 'ALTER TABLE datasets ADD COLUMN quality_score INTEGER'],
  ['analysis_run_id', 'ALTER TABLE datasets ADD COLUMN analysis_run_id TEXT'],
  ['quality_report', 'ALTER TABLE datasets ADD COLUMN quality_report TEXT'],
  ['revision', 'ALTER TABLE datasets ADD COLUMN revision INTEGER NOT NULL DEFAULT 1'],
  ['content_version', "ALTER TABLE datasets ADD COLUMN content_version TEXT NOT NULL DEFAULT ''"]
] as const;
migrations.forEach(([name, statement]) => {
  if (!existingColumns.has(name)) db.exec(statement);
});
const proposalColumns = new Set((db.prepare('PRAGMA table_info(mutation_proposals)').all() as Array<{ name: string }>).map((column) => column.name));
if (!proposalColumns.has('approval_token')) db.exec("ALTER TABLE mutation_proposals ADD COLUMN approval_token TEXT NOT NULL DEFAULT ''");

// Older databases predate content versions. Populate them once from their
// persisted records so stale proposal checks are meaningful after an upgrade.
const emptyVersions = db.prepare("SELECT id, records FROM datasets WHERE content_version = ''").all() as Array<{ id: string; records: string }>;
const setVersion = db.prepare('UPDATE datasets SET content_version = ? WHERE id = ?');
emptyVersions.forEach((row) => setVersion.run(createHash('sha256').update(row.records).digest('hex'), row.id));

export default db;
