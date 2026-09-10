export type DatasetSourceType = 'CSV' | 'Manual' | 'Generated Sample';

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
  analyzed_at: string;
  score: number;
  label: 'Excellent' | 'Good' | 'Needs Attention' | 'Poor' | 'Critical';
  total_issues: number;
  affected_rows: number;
  summary: { rows: number; columns: number; missing_values: number; duplicate_rows: number; invalid_values: number; potential_outliers: number };
  dimensions: { completeness: number; uniqueness: number; validity: number; consistency: number };
  issues: QualityIssue[];
  columns: ColumnProfile[];
}
