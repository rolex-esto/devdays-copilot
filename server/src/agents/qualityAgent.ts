import type { AgentDefinition } from './types.js';

export const dataQualityAgent: AgentDefinition = {
  id: 'data-quality',
  name: 'Data Quality Agent',
  capabilities: ['read dataset quality report', 'rank findings by severity and impact', 'map findings to source rows'],
  allowedTools: ['dataset.read', 'quality.read'],
  requiresApproval: false,
  supportedIntents: ['data_quality', 'data_analysis'],
  execute: ({ dataset, qualityReport }) => {
    if (!dataset) {
      return { agentId: 'data-quality', status: 'blocked', summary: 'A dataset is required for quality analysis.', evidence: [], errors: ['datasetId is required'] };
    }
    const hasUsableReport = qualityReport?.analysis_status === 'COMPLETED';
    if (!hasUsableReport || !qualityReport) {
      return { agentId: 'data-quality', status: 'partial', summary: 'No completed quality report is available yet.', evidence: [{ kind: 'dataset', summary: `${dataset.name} is ${dataset.analysis_status.toLowerCase().replace('_', ' ')}` }], recommendations: ['Run a quality check before reviewing findings.'] };
    }
    const findings = [...qualityReport.issues].sort((left, right) => {
      const order = { critical: 0, high: 1, medium: 2, low: 3 };
      return order[left.severity] - order[right.severity] || right.affected_rows - left.affected_rows;
    });
    return {
      agentId: 'data-quality',
      status: 'success',
      summary: findings.length ? `Found ${findings.length} quality findings affecting ${qualityReport.affected_rows} records.` : 'No quality findings were detected.',
      evidence: [
        { kind: 'quality', summary: `Score ${qualityReport.score ?? 'unavailable'} (${qualityReport.analysis_status.toLowerCase()})`, value: { score: qualityReport.score, label: qualityReport.label } },
        { kind: 'quality', summary: 'Highest-priority findings', value: findings.slice(0, 5).map((finding) => ({ severity: finding.severity, message: finding.message, column: finding.column_name, affectedRows: finding.affected_rows, recordIndexes: finding.record_indexes })) }
      ],
      recommendations: findings.slice(0, 3).map((finding) => `Review ${finding.message.toLowerCase()} (${finding.affected_rows} affected rows).`)
    };
  }
};
