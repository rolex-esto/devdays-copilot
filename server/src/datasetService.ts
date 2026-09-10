import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import db from './db.js';
import type { Dataset, DatasetInput, DatasetRecord } from './types.js';

const datasetSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(1000).optional().default(''),
  source_type: z.enum(['CSV', 'Manual', 'Generated Sample']).default('Manual'),
  file_name: z.string().max(255).nullable().optional(),
  records: z.array(z.record(z.any())).optional().default([])
});

const updateDatasetSchema = datasetSchema.partial();

export type DatasetUpdateInput = Partial<DatasetInput>;

const normalizeRecords = (records: DatasetRecord[]): DatasetRecord[] => {
  return records.map((record) => {
    if (!record || typeof record !== 'object') {
      return {} as DatasetRecord;
    }

    return Object.fromEntries(
      Object.entries(record).map(([key, value]) => [key, value ?? null])
    ) as DatasetRecord;
  });
};

const buildDatasetMeta = (records: DatasetRecord[]) => {
  const rows = normalizeRecords(records);
  const columnNames = new Set<string>();

  rows.forEach((row) => {
    Object.keys(row).forEach((key) => columnNames.add(key));
  });

  return {
    row_count: rows.length,
    column_count: columnNames.size
  };
};

const mapRow = (row: any): Dataset => ({
  id: row.id,
  name: row.name,
  description: row.description ?? '',
  source_type: row.source_type,
  file_name: row.file_name ?? null,
  row_count: Number(row.row_count),
  column_count: Number(row.column_count),
  created_at: row.created_at,
  updated_at: row.updated_at,
  records: JSON.parse(row.records ?? '[]')
});

export const listDatasets = () => {
  const rows = db.prepare('SELECT * FROM datasets ORDER BY updated_at DESC').all();
  return rows.map(mapRow);
};

export const getDatasetById = (id: string) => {
  const row = db.prepare('SELECT * FROM datasets WHERE id = ?').get(id);
  return row ? mapRow(row) : null;
};

export const createDataset = (input: DatasetInput) => {
  const payload = datasetSchema.parse(input);
  const now = new Date().toISOString();
  const parsedRecords = normalizeRecords(payload.records ?? []);
  const meta = buildDatasetMeta(parsedRecords);
  const dataset: Dataset = {
    id: randomUUID(),
    name: payload.name,
    description: payload.description ?? '',
    source_type: payload.source_type ?? 'Manual',
    file_name: payload.file_name ?? null,
    row_count: meta.row_count,
    column_count: meta.column_count,
    created_at: now,
    updated_at: now,
    records: parsedRecords
  };

  db.prepare(
    `INSERT INTO datasets (id, name, description, source_type, file_name, row_count, column_count, records, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    dataset.id,
    dataset.name,
    dataset.description,
    dataset.source_type,
    dataset.file_name,
    dataset.row_count,
    dataset.column_count,
    JSON.stringify(dataset.records),
    dataset.created_at,
    dataset.updated_at
  );

  return dataset;
};

export const updateDataset = (id: string, input: DatasetUpdateInput) => {
  const existing = getDatasetById(id);
  if (!existing) {
    return null;
  }

  const payload = updateDatasetSchema.parse(input);
  const merged = {
    name: payload.name ?? existing.name,
    description: payload.description ?? existing.description,
    source_type: payload.source_type ?? existing.source_type,
    file_name: payload.file_name ?? existing.file_name,
    records: payload.records ? normalizeRecords(payload.records) : existing.records
  };

  const meta = buildDatasetMeta(merged.records);
  const updated: Dataset = {
    ...existing,
    ...merged,
    row_count: meta.row_count,
    column_count: meta.column_count,
    updated_at: new Date().toISOString()
  };

  db.prepare(
    `UPDATE datasets
     SET name = ?, description = ?, source_type = ?, file_name = ?, row_count = ?, column_count = ?, records = ?, updated_at = ?
     WHERE id = ?`
  ).run(
    updated.name,
    updated.description,
    updated.source_type,
    updated.file_name,
    updated.row_count,
    updated.column_count,
    JSON.stringify(updated.records),
    updated.updated_at,
    id
  );

  return updated;
};

export const deleteDataset = (id: string) => {
  const result = db.prepare('DELETE FROM datasets WHERE id = ?').run(id);
  return result.changes > 0;
};
