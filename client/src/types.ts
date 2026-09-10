export type DatasetSourceType = 'CSV' | 'Manual' | 'Generated Sample';
export type AnalysisStatus = 'NOT_ANALYZED' | 'ANALYZING' | 'COMPLETED' | 'FAILED' | 'STALE' | 'EMPTY';

export type DatasetRecord = Record<string, string | number | boolean | null>;

export interface Dataset {
  id: string;
  name: string;
  description: string;
  source_type: DatasetSourceType;
  file_name: string | null;
  row_count: number;
  column_count: number;
  created_at: string;
  updated_at: string;
  records: DatasetRecord[];
  analysis_status: AnalysisStatus;
  last_analyzed_at: string | null;
  quality_score: number | null;
  analysis_run_id: string | null;
  quality_report: string | null;
  revision: number;
  content_version: string;
}

export type IssueSeverity = 'critical' | 'high' | 'medium' | 'low';
export type InferredType = 'number' | 'boolean' | 'date' | 'text' | 'empty';
export interface QualityIssue {
  id: string;
  severity: IssueSeverity;
  issue_type: string;
  column_name: string | null;
  message: string;
  affected_rows: number;
  record_indexes: number[];
}
export interface ColumnProfile {
  name: string;
  inferred_type: InferredType;
  total_values: number;
  valid_values: number;
  null_values: number;
  missing_percentage: number;
  unique_values: number;
  duplicate_values: number;
  min_value: number | string | null;
  max_value: number | string | null;
  average_value: number | null;
  median_value: number | null;
  most_common_value: string | number | boolean | null;
  sample_values: Array<string | number | boolean>;
  outlier_count: number;
}
export interface QualityReport {
  analysis_status: AnalysisStatus;
  last_analyzed_at: string | null;
  analysis_run_id: string | null;
  analyzed_at: string;
  score: number | null;
  label: string;
  total_issues: number;
  affected_rows: number;
  summary: { rows: number; columns: number; missing_values: number; duplicate_rows: number; invalid_values: number; potential_outliers: number };
  dimensions: { completeness: number; uniqueness: number; validity: number; consistency: number };
  issues: QualityIssue[];
  columns: ColumnProfile[];
}

export interface AgentActivity {
  timestamp: string;
  actor: string;
  status: 'running' | 'success' | 'partial' | 'blocked' | 'failed';
  message: string;
}

export interface AgentRun {
  runId: string;
  userPrompt: string;
  intent: string;
  selectedAgents: string[];
  plan: string[];
  iteration: number;
  status: string;
  activity: AgentActivity[];
  results: Array<{
    agentId: string;
    status: string;
    summary: string;
    evidence: Array<{ kind: string; summary: string; value?: unknown }>;
    recommendations?: string[];
    requiresApproval?: boolean;
  }>;
  verification: { passed: boolean; summary: string } | null;
}

export interface MutationProposal {
  id: string;
  dataset_id: string;
  operation: string;
  status: string;
  reason: string;
  before_values: DatasetRecord[];
  after_values: DatasetRecord[];
  dataset_revision: number;
  content_version: string;
  expires_at: string;
  approval_token?: string | null;
}

export interface AgentRunSummary {
  id: string;
  dataset_id: string;
  user_prompt: string;
  classified_intent: string;
  status: string;
  iteration_count: number;
  started_at: string;
  completed_at: string | null;
}
