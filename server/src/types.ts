export type DatasetSourceType = 'CSV' | 'Manual' | 'Generated Sample';
export type AnalysisStatus = 'NOT_ANALYZED' | 'ANALYZING' | 'COMPLETED' | 'FAILED' | 'STALE';

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

export interface DatasetInput {
  name: string;
  description?: string;
  source_type?: DatasetSourceType;
  file_name?: string | null;
  records?: DatasetRecord[];
}
