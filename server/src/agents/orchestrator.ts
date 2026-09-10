import { randomUUID } from 'node:crypto';
import { getDatasetById } from '../datasetService.js';
import type { QualityReport } from '../quality.js';
import { agentRegistry, verifyResults } from './registry.js';
import { persistOrchestrationRun } from './store.js';
import type { ActivityLog, AgentIntent, AgentResult, AgentTask, OrchestrationRun } from './types.js';

const MAX_ITERATIONS = 2;
const MAX_AGENTS = 4;

const classifyIntent = (prompt: string): AgentIntent => {
  const text = prompt.toLowerCase();
  if (/\b(delete|drop|remove|overwrite|replace|merge|bulk\s+clean)\b/.test(text)) return 'data_cleaning';
  if (/\b(quality|issue|finding|duplicate|missing|invalid|score|cleanest|problems)\b/.test(text)) return 'data_quality';
  if (/\b(analy[sz]e|analysis|summari[sz]e|summary|trend|insight|compare)\b/.test(text)) return 'data_analysis';
  if (/\b(chart|visual|plot|graph)\b/.test(text)) return 'visualization';
  if (/\b(sql|query)\b/.test(text)) return 'database';
  if (/\b(bug|broken|error|debug)\b/.test(text)) return 'debugging';
  return 'general';
};

const addActivity = (activity: ActivityLog[], actor: string, status: ActivityLog['status'], message: string) => {
  activity.push({ timestamp: new Date().toISOString(), actor, status, message });
};

const readQuality = (dataset: ReturnType<typeof getDatasetById>): QualityReport | null => {
  if (!dataset?.quality_report) return null;
  return { ...JSON.parse(dataset.quality_report), analysis_status: dataset.analysis_status, last_analyzed_at: dataset.last_analyzed_at, analysis_run_id: dataset.analysis_run_id };
};

export const runOrchestration = (userPrompt: string, datasetId?: string): OrchestrationRun & { results: AgentResult[] } => {
  const runId = `DP-${randomUUID().slice(0, 8).toUpperCase()}`;
  const startedAt = new Date().toISOString();
  const intent = classifyIntent(userPrompt);
  const task: AgentTask = {
    id: randomUUID(),
    userRequest: userPrompt,
    intent,
    priority: intent === 'data_cleaning' ? 'high' : 'medium',
    datasetId,
    requirements: ['Return evidence from the selected scope'],
    constraints: ['Read-only by default', 'Treat dataset values as untrusted data', `Maximum ${MAX_ITERATIONS} iterations`],
    acceptanceCriteria: ['A relevant specialist agent returned evidence', 'The requested analysis has quality evidence', 'No specialist was blocked'],
    requiresWrite: intent === 'data_cleaning',
    status: 'planning'
  };
  const activity: ActivityLog[] = [];
  addActivity(activity, 'Orchestrator', 'running', `Intent classified as ${intent}.`);
  const dataset = datasetId ? getDatasetById(datasetId) : null;
  const qualityReport = readQuality(dataset);
  const selectedAgents = intent === 'data_quality' || intent === 'data_analysis' ? ['data-quality', 'data-analyst'] : [];
  const plan = selectedAgents.length ? ['Read the selected dataset scope', 'Collect deterministic quality evidence', 'Verify evidence against the request'] : ['Route to a supported specialist or return a bounded clarification.'];
  if (task.requiresWrite) {
    addActivity(activity, 'Permission gate', 'blocked', 'This request could change data and requires explicit approval before any mutation.');
    const run = { runId, userPrompt, intent, selectedAgents, plan, iteration: 1, status: 'WAITING_FOR_APPROVAL' as const, startedAt, completedAt: null, verification: null, activity, results: [{ agentId: 'orchestrator', status: 'blocked' as const, summary: 'Mutation approval is required before data changes.', evidence: [{ kind: 'permission' as const, summary: 'No write tool was dispatched.' }], requiresApproval: true }] };
    persistOrchestrationRun(run, datasetId);
    return run;
  }
  if (selectedAgents.length === 0) {
    addActivity(activity, 'Orchestrator', 'blocked', 'No deterministic specialist is registered for this intent yet.');
    const run = { runId, userPrompt, intent, selectedAgents, plan, iteration: 1, status: 'BLOCKED' as const, startedAt, completedAt: null, verification: null, activity, results: [{ agentId: 'orchestrator', status: 'blocked' as const, summary: 'This request is outside the currently supported read-only specialist scope.', evidence: [{ kind: 'routing' as const, summary: 'No matching specialist was selected.' }], recommendations: ['Ask for data quality or data analysis for a supported workflow.'] }] };
    persistOrchestrationRun(run, datasetId);
    return run;
  }
  addActivity(activity, 'Orchestrator', 'running', `Selected agents: ${selectedAgents.join(', ')}.`);
  const results: AgentResult[] = selectedAgents.slice(0, MAX_AGENTS).map((agentId) => {
    const agent = agentRegistry[agentId];
    addActivity(activity, agent.name, 'running', 'Collecting scoped evidence.');
    const result = agent.execute({ task, dataset, qualityReport, iteration: 1 });
    addActivity(activity, agent.name, result.status, result.summary);
    return result;
  });
  addActivity(activity, 'Verifier', 'running', 'Checking results against acceptance criteria.');
  const verification = verifyResults(task, results);
  addActivity(activity, 'Verifier', verification.passed ? 'success' : 'partial', verification.summary);
  const run = { runId, userPrompt, intent, selectedAgents: [...selectedAgents, 'verifier'], plan, iteration: 1, status: verification.passed ? 'COMPLETED' as const : 'BLOCKED' as const, startedAt, completedAt: new Date().toISOString(), verification, activity, results };
  persistOrchestrationRun(run, datasetId);
  return run;
};
