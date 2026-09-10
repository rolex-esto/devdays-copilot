import { createHash, randomUUID } from 'node:crypto';
import db from './db.js';
import { getDatasetById } from './datasetService.js';
import type { DatasetRecord } from './types.js';

export type ProposalStatus = 'PENDING' | 'APPROVED' | 'EXECUTED' | 'EXPIRED' | 'ROLLED_BACK' | 'REJECTED';
const EXPIRY_MS = 15 * 60 * 1000;

export interface MutationProposal {
  id: string;
  dataset_id: string;
  operation: string;
  status: ProposalStatus;
  requested_by: string;
  reason: string;
  before_values: DatasetRecord[];
  after_values: DatasetRecord[];
  dataset_revision: number;
  content_version: string;
  idempotency_key: string;
  expires_at: string;
  approved_at: string | null;
  executed_at: string | null;
  rolled_back_at: string | null;
  created_at: string;
}

const hashRecords = (records: DatasetRecord[]) => createHash('sha256').update(JSON.stringify(records)).digest('hex');
const mapProposal = (row: Record<string, unknown>): MutationProposal => ({
  id: String(row.id),
  dataset_id: String(row.dataset_id),
  operation: String(row.operation),
  status: row.status as ProposalStatus,
  requested_by: String(row.requested_by),
  reason: String(row.reason),
  before_values: JSON.parse(String(row.before_values)),
  after_values: JSON.parse(String(row.after_values)),
  dataset_revision: Number(row.dataset_revision),
  content_version: String(row.content_version),
  idempotency_key: String(row.idempotency_key),
  expires_at: String(row.expires_at),
  approved_at: row.approved_at ? String(row.approved_at) : null,
  executed_at: row.executed_at ? String(row.executed_at) : null,
  rolled_back_at: row.rolled_back_at ? String(row.rolled_back_at) : null,
  created_at: String(row.created_at)
});

