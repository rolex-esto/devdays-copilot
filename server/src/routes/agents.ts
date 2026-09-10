import { Router } from 'express';
import { z } from 'zod';
import { runOrchestration } from '../agents/orchestrator.js';

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

export default router;
