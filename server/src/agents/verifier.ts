import type { AgentResult, AgentTask, VerificationResult } from './types.js';

export const verifyResults = (task: AgentTask, results: AgentResult[]): VerificationResult => {
  const hasDatasetEvidence = results.some((result) => result.evidence.some((evidence) => evidence.kind === 'dataset'));
  const hasQualityEvidence = task.intent === 'data_quality'
    ? results.some((result) => result.evidence.some((evidence) => evidence.kind === 'quality'))
    : true;
  const noBlockedResult = results.every((result) => result.status !== 'blocked');
  const sqlResult = results.find((result) => result.agentId === 'sql');
  const hasVerifiedSql = Boolean(sqlResult && sqlResult.status === 'success'
    && sqlResult.evidence.some((evidence) => evidence.kind === 'sql')
    && sqlResult.evidence.some((evidence) => {
      if (evidence.kind !== 'sql_result' || !evidence.value || typeof evidence.value !== 'object') return false;
      const value = evidence.value as { rows?: unknown; columns?: unknown; rowCount?: unknown };
      return Array.isArray(value.rows) && Array.isArray(value.columns) && typeof value.rowCount === 'number';
    }));
  const noErrors = results.every((result) => !result.errors?.length);
  const criteria = [
    { criterion: 'A relevant specialist agent returned evidence', passed: results.length > 0 && hasDatasetEvidence, evidence: `${results.length} agent result(s) collected.` },
    { criterion: 'The requested analysis has quality evidence', passed: hasQualityEvidence, evidence: hasQualityEvidence ? 'Quality evidence is present.' : 'No completed quality report was available.' },
    { criterion: 'No specialist was blocked', passed: noBlockedResult, evidence: noBlockedResult ? 'All selected agents completed.' : 'At least one selected agent was blocked.' }
  ];
  if (task.intent === 'data_analysis' || task.intent === 'visualization' || task.intent === 'database') {
    criteria.push({ criterion: 'Read-only SQL evidence is present and verified', passed: hasVerifiedSql, evidence: hasVerifiedSql ? 'SQL text and bounded result evidence are present.' : 'No verified SQL result was returned.' });
  }
  if (task.intent === 'data_analysis' || task.intent === 'visualization' || task.intent === 'database') {
    criteria.push({ criterion: 'The SQL specialist completed without a retry or blocked state', passed: sqlResult?.status === 'success', evidence: sqlResult?.summary ?? 'The SQL specialist did not return a result.' });
  }
  if (task.intent === 'visualization') {
    const chartResult = results.find((result) => result.agentId === 'visualization');
    const hasChart = chartResult?.status === 'success' && chartResult.evidence.some((evidence) => evidence.kind === 'chart');
    criteria.push({ criterion: 'A chart specification was derived from verified SQL output', passed: Boolean(hasChart), evidence: hasChart ? 'The visualization specification is backed by SQL evidence.' : 'No verified chart specification was returned.' });
  }
  criteria.push({ criterion: 'No specialist reported execution errors', passed: noErrors, evidence: noErrors ? 'All evidence was produced without reported errors.' : 'A specialist reported an execution error.' });
  return { passed: criteria.every((criterion) => criterion.passed), summary: `${criteria.filter((criterion) => criterion.passed).length}/${criteria.length} acceptance criteria satisfied.`, criteria };
};
