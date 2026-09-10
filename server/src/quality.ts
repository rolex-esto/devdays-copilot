import type { DatasetRecord } from './types.js';

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
  analysis_status: 'COMPLETED';
  last_analyzed_at: string;
  analysis_run_id: string | null;
  analyzed_at: string;
  score: number;
  label: 'Excellent' | 'Good' | 'Needs Attention' | 'Poor' | 'Critical';
  total_issues: number;
  affected_rows: number;
  summary: {
    rows: number;
    columns: number;
    missing_values: number;
    duplicate_rows: number;
    invalid_values: number;
    potential_outliers: number;
  };
  dimensions: {
    completeness: number;
    uniqueness: number;
    validity: number;
    consistency: number;
  };
  issues: QualityIssue[];
  columns: ColumnProfile[];
}

const missingTokens = new Set(['', 'null', 'n/a', 'na', 'nan', 'none', 'unknown', 'error', '?', '-']);
const numberPattern = /^[-+]?\d+(?:\.\d+)?$/;
const dateHeaderPattern = /(date|time|created|updated|timestamp)/i;
const numericHeaderPattern = /(amount|price|cost|total|quantity|qty|count|score|age|number|id)$/i;

const asText = (value: DatasetRecord[string]): string => String(value ?? '').trim();

const isMissing = (value: DatasetRecord[string]): boolean => {
  if (value === null || value === undefined) return true;
  return missingTokens.has(asText(value).toLowerCase());
};

const numericValue = (value: DatasetRecord[string]): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const text = asText(value);
  return numberPattern.test(text) ? Number(text) : null;
};

const inferType = (name: string, values: DatasetRecord[string][]): InferredType => {
  const present = values.filter((value) => !isMissing(value));
  if (present.length === 0) return 'empty';
  const numericCount = present.filter((value) => numericValue(value) !== null).length;
  if (numericCount / present.length >= 0.8 || (numericHeaderPattern.test(name) && numericCount > 0)) return 'number';
  const booleanCount = present.filter((value) => ['true', 'false'].includes(asText(value).toLowerCase())).length;
  if (booleanCount === present.length) return 'boolean';
  const dateCount = present.filter((value) => {
    const parsed = Date.parse(asText(value));
    return !Number.isNaN(parsed) && /[-/]/.test(asText(value));
  }).length;
  if (dateCount / present.length >= 0.8 && dateHeaderPattern.test(name)) return 'date';
  return 'text';
};

