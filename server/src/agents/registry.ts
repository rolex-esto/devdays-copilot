import { dataAnalystAgent } from './analystAgent.js';
import { dataQualityAgent } from './qualityAgent.js';
import { visualizationAgent } from './visualizationAgent.js';
import { runSqlAgent } from './sqlAgent.js';
import type { AgentDefinition } from './types.js';
import { verifyResults } from './verifier.js';

export const agentRegistry: Record<string, AgentDefinition> = {
  'data-analyst': dataAnalystAgent,
  'data-quality': dataQualityAgent,
  sql: { id: 'sql', name: 'SQL Agent', capabilities: ['execute validated read-only SQL'], allowedTools: ['dataset.read'], requiresApproval: false, supportedIntents: ['data_analysis', 'visualization', 'database'], execute: (context) => runSqlAgent(context) },
  visualization: visualizationAgent
};

export const verifierAgent = { id: 'verifier', name: 'Verifier Agent', capabilities: ['check evidence against acceptance criteria'], allowedTools: ['result.read'], requiresApproval: false };
export { verifyResults };
