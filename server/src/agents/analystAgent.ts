import type { AgentDefinition } from './types.js';

export const dataAnalystAgent: AgentDefinition = {
  id: 'data-analyst',
  name: 'Data Analyst Agent',
  capabilities: ['summarize dataset shape', 'rank evidence by affected records', 'explain supported analysis'],
  allowedTools: ['dataset.read', 'quality.read', 'sql.plan'],
  requiresApproval: false,
  supportedIntents: ['data_analysis', 'data_quality'],
  execute: ({ dataset, qualityReport }) => {
    if (!dataset) return { agentId: 'data-analyst', status: 'blocked', summary: 'A dataset is required for analysis.', evidence: [], errors: ['datasetId is required'] };
    return {
      agentId: 'data-analyst',
      status: qualityReport ? 'success' : 'partial',
      summary: `${dataset.name} contains ${dataset.row_count} rows across ${dataset.column_count} columns.`,
      evidence: [{ kind: 'dataset', summary: `${dataset.source_type} dataset with ${dataset.row_count} rows and ${dataset.column_count} columns.`, value: { rowCount: dataset.row_count, columnCount: dataset.column_count } }],
      recommendations: qualityReport ? [`Use the quality score of ${qualityReport.score ?? 'unavailable'} as the current deterministic quality signal.`] : ['Run a quality check to produce evidence before making recommendations.']
    };
  }
};
