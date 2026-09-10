import { Router } from 'express';
import { z } from 'zod';
import { approveMutationProposal, createMutationProposal, getMutationProposal, listMutationAudit, listMutationProposals, rejectMutationProposal, rollbackMutationProposal } from '../mutationService.js';

const router = Router();
const createSchema = z.object({
  datasetId: z.string().uuid(),
  operation: z.enum(['delete_duplicate_rows', 'replace_unknown_with_null']),
  reason: z.string().trim().min(1).max(500),
  idempotencyKey: z.string().trim().min(1).max(200)
});
const approvalSchema = z.object({ expectedRevision: z.number().int().positive(), contentVersion: z.string().length(64) });

router.post('/proposals', (req, res) => {
  const parsed = createSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ message: 'A valid mutation proposal is required.', details: parsed.error.flatten() });
  try {
    const result = createMutationProposal(parsed.data.datasetId, parsed.data.operation, parsed.data.reason, parsed.data.idempotencyKey);
    if (!result) return res.status(404).json({ message: 'Dataset not found.' });
    return res.status(201).json({ ...result.proposal, approval_token: result.approvalToken });
  } catch (error) {
    return res.status(400).json({ message: error instanceof Error ? error.message : 'Mutation proposal could not be created.' });
  }
});

router.get('/proposals', (req, res) => {
  const datasetId = typeof req.query.datasetId === 'string' ? req.query.datasetId : '';
  if (!datasetId) return res.status(400).json({ message: 'datasetId is required.' });
  return res.json(listMutationProposals(datasetId));
});

router.get('/proposals/:id', (req, res) => {
  const proposal = getMutationProposal(req.params.id);
  return proposal ? res.json(proposal) : res.status(404).json({ message: 'Mutation proposal not found.' });
});

router.post('/proposals/:id/approve', (req, res) => {
  const parsed = approvalSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ message: 'Current dataset revision and content version are required.', details: parsed.error.flatten() });
  const result = approveMutationProposal(req.params.id, parsed.data.expectedRevision, parsed.data.contentVersion, typeof req.header('x-approval-token') === 'string' ? req.header('x-approval-token') : undefined);
  return res.status(result.status).json('proposal' in result ? result.proposal : { message: result.message, proposal: result.proposal });
});

router.post('/proposals/:id/rollback', (req, res) => {
  const result = rollbackMutationProposal(req.params.id);
  return res.status(result.status).json('proposal' in result ? result.proposal : { message: result.message });
});

router.post('/proposals/:id/reject', (req, res) => {
  const result = rejectMutationProposal(req.params.id);
  return res.status(result.status).json('proposal' in result ? result.proposal : { message: result.message });
});

router.get('/audit', (req, res) => {
  const datasetId = typeof req.query.datasetId === 'string' ? req.query.datasetId : '';
  if (!datasetId) return res.status(400).json({ message: 'datasetId is required.' });
  return res.json(listMutationAudit(datasetId));
});

export default router;
