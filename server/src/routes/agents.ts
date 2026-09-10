import { Router } from 'express';
import { z } from 'zod';
import { runOrchestration } from '../agents/orchestrator.js';
import { getOrchestrationRun, listOrchestrationRuns } from '../agents/store.js';
import { executeReadOnlySql, SQL_MAX_TIMEOUT_MS, SqlValidationError } from '../agents/sqlAgent.js';
import { getDatasetById } from '../datasetService.js';

const router = Router();
const requestSchema = z.object({
  prompt: z.string().trim().min(1).max(4000),
  datasetId: z.string().uuid().optional()
});

router.post('/run', (req, res) => {
  const parsed = requestSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ message: 'A prompt is required.', details: parsed.error.flatten() });
  return res.json(runOrchestration(parsed.data.prompt, parsed.data.datasetId));
});

router.post('/sql', (req, res) => {
  const parsed = z.object({
    datasetId: z.string().uuid(),
    sql: z.string().min(1).max(2000),
    maxRows: z.number().int().positive().max(500).optional(),
    timeoutMs: z.number().int().positive().max(SQL_MAX_TIMEOUT_MS).optional()
  }).safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ message: 'datasetId and a bounded read-only SQL query are required.', details: parsed.error.flatten() });
  const dataset = getDatasetById(parsed.data.datasetId);
  if (!dataset) return res.status(404).json({ message: 'Dataset not found.' });
  try {
    return res.json(executeReadOnlySql(parsed.data.sql, dataset, parsed.data));
  } catch (error) {
    if (error instanceof SqlValidationError) return res.status(error.code === 'SQL_TIMEOUT' ? 408 : 400).json({ message: error.message, code: error.code });
    return res.status(400).json({ message: error instanceof Error ? error.message : 'SQL query failed.' });
  }
});

router.get('/runs', (req, res) => {
  const datasetId = typeof req.query.datasetId === 'string' ? req.query.datasetId : '';
  if (!datasetId) return res.status(400).json({ message: 'datasetId is required.' });
  return res.json(listOrchestrationRuns(datasetId));
});

router.get('/runs/:id', (req, res) => {
  const run = getOrchestrationRun(req.params.id);
  if (!run) return res.status(404).json({ message: 'Agent run not found.' });
  return res.json(run);
});

export default router;
