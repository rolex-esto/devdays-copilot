import type { AgentDefinition, AgentResult, ChartSpec } from './types.js';

const numeric = (value: unknown) => typeof value === 'number' && Number.isFinite(value);

export const createChartFromVerifiedSql = (sqlResult: AgentResult, title = 'Verified analysis') => {
  const evidence = sqlResult.evidence.find((item) => item.kind === 'sql_result');
  if (!evidence || !evidence.value || typeof evidence.value !== 'object') return null;
  const value = evidence.value as { columns?: string[]; rows?: Array<Record<string, unknown>> };
  const rows = Array.isArray(value.rows) ? value.rows : [];
  const columns = Array.isArray(value.columns) ? value.columns : [];
  if (!columns.length || !rows.length) return null;
  const yKey = columns.find((column) => rows.some((row) => numeric(row[column])));
  const xKey = columns.find((column) => column !== yKey);
  if (!yKey || !xKey) return { type: 'table' as const, title, xKey: columns[0], yKey: columns[0], data: rows };
  return {
    type: rows.length > 1 ? 'bar' as const : 'table' as const,
    title,
    xKey,
    yKey,
    data: rows
  } satisfies ChartSpec;
};

export const visualizationAgent: AgentDefinition = {
  id: 'visualization',
  name: 'Visualization Agent',
  capabilities: ['create deterministic chart specs from verified SQL output'],
  allowedTools: ['verified.sql.read'],
  requiresApproval: false,
  supportedIntents: ['visualization', 'data_analysis'],
  execute: () => ({ agentId: 'visualization', status: 'blocked', summary: 'Visualization requires verified SQL output.', evidence: [], errors: ['verified SQL result is required'] })
};

export const runVisualizationAgent = (sqlResult: AgentResult, title: string): AgentResult => {
  const chart = createChartFromVerifiedSql(sqlResult, title);
  if (!chart) return { agentId: 'visualization', status: 'partial', summary: 'The verified SQL result did not contain chartable rows.', evidence: [] };
  const sql = sqlResult.evidence.find((item) => item.kind === 'sql')?.value;
  return {
    agentId: 'visualization',
    status: 'success',
    summary: `Created a deterministic ${chart.type} chart from verified SQL output.`,
    evidence: [{
      kind: 'chart',
      summary: 'Chart spec derived only from the verified SQL result.',
      value: { ...chart, sql: typeof sql === 'string' ? sql : null }
    }]
  };
};
