import { dataAnalystAgent } from './analystAgent.js';
import { dataQualityAgent } from './qualityAgent.js';
import type { AgentDefinition } from './types.js';
import { verifyResults } from './verifier.js';

export const agentRegistry: Record<string, AgentDefinition> = {
  'data-analyst': dataAnalystAgent,
  'data-quality': dataQualityAgent
};

export const verifierAgent = { id: 'verifier', name: 'Verifier Agent', capabilities: ['check evidence against acceptance criteria'], allowedTools: ['result.read'], requiresApproval: false };
export { verifyResults };
