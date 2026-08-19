import {CONFIG} from '../config';
import type {AgentConfigFile} from './agent_config';

/**
 * Live HTTP base for on-chain `agent.uri` (must be pingable).
 * Prefer `AGENT_URI` / `agentUri` over IPFS `manifestUri`.
 */
export function resolveAgentUri(config: AgentConfigFile): string {
  const candidates = [
    process.env.AGENT_URI,
    config.agentUri,
    CONFIG.AGENT.URI,
    config.manifestUri,
  ];
  for (const raw of candidates) {
    const value = (raw || '').trim();
    if (value) return value.replace(/\/$/, '');
  }
  return `https://agent.molt.bot/${config.agentName}`;
}
