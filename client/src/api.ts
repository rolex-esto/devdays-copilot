import type { Dataset, DatasetRecord, DatasetSourceType } from './types';
import type { QualityReport } from './types';

const BASE = '/api';

const buildHeaders = () => ({
  'Content-Type': 'application/json'
});

export const fetchDatasets = async (): Promise<Dataset[]> => {
  const response = await fetch(`${BASE}/datasets`);
  if (!response.ok) {
    throw new Error('Unable to load datasets.');
  }

  return response.json();
};

export const fetchQuality = async (id: string): Promise<QualityReport> => {
  const response = await fetch(`${BASE}/datasets/${id}/quality`);
  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'We could not analyze this dataset.' }));
    throw new Error(error.message ?? 'We could not analyze this dataset.');
  }
  return response.json();
};

export const createDataset = async (payload: {
  name: string;
  description?: string;
  source_type?: DatasetSourceType;
  file_name?: string | null;
  records?: DatasetRecord[];
}): Promise<Dataset> => {
  const response = await fetch(`${BASE}/datasets`, {
    method: 'POST',
    headers: buildHeaders(),
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Dataset could not be created.' }));
    throw new Error(error.message ?? 'Dataset could not be created.');
  }

  return response.json();
};

export const importCsvDataset = async (payload: {
  name: string;
  description?: string;
  file: File;
}): Promise<Dataset> => {
  const params = new URLSearchParams({
    name: payload.name,
    description: payload.description ?? '',
    file_name: payload.file.name
  });
  const response = await fetch(`${BASE}/datasets/import-csv?${params.toString()}`, {
    method: 'POST',
    headers: { 'Content-Type': 'text/csv' },
    body: await payload.file.text()
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'CSV file could not be imported.' }));
    throw new Error(error.message ?? 'CSV file could not be imported.');
  }

  return response.json();
};

export const updateDataset = async (
  id: string,
  payload: Partial<{
    name: string;
    description: string;
    source_type: DatasetSourceType;
    file_name: string | null;
    records: DatasetRecord[];
  }>
): Promise<Dataset> => {
  const response = await fetch(`${BASE}/datasets/${id}`, {
    method: 'PUT',
    headers: buildHeaders(),
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Dataset update failed.' }));
    throw new Error(error.message ?? 'Dataset update failed.');
  }

  return response.json();
};

export const deleteDataset = async (id: string): Promise<void> => {
  const response = await fetch(`${BASE}/datasets/${id}`, { method: 'DELETE' });

  if (!response.ok) {
    throw new Error('Dataset could not be deleted.');
  }
};
