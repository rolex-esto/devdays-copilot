import { randomUUID } from 'node:crypto';
import { getDatasetById } from '../datasetService.js';
import type { QualityReport } from '../quality.js';
import { agentRegistry, verifyResults } from './registry.js';
import { persistOrchestrationRun } from './store.js';
import type { ActivityLog, AgentIntent, AgentResult, AgentTask, OrchestrationRun } from './types.js';
import { runSqlAgent } from './sqlAgent.js';
import { runVisualizationAgent } from './visualizationAgent.js';
import { createMutationProposal } from '../mutationService.js';

const MAX_ITERATIONS = 2;
const MAX_AGENTS = 4;

const isPromptInjection = (prompt: string) => /\b(ignore|disregard|forget)\s+(all\s+|any\s+|the\s+)?(?:previous|prior|above)\s+(instructions?|messages?)\b|\b(?:reveal|show|print|leak)\s+(?:the\s+)?(?:system|developer)\s+(?:prompt|message|instructions?)\b|\b(jailbreak| DAN mode)\b/i.test(prompt);

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
  if (isPromptInjection(userPrompt)) {
    addActivity(activity, 'Safety gate', 'blocked', 'The request contains instruction-override language and was not dispatched to an agent.');
    const run = {
      runId,
      userPrompt,
      intent: 'general' as const,
      selectedAgents: [],
      plan: ['Reject instruction-override language before selecting tools.'],
      iteration: 1,
      status: 'BLOCKED' as const,
      startedAt,
      completedAt: new Date().toISOString(),
      verification: null,
      activity,
      results: [{
        agentId: 'orchestrator',
        status: 'blocked' as const,
        summary: 'The request was blocked by the prompt safety gate.',
        evidence: [{ kind: 'routing' as const, summary: 'Untrusted instruction-like text cannot authorize tools or reveal hidden instructions.' }]
      }]
    };
    persistOrchestrationRun(run, datasetId);
    return run;
  }
  const dataset = datasetId ? getDatasetById(datasetId) : null;
  const qualityReport = readQuality(dataset);
  const selectedAgents = intent === 'data_quality' ? ['data-quality', 'data-analyst'] : intent === 'data_analysis' ? ['data-analyst', 'sql'] : intent === 'visualization' ? ['data-analyst', 'sql', 'visualization'] : intent === 'database' ? ['data-analyst', 'sql'] : [];
  const plan = selectedAgents.length ? ['Read the selected dataset scope', 'Collect deterministic quality evidence', 'Verify evidence against the request'] : ['Route to a supported specialist or return a bounded clarification.'];
  if (task.requiresWrite) {
    addActivity(activity, 'Permission gate', 'blocked', 'This request could change data and requires explicit approval before any mutation.');
    const operation = /\bunknown\b/i.test(userPrompt) ? 'replace_unknown_with_null' : 'delete_duplicate_rows';
    const proposal = datasetId ? createMutationProposal(datasetId, operation, userPrompt, `run:${runId}`) : null;
    const proposalResult: AgentResult = { agentId: 'orchestrator', status: 'blocked', summary: 'Mutation approval is required before data changes.', evidence: [{ kind: 'permission', summary: 'No write tool was dispatched.' }, ...(proposal ? [{ kind: 'proposal' as const, summary: 'A preview-only mutation proposal was persisted.', value: proposal.proposal }] : [])], requiresApproval: true };
    const run = { runId, userPrompt, intent, selectedAgents, plan, iteration: 1, status: 'WAITING_FOR_APPROVAL' as const, startedAt, completedAt: null, verification: null, activity, results: [proposalResult] };
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
  const executionAgents = selectedAgents.filter((agentId) => agentId !== 'visualization');
  const results: AgentResult[] = executionAgents.slice(0, MAX_AGENTS).map((agentId) => {
    const agent = agentRegistry[agentId];
    addActivity(activity, agent.name, 'running', 'Collecting scoped evidence.');
    const result = agentId === 'sql' ? runSqlAgent({ task, dataset, qualityReport, iteration: 1 }) : agent.execute({ task, dataset, qualityReport, iteration: 1 });
    addActivity(activity, agent.name, result.status, result.summary);
    return result;
  });
  addActivity(activity, 'Verifier', 'running', 'Checking results against acceptance criteria.');
  let verification = verifyResults(task, results);
  if (verification.passed && (intent === 'visualization' || (intent === 'data_analysis' && /\b(chart|visual|plot|graph)\b/i.test(userPrompt)))) {
    const sqlResult = results.find((result) => result.agentId === 'sql');
    if (sqlResult) {
      addActivity(activity, 'Visualization Agent', 'running', 'Building a chart from verified SQL output.');
      const chart = runVisualizationAgent(sqlResult, `${dataset?.name ?? 'Dataset'} analysis`);
      results.push(chart);
      addActivity(activity, 'Visualization Agent', chart.status, chart.summary);
      verification = verifyResults(task, results);
    }
  }
  addActivity(activity, 'Verifier', verification.passed ? 'success' : 'partial', verification.summary);
  const run = { runId, userPrompt, intent, selectedAgents: [...selectedAgents, 'verifier'], plan, iteration: 1, status: verification.passed ? 'COMPLETED' as const : 'BLOCKED' as const, startedAt, completedAt: new Date().toISOString(), verification, activity, results };
  persistOrchestrationRun(run, datasetId);
  return run;
};
