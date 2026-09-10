import type { AgentRun, AgentRunSummary, Dataset, DatasetRecord, DatasetSourceType, MutationProposal } from './types';
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

export const runQuality = async (id: string): Promise<QualityReport> => {
  const response = await fetch(`${BASE}/datasets/${id}/quality`, { method: 'POST' });
  if (!response.ok) throw new Error('We could not analyze this dataset.');
  return response.json();
};

export const runAgent = async (prompt: string, datasetId: string): Promise<AgentRun> => {
  const response = await fetch(`${BASE}/agents/run`, {
    method: 'POST',
    headers: buildHeaders(),
    body: JSON.stringify({ prompt, datasetId })
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'DataPulse could not process that request.' }));
    throw new Error(error.message ?? 'DataPulse could not process that request.');
  }
  return response.json();
};

export const runReadOnlySql = async (datasetId: string, sql: string): Promise<Record<string, unknown>> => {
  const response = await fetch(`${BASE}/agents/sql`, { method: 'POST', headers: buildHeaders(), body: JSON.stringify({ datasetId, sql }) });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.message ?? 'SQL query failed.');
  return body;
};

export const fetchMutationProposals = async (datasetId: string): Promise<MutationProposal[]> => {
  const response = await fetch(`${BASE}/mutations/proposals?datasetId=${encodeURIComponent(datasetId)}`);
  if (!response.ok) throw new Error('We could not load mutation proposals.');
  return response.json();
};

export const approveMutationProposal = async (proposal: MutationProposal): Promise<MutationProposal> => {
  const response = await fetch(`${BASE}/mutations/proposals/${encodeURIComponent(proposal.id)}/approve`, {
    method: 'POST',
    headers: { ...buildHeaders(), ...(proposal.approval_token ? { 'x-approval-token': proposal.approval_token } : {}) },
    body: JSON.stringify({ expectedRevision: proposal.dataset_revision, contentVersion: proposal.content_version })
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.message ?? 'The mutation proposal could not be approved.');
  return body;
};

export const fetchAgentRuns = async (datasetId: string): Promise<AgentRunSummary[]> => {
  const response = await fetch(`${BASE}/agents/runs?datasetId=${encodeURIComponent(datasetId)}`);
  if (!response.ok) throw new Error('We could not load agent run history.');
  return response.json();
};

export const fetchAgentRun = async (runId: string): Promise<Record<string, unknown>> => {
  const response = await fetch(`${BASE}/agents/runs/${encodeURIComponent(runId)}`);
  if (!response.ok) throw new Error('We could not load that agent run.');
  return response.json();
};

export const updateDatasetRecord = async (datasetId: string, recordIndex: number, record: DatasetRecord): Promise<Dataset> => {
  const response = await fetch(`${BASE}/datasets/${datasetId}/records/${recordIndex}`, {
    method: 'PUT',
    headers: buildHeaders(),
    body: JSON.stringify(record)
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'We could not save this record.' }));
    throw new Error(error.message ?? 'We could not save this record.');
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
    if (response.status === 413) {
      throw new Error('CSV exceeds the maximum upload size.');
    }
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
