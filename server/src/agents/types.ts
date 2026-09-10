import type { Dataset } from '../types.js';
import type { QualityReport } from '../quality.js';

export type AgentIntent =
  | 'data_analysis'
  | 'data_quality'
  | 'data_cleaning'
  | 'visualization'
  | 'debugging'
  | 'testing'
  | 'security'
  | 'performance'
  | 'development'
  | 'database'
  | 'documentation'
  | 'general';

export type TaskPriority = 'low' | 'medium' | 'high' | 'critical';
export type TaskStatus = 'pending' | 'planning' | 'running' | 'verifying' | 'completed' | 'blocked' | 'failed';
export type RunStatus = 'PLANNING' | 'RUNNING' | 'WAITING_FOR_APPROVAL' | 'VERIFYING' | 'RETRYING' | 'COMPLETED' | 'BLOCKED' | 'FAILED';

export interface AgentTask {
  id: string;
  userRequest: string;
  intent: AgentIntent;
  priority: TaskPriority;
  datasetId?: string;
  requirements: string[];
  constraints: string[];
  acceptanceCriteria: string[];
  requiresWrite: boolean;
  status: TaskStatus;
}

export interface Evidence {
  kind: 'dataset' | 'quality' | 'routing' | 'verification' | 'permission' | 'sql' | 'sql_result' | 'chart' | 'proposal';
  summary: string;
  value?: unknown;
}

export interface AgentContext {
  task: AgentTask;
  dataset: Dataset | null;
  qualityReport: QualityReport | null;
  iteration: number;
}

export interface ChartSpec {
  type: 'bar' | 'line' | 'table';
  title: string;
  xKey: string;
  yKey: string;
  data: Array<Record<string, unknown>>;
}

export interface AgentResult {
  agentId: string;
  status: 'success' | 'partial' | 'failed' | 'blocked';
  summary: string;
  evidence: Evidence[];
  recommendations?: string[];
  requiresApproval?: boolean;
  errors?: string[];
}

export interface AgentDefinition {
  id: string;
  name: string;
  capabilities: string[];
  allowedTools: string[];
  requiresApproval: boolean;
  supportedIntents: AgentIntent[];
  execute(_context: AgentContext): AgentResult;
}

export interface ActivityLog {
  timestamp: string;
  actor: string;
  status: 'running' | 'success' | 'partial' | 'blocked' | 'failed';
  message: string;
}

export interface OrchestrationRun {
  runId: string;
  userPrompt: string;
  intent: AgentIntent;
  selectedAgents: string[];
  plan: string[];
  iteration: number;
  status: RunStatus;
  startedAt: string;
  completedAt: string | null;
  verification: VerificationResult | null;
  activity: ActivityLog[];
}

export interface VerificationResult {
  passed: boolean;
  summary: string;
  criteria: Array<{ criterion: string; passed: boolean; evidence: string }>;
}
