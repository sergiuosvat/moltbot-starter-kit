import {promises as fs} from 'fs';
import * as path from 'path';

import type {MetadataEntryInput, ServiceConfigInput} from './identity_encoding';

export interface AgentConfigFile {
  agentName: string;
  /** Live HTTP base for on-chain agent.uri (preferred over manifestUri). */
  agentUri?: string;
  /** Off-chain metadata (often IPFS) — not a pingable discovery URL. */
  manifestUri?: string;
  nonce?: number;
  metadata: MetadataEntryInput[];
  services: ServiceConfigInput[];
}

const DEFAULT_CONFIG: AgentConfigFile = {
  agentName: 'Moltbot',
  manifestUri: '',
  metadata: [],
  services: [],
};

export async function loadAgentConfig(
  configPath?: string,
): Promise<AgentConfigFile> {
  const resolved = path.resolve(configPath ?? 'agent.config.json');
  try {
    const raw = JSON.parse(
      await fs.readFile(resolved, 'utf8'),
    ) as AgentConfigFile;
    return {
      agentName: raw.agentName ?? DEFAULT_CONFIG.agentName,
      agentUri: raw.agentUri,
      manifestUri: raw.manifestUri ?? '',
      nonce: raw.nonce,
      metadata: raw.metadata ?? [],
      services: raw.services ?? [],
    };
  } catch {
    return {...DEFAULT_CONFIG};
  }
}
