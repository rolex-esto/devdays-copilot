import express, { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { createDataset, deleteDataset, getDatasetById, listDatasets, saveQualityReport, updateDataset, updateDatasetRecord } from '../datasetService.js';
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

const emptyQualityReport = (status: string) => ({
  analysis_status: status,
  last_analyzed_at: null,
  analysis_run_id: null,
  analyzed_at: '',
  score: null,
  label: status === 'EMPTY' ? 'No data' : status === 'STALE' ? 'Stale analysis' : status === 'FAILED' ? 'Analysis failed' : status === 'ANALYZING' ? 'Analyzing dataset...' : 'Not analyzed yet',
  total_issues: 0,
  affected_rows: 0,
  summary: { rows: 0, columns: 0, missing_values: 0, duplicate_rows: 0, invalid_values: 0, potential_outliers: 0 },
  dimensions: { completeness: 0, uniqueness: 0, validity: 0, consistency: 0 },
  issues: [],
  columns: []
});

router.get('/:id/quality', (req, res) => {
  const dataset = getDatasetById(req.params.id);
  if (!dataset) {
    return res.status(404).json({ message: 'Dataset not found' });
  }
  if (!dataset.quality_report) return res.json(emptyQualityReport(dataset.analysis_status));
  return res.json({ ...JSON.parse(dataset.quality_report), analysis_status: dataset.analysis_status, last_analyzed_at: dataset.last_analyzed_at, analysis_run_id: dataset.analysis_run_id });
});

router.post('/:id/quality', (req, res) => {
  const dataset = getDatasetById(req.params.id);
  if (!dataset) return res.status(404).json({ message: 'Dataset not found' });
  const analysisRunId = randomUUID();
  try {
    const report = analyzeDataset(dataset.records);
    const saved = saveQualityReport(dataset.id, JSON.stringify(report), report.score, report.analyzed_at, analysisRunId, report.analysis_status);
    return res.json({ ...report, last_analyzed_at: report.analyzed_at, analysis_run_id: saved?.analysis_run_id ?? analysisRunId });
  } catch (error) {
    return res.status(500).json({ ...emptyQualityReport('FAILED'), message: error instanceof Error ? error.message : 'We could not analyze this dataset.' });
  }
});

router.put('/:id/records/:recordIndex', (req, res) => {
  const recordIndex = Number(req.params.recordIndex);
  if (!Number.isInteger(recordIndex) || recordIndex < 0 || !req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
    return res.status(400).json({ message: 'A valid record and row number are required.' });
  }
  const updated = updateDatasetRecord(req.params.id, recordIndex, req.body);
  if (!updated) return res.status(404).json({ message: 'Dataset or record not found' });
  return res.json(updated);
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
