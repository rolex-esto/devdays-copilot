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