const audit = (proposalId: string, datasetId: string, action: string, actor: string, details: Record<string, unknown>) => {
  db.prepare('INSERT INTO mutation_audit_log (id, proposal_id, dataset_id, action, actor, details, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(randomUUID(), proposalId, datasetId, action, actor, JSON.stringify(details), new Date().toISOString());
};

export const getMutationProposal = (id: string) => {
  const row = db.prepare('SELECT * FROM mutation_proposals WHERE id = ?').get(id) as Record<string, unknown> | undefined;
  return row ? mapProposal(row) : null;
};

export const listMutationProposals = (datasetId: string) => (db.prepare('SELECT * FROM mutation_proposals WHERE dataset_id = ? ORDER BY created_at DESC LIMIT 50').all(datasetId) as Array<Record<string, unknown>>).map(mapProposal);

export const createMutationProposal = (datasetId: string, operation: string, reason: string, idempotencyKey: string, requestedBy = 'user') => {
  if (!idempotencyKey.trim()) throw new Error('An idempotency key is required.');
  const existing = db.prepare('SELECT * FROM mutation_proposals WHERE idempotency_key = ?').get(idempotencyKey) as Record<string, unknown> | undefined;
  if (existing) {
    if (String(existing.dataset_id) !== datasetId) throw new Error('The idempotency key is already associated with another dataset.');
    return { proposal: mapProposal(existing), approvalToken: null };
  }
  const dataset = getDatasetById(datasetId);
  if (!dataset) return null;
  const before = dataset.records;
  const seen = new Set<string>();
  const after = operation === 'delete_duplicate_rows'
    ? before.filter((record) => {
      const key = JSON.stringify(record);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    : operation === 'replace_unknown_with_null'
      ? before.map((record) => Object.fromEntries(Object.entries(record).map(([key, value]) => [key, typeof value === 'string' && value.trim().toUpperCase() === 'UNKNOWN' ? null : value])))
    : before;
  const id = randomUUID();
  const approvalToken = randomUUID();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + EXPIRY_MS).toISOString();
  db.prepare(`INSERT INTO mutation_proposals
    (id, dataset_id, operation, status, requested_by, reason, before_values, after_values, dataset_revision, content_version, idempotency_key, approval_token, expires_at, created_at)
    VALUES (?, ?, ?, 'PENDING', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(id, datasetId, operation, requestedBy, reason, JSON.stringify(before), JSON.stringify(after), dataset.revision, dataset.content_version, idempotencyKey, approvalToken, expiresAt, now.toISOString());
  audit(id, datasetId, 'PROPOSED', requestedBy, { operation, datasetRevision: dataset.revision });
  return { proposal: getMutationProposal(id), approvalToken };
};

export const approveMutationProposal = (id: string, expectedRevision: number, expectedContentVersion: string, approvalToken?: string, actor = 'user') => {
  const row = db.prepare('SELECT * FROM mutation_proposals WHERE id = ?').get(id) as Record<string, unknown> | undefined;
  if (!row) return { status: 404 as const, message: 'Mutation proposal not found.' };
  const proposal = mapProposal(row);
  if (proposal.status === 'EXECUTED' || proposal.status === 'ROLLED_BACK') return { status: 200 as const, proposal };
  if (proposal.status !== 'PENDING') return { status: 409 as const, message: `Proposal is ${proposal.status.toLowerCase()}.`, proposal };
  if (new Date(proposal.expires_at).getTime() <= Date.now()) {
    db.prepare("UPDATE mutation_proposals SET status = 'EXPIRED' WHERE id = ?").run(id);
    audit(id, proposal.dataset_id, 'EXPIRED', actor, {});
    return { status: 410 as const, message: 'Mutation proposal has expired.' };
  }
  if (!approvalToken || approvalToken !== String(row.approval_token)) return { status: 403 as const, message: 'A valid server-issued approval token is required.' };
  const dataset = getDatasetById(proposal.dataset_id);
  if (!dataset || dataset.revision !== expectedRevision || dataset.content_version !== expectedContentVersion
    || dataset.revision !== proposal.dataset_revision || dataset.content_version !== proposal.content_version) {
    return { status: 409 as const, message: 'The dataset changed since this proposal was created.', proposal };
  }
  const now = new Date().toISOString();
  const transaction = db.transaction(() => {
    const changed = db.prepare('UPDATE datasets SET records = ?, row_count = ?, updated_at = ?, analysis_status = ?, revision = ?, content_version = ? WHERE id = ? AND revision = ? AND content_version = ?')
      .run(JSON.stringify(proposal.after_values), proposal.after_values.length, now, 'STALE', dataset.revision + 1, hashRecords(proposal.after_values), dataset.id, dataset.revision, dataset.content_version);
    if (changed.changes !== 1) throw new Error('The dataset changed while approving this proposal.');
    db.prepare("UPDATE mutation_proposals SET status = 'EXECUTED', approved_at = ?, executed_at = ? WHERE id = ?").run(now, now, id);
    audit(id, dataset.id, 'EXECUTED', actor, { beforeRevision: dataset.revision, afterRevision: dataset.revision + 1 });
  });
  try {
    transaction();
  } catch (error) {
    return { status: 409 as const, message: error instanceof Error ? error.message : 'Mutation could not be executed.' };
  }
  return { status: 200 as const, proposal: getMutationProposal(id) };
};

export const rejectMutationProposal = (id: string, actor = 'user') => {
  const proposal = getMutationProposal(id);
  if (!proposal) return { status: 404 as const, message: 'Mutation proposal not found.' };
  if (proposal.status !== 'PENDING') return { status: 409 as const, message: `Proposal is ${proposal.status.toLowerCase()}.`, proposal };
  db.prepare("UPDATE mutation_proposals SET status = 'REJECTED' WHERE id = ?").run(id);
  audit(id, proposal.dataset_id, 'REJECTED', actor, {});
  return { status: 200 as const, proposal: getMutationProposal(id) };
};

export const rollbackMutationProposal = (id: string, actor = 'user') => {
  const proposal = getMutationProposal(id);
  if (!proposal) return { status: 404 as const, message: 'Mutation proposal not found.' };
  if (proposal.status === 'ROLLED_BACK') return { status: 200 as const, proposal };
  if (proposal.status !== 'EXECUTED') return { status: 409 as const, message: 'Only an executed proposal can be rolled back.' };
  const dataset = getDatasetById(proposal.dataset_id);
  if (!dataset || JSON.stringify(dataset.records) !== JSON.stringify(proposal.after_values)) return { status: 409 as const, message: 'Rollback refused because the dataset changed after execution.' };
  const now = new Date().toISOString();
  const transaction = db.transaction(() => {
    db.prepare('UPDATE datasets SET records = ?, row_count = ?, updated_at = ?, analysis_status = ?, revision = ?, content_version = ? WHERE id = ?')
      .run(JSON.stringify(proposal.before_values), proposal.before_values.length, now, 'STALE', dataset.revision + 1, hashRecords(proposal.before_values), dataset.id);
    db.prepare("UPDATE mutation_proposals SET status = 'ROLLED_BACK', rolled_back_at = ? WHERE id = ?").run(now, id);
    audit(id, dataset.id, 'ROLLED_BACK', actor, { restoredRevision: dataset.revision + 1 });
  });
  transaction();
  return { status: 200 as const, proposal: getMutationProposal(id) };
};

export const listMutationAudit = (datasetId: string) => db.prepare('SELECT * FROM mutation_audit_log WHERE dataset_id = ? ORDER BY created_at DESC LIMIT 100').all(datasetId);