const median = (values: number[]): number | null => {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

const issue = (
  issueType: string,
  severity: IssueSeverity,
  columnName: string | null,
  message: string,
  indexes: number[]
): QualityIssue => ({
  id: `${issueType}-${columnName ?? 'dataset'}`,
  issue_type: issueType,
  severity,
  column_name: columnName,
  message,
  affected_rows: indexes.length,
  record_indexes: indexes.slice(0, 250)
});

const qualityLabel = (score: number): QualityReport['label'] => {
  if (score >= 90) return 'Excellent';
  if (score >= 80) return 'Good';
  if (score >= 70) return 'Needs Attention';
  if (score >= 50) return 'Poor';
  return 'Critical';
};

export const analyzeDataset = (records: DatasetRecord[]): QualityReport => {
  const rows = records ?? [];
  const columnNames = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  const issues: QualityIssue[] = [];
  const profiles: ColumnProfile[] = [];
  let missingValues = 0;
  let invalidValues = 0;
  let potentialOutliers = 0;

  for (const columnName of columnNames) {
    const values = rows.map((row) => row[columnName] ?? null);
    const present = values.filter((value) => !isMissing(value));
    const inferredType = inferType(columnName, values);
    const nullIndexes = values.map((value, index) => (isMissing(value) ? index : -1)).filter((index) => index >= 0);
    const numericValues = values.map(numericValue).filter((value): value is number => value !== null);
    const counts = new Map<string, number>();
    present.forEach((value) => counts.set(asText(value), (counts.get(asText(value)) ?? 0) + 1));
    const sortedCounts = [...counts.entries()].sort((left, right) => right[1] - left[1]);
    const outlierIndexes: number[] = [];

    if (nullIndexes.length > 0) {
      missingValues += nullIndexes.length;
      issues.push(issue('missing_values', nullIndexes.length / Math.max(rows.length, 1) > 0.25 ? 'high' : 'medium',
        columnName, `${nullIndexes.length} missing or placeholder values found.`, nullIndexes));
    }

    if (inferredType === 'number') {
      const invalidIndexes = values.map((value, index) => (!isMissing(value) && numericValue(value) === null ? index : -1)).filter((index) => index >= 0);
      if (invalidIndexes.length > 0) {
        invalidValues += invalidIndexes.length;
        issues.push(issue('invalid_number', 'high', columnName, `${invalidIndexes.length} values are not valid numbers.`, invalidIndexes));
      }
      if (numericValues.length >= 4) {
        const first = median(numericValues.slice().sort((a, b) => a - b).slice(0, Math.floor(numericValues.length / 2))) ?? 0;
        const third = median(numericValues.slice().sort((a, b) => a - b).slice(Math.ceil(numericValues.length / 2))) ?? 0;
        const iqr = third - first;
        const lower = first - (iqr * 1.5);
        const upper = third + (iqr * 1.5);
        values.forEach((value, index) => {
          const number = numericValue(value);
          if (number !== null && (number < lower || number > upper)) outlierIndexes.push(index);
        });
        if (outlierIndexes.length > 0) {
          potentialOutliers += outlierIndexes.length;
          issues.push(issue('potential_outlier', 'low', columnName, `${outlierIndexes.length} values look unusually far from the rest.`, outlierIndexes));
        }
      }
    }

    const duplicateValues = present.length - counts.size;
    profiles.push({
      name: columnName,
      inferred_type: inferredType,
      total_values: values.length,
      valid_values: present.length,
      null_values: nullIndexes.length,
      missing_percentage: rows.length ? Math.round((nullIndexes.length / rows.length) * 1000) / 10 : 0,
      unique_values: counts.size,
      duplicate_values: duplicateValues,
      min_value: inferredType === 'number' ? Math.min(...numericValues) || null : (inferredType === 'date' ? present.map(asText).sort()[0] ?? null : null),
      max_value: inferredType === 'number' ? Math.max(...numericValues) || null : (inferredType === 'date' ? present.map(asText).sort().at(-1) ?? null : null),
      average_value: numericValues.length ? Math.round((numericValues.reduce((sum, value) => sum + value, 0) / numericValues.length) * 100) / 100 : null,
      median_value: median(numericValues),
      most_common_value: sortedCounts[0]?.[0] ?? null,
      sample_values: present.slice(0, 5) as Array<string | number | boolean>,
      outlier_count: outlierIndexes.length
    });
  }

  const rowKeys = new Map<string, number[]>();
  rows.forEach((row, index) => {
    const key = JSON.stringify(row);
    rowKeys.set(key, [...(rowKeys.get(key) ?? []), index]);
  });
  const duplicateIndexes = [...rowKeys.values()].filter((indexes) => indexes.length > 1).flat().slice(0, 250);
  if (duplicateIndexes.length > 0) {
    issues.push(issue('duplicate_rows', 'high', null, `${duplicateIndexes.length} rows are exact duplicates.`, duplicateIndexes));
  }

  const duplicateIdColumn = columnNames.find((name) => /(^|[_\s-])id$/i.test(name));
  if (duplicateIdColumn) {
    const idGroups = new Map<string, number[]>();
    rows.forEach((row, index) => {
      if (!isMissing(row[duplicateIdColumn])) {
        const key = asText(row[duplicateIdColumn]);
        idGroups.set(key, [...(idGroups.get(key) ?? []), index]);
      }
    });
    const duplicateIdIndexes = [...idGroups.values()].filter((indexes) => indexes.length > 1).flat();
    if (duplicateIdIndexes.length > 0) {
      issues.push(issue('duplicate_identifier', 'high', duplicateIdColumn, `${duplicateIdIndexes.length} rows reuse the same identifier.`, duplicateIdIndexes));
    }
  }

  const qualityPenalty = issues.reduce((sum, finding) => {
    const weight = finding.severity === 'high' ? 8 : finding.severity === 'medium' ? 4 : finding.severity === 'low' ? 2 : 12;
    return sum + Math.min(weight, (finding.affected_rows / Math.max(rows.length, 1)) * weight);
  }, 0);
  const score = Math.max(0, Math.min(100, Math.round(100 - qualityPenalty)));
  const completeness = Math.max(0, Math.round(100 - (missingValues / Math.max(rows.length * Math.max(columnNames.length, 1), 1)) * 100));
  const uniqueness = Math.max(0, Math.round(100 - (duplicateIndexes.length / Math.max(rows.length, 1)) * 100));
  const validity = Math.max(0, Math.round(100 - (invalidValues / Math.max(rows.length * Math.max(columnNames.length, 1), 1)) * 100));
  const consistency = Math.max(0, Math.round(100 - (potentialOutliers / Math.max(rows.length, 1)) * 100));

  return {
    analysis_status: 'COMPLETED',
    last_analyzed_at: new Date().toISOString(),
    analysis_run_id: null,
    analyzed_at: new Date().toISOString(),
    score,
    label: qualityLabel(score),
    total_issues: issues.length,
    affected_rows: new Set(issues.flatMap((finding) => finding.record_indexes)).size,
    summary: {
      rows: rows.length,
      columns: columnNames.length,
      missing_values: missingValues,
      duplicate_rows: duplicateIndexes.length,
      invalid_values: invalidValues,
      potential_outliers: potentialOutliers
    },
    dimensions: { completeness, uniqueness, validity, consistency },
    issues,
    columns: profiles
  };
};
