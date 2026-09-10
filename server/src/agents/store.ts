import db from '../db.js';
import { randomUUID } from 'node:crypto';
import type { AgentResult, OrchestrationRun } from './types.js';

export const persistOrchestrationRun = (run: OrchestrationRun & { results: AgentResult[] }, datasetId?: string) => {
  const insertRun = db.prepare(`INSERT OR REPLACE INTO agent_runs
    (id, dataset_id, user_prompt, classified_intent, status, iteration_count, started_at, completed_at, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const insertStep = db.prepare(`INSERT INTO agent_steps
    (id, run_id, agent_id, iteration, status, summary, started_at, completed_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
  const insertVerification = db.prepare(`INSERT OR REPLACE INTO agent_verifications
    (run_id, passed, score, criteria_passed, criteria_failed, recommendation)
    VALUES (?, ?, ?, ?, ?, ?)`);
  const transaction = db.transaction(() => {
    insertRun.run(run.runId, datasetId ?? null, run.userPrompt, run.intent, run.status, run.iteration, run.startedAt, run.completedAt, run.startedAt);
    run.activity.forEach((entry) => insertStep.run(
      randomUUID(),
      run.runId,
      entry.actor,
      run.iteration,
      entry.status,
      entry.message,
      entry.timestamp,
      entry.timestamp
    ));
    run.results.forEach((result) => insertStep.run(
      randomUUID(),
      run.runId,
      result.agentId,
      run.iteration,
      result.status,
      result.summary,
      run.startedAt,
      run.completedAt
    ));
    if (run.verification) {
      const passed = run.verification.criteria.filter((criterion) => criterion.passed);
      const failed = run.verification.criteria.filter((criterion) => !criterion.passed);
      insertVerification.run(run.runId, run.verification.passed ? 1 : 0, passed.length / Math.max(run.verification.criteria.length, 1), JSON.stringify(passed), JSON.stringify(failed), run.verification.summary);
    }
  });
  transaction();
};

export const listOrchestrationRuns = (datasetId: string) => db.prepare(
  'SELECT * FROM agent_runs WHERE dataset_id = ? ORDER BY created_at DESC LIMIT 50'
).all(datasetId);

export const getOrchestrationRun = (runId: string) => {
  const run = db.prepare('SELECT * FROM agent_runs WHERE id = ?').get(runId) as Record<string, unknown> | undefined;
  if (!run) return null;
  const steps = db.prepare('SELECT agent_id, iteration, status, summary, started_at, completed_at FROM agent_steps WHERE run_id = ? ORDER BY started_at').all(runId);
  const verification = db.prepare('SELECT * FROM agent_verifications WHERE run_id = ?').get(runId) ?? null;
  return { ...run, steps, verification };
};
