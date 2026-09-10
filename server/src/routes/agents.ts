import { Router } from 'express';
import { z } from 'zod';
import { runOrchestration } from '../agents/orchestrator.js';
import { getOrchestrationRun, listOrchestrationRuns } from '../agents/store.js';

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
