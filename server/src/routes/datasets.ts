import express, { Router } from 'express';
import { z } from 'zod';
import { createDataset, deleteDataset, getDatasetById, listDatasets, updateDataset } from '../datasetService.js';
import { parseCsv } from '../csv.js';
import { analyzeDataset } from '../quality.js';

const router = Router();

const datasetBodySchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(1000).optional(),
  source_type: z.enum(['CSV', 'Manual', 'Generated Sample']).optional(),
  file_name: z.string().max(255).nullable().optional(),
  records: z.array(z.record(z.any())).optional()
});

router.get('/', (_req, res) => {
  const datasets = listDatasets();
  res.json(datasets);
});

router.post('/', (req, res) => {
  const parsed = datasetBodySchema.safeParse(req.body ?? {});

  if (!parsed.success) {
    return res.status(400).json({
      message: 'Dataset validation failed',
      details: parsed.error.flatten()
    });
  }

  const dataset = createDataset(parsed.data);
  return res.status(201).json(dataset);
});

router.post('/import-csv', express.text({ type: ['text/csv', 'text/plain'], limit: '5mb' }), (req, res) => {
  if (typeof req.body !== 'string' || req.body.trim() === '') {
    return res.status(400).json({ message: 'Choose a CSV file with at least a header row.' });
  }

  const name = typeof req.query.name === 'string' ? req.query.name.trim() : '';
  if (!name) {
    return res.status(400).json({ message: 'A dataset name is required.' });
  }

  try {
    const parsed = parseCsv(req.body);
    const dataset = createDataset({
      name,
      description: typeof req.query.description === 'string' ? req.query.description : '',
      source_type: 'CSV',
      file_name: typeof req.query.file_name === 'string' ? req.query.file_name : null,
      records: parsed.records
    });
    return res.status(201).json(dataset);
  } catch (error) {
    return res.status(400).json({
      message: error instanceof Error ? error.message : 'The CSV file could not be read.'
    });
  }
});

router.get('/:id/quality', (req, res) => {
  const dataset = getDatasetById(req.params.id);
  if (!dataset) {
    return res.status(404).json({ message: 'Dataset not found' });
  }
  return res.json(analyzeDataset(dataset.records));
});

router.get('/:id', (req, res) => {
  const dataset = getDatasetById(req.params.id);

  if (!dataset) {
    return res.status(404).json({ message: 'Dataset not found' });
  }

  return res.json(dataset);
});

router.put('/:id', (req, res) => {
  const parsed = datasetBodySchema.partial().safeParse(req.body ?? {});

  if (!parsed.success) {
    return res.status(400).json({
      message: 'Dataset update failed',
      details: parsed.error.flatten()
    });
  }

  const updated = updateDataset(req.params.id, parsed.data);

  if (!updated) {
    return res.status(404).json({ message: 'Dataset not found' });
  }

  return res.json(updated);
});

router.delete('/:id', (req, res) => {
  const deleted = deleteDataset(req.params.id);

  if (!deleted) {
    return res.status(404).json({ message: 'Dataset not found' });
  }

  return res.status(204).send();
});

export default router;
