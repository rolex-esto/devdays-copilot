import type { AgentResult, AgentTask, VerificationResult } from './types.js';

export const verifyResults = (task: AgentTask, results: AgentResult[]): VerificationResult => {
  const hasDatasetEvidence = results.some((result) => result.evidence.some((evidence) => evidence.kind === 'dataset'));
  const hasQualityEvidence = task.intent === 'data_quality' || task.intent === 'data_analysis'
    ? results.some((result) => result.evidence.some((evidence) => evidence.kind === 'quality'))
    : true;
  const noBlockedResult = results.every((result) => result.status !== 'blocked');
  const criteria = [
    { criterion: 'A relevant specialist agent returned evidence', passed: results.length > 0 && hasDatasetEvidence, evidence: `${results.length} agent result(s) collected.` },
    { criterion: 'The requested analysis has quality evidence', passed: hasQualityEvidence, evidence: hasQualityEvidence ? 'Quality evidence is present.' : 'No completed quality report was available.' },
    { criterion: 'No specialist was blocked', passed: noBlockedResult, evidence: noBlockedResult ? 'All selected agents completed.' : 'At least one selected agent was blocked.' }
  ];
  return { passed: criteria.every((criterion) => criterion.passed), summary: `${criteria.filter((criterion) => criterion.passed).length}/${criteria.length} acceptance criteria satisfied.`, criteria };
};
