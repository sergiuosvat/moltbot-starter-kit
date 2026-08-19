/**
 * Register agent on the Identity Registry via registerAgent skill.
 *
 * Usage: npx ts-node scripts/register.ts
 */
import {promises as fs} from 'fs';
import * as dotenv from 'dotenv';
import * as path from 'path';
import {CONFIG} from '../src/config';
import {getBalance} from '../src/skills/discovery_skills';
import {registerAgent} from '../src/skills/identity_skills';
import {loadAgentConfig} from '../src/utils/agent_config';
import {resolveAgentUri} from '../src/utils/agent_uri';

dotenv.config();

async function main() {
  console.log('🚀 Starting Agent Registration...');

  const configPath = path.resolve('agent.config.json');
  try {
    await fs.access(configPath);
  } catch {
    console.warn(
      'agent.config.json not found, using defaults. See agent.config.example.json.',
    );
  }

  const config = await loadAgentConfig();
  const agentUri = resolveAgentUri(config);

  if (
    config.manifestUri &&
    agentUri === config.manifestUri.replace(/\/$/, '')
  ) {
    console.warn(
      '⚠️  On-chain URI is manifestUri (often IPFS). Set AGENT_URI to your live template/public URL.',
    );
  }

  console.log(`Registering Agent: ${config.agentName}...`);
  console.log(`Name: ${config.agentName}`);
  console.log(`URI: ${agentUri}`);
  if (config.metadata.length > 0) {
    console.log(`Metadata: ${config.metadata.length} entries`);
  }
  if (config.services.length > 0) {
    console.log(`Services: ${config.services.length}`);
  }

  const balance = await getBalance();
  const useRelayer = BigInt(balance.egld) === 0n || !!process.env.FORCE_RELAYER;

  if (useRelayer) {
    console.log('Empty wallet (or FORCE_RELAYER). Using Relayer fallback...');
  } else {
    console.log('Wallet funded. Broadcasting locally...');
  }

  const txHash = await registerAgent({
    name: config.agentName,
    uri: agentUri,
    metadata: config.metadata,
    services: config.services,
    useRelayer,
  });

  console.log(`✅ Transaction Sent: ${txHash}`);
  console.log(`Check Explorer: ${CONFIG.EXPLORER_URL}/transactions/${txHash}`);
}

main().catch(err => {
  console.error('❌ Registration failed:', (err as Error).message);
  process.exit(1);
});
