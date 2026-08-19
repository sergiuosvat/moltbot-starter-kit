import * as dotenv from 'dotenv';
import {promises as fs} from 'fs';
import * as path from 'path';
import {Facilitator} from './facilitator';
import {McpBridge} from './mcp_bridge';
import {Validator} from './validator';
import {JobProcessor} from './processor';
import {JobHandler} from './job_handler';
import {CONFIG, assertRequiredConfig} from './config';
import {Logger} from './utils/logger';
import {AgentDiscovery} from './discovery';
import {loadSignerWithAddress, discoverRelayerAddress} from './chain';
import {getBalance} from './skills/discovery_skills';

export {
  Facilitator,
  McpBridge,
  Validator,
  JobProcessor,
  JobHandler,
  CONFIG,
  Logger,
  AgentDiscovery,
};

const logger = new Logger('Main');

dotenv.config();

async function main() {
  logger.info('Starting Moltbot...');
  assertRequiredConfig();

  try {
    const bal = await getBalance();
    const egld = BigInt(bal.egld);
    const LOW_BALANCE_THRESHOLD = 100_000_000_000_000_000n; // 0.1 EGLD
    if (egld < LOW_BALANCE_THRESHOLD) {
      logger.warn(
        `LOW BALANCE WARNING: ${bal.address} has only ${egld} attoEGLD. ` +
          'Top up to avoid failed transactions.',
      );
    } else {
      logger.info(
        `Balance OK: ${egld / 1_000_000_000_000_000_000n} EGLD on ${bal.address}`,
      );
    }
  } catch (err) {
    logger.warn(`Balance check failed: ${(err as Error).message}`);
  }

  try {
    const configPath = path.resolve('agent.config.json');
    const config = JSON.parse(await fs.readFile(configPath, 'utf8'));
    logger.info(`Loaded Agent: ${config.agentName} (ID: ${config.nonce})`);
  } catch {
    logger.warn('agent.config.json not found. See agent.config.example.json.');
  }

  // MCP is strictly opt-in — only construct when MCP_ENABLED=true.
  let mcpBridge: McpBridge | null = null;
  if (CONFIG.PROVIDERS.MCP_ENABLED) {
    mcpBridge = new McpBridge();
    const mcpReady = await mcpBridge.verifyRequiredTools();
    if (!mcpReady) {
      await mcpBridge.close();
      throw new Error(
        'MCP_ENABLED=true but required MCP tools are missing/unreachable. Fix MULTIVERSX_MCP_URL / tool availability, or set MCP_ENABLED=false.',
      );
    }
    logger.info('MCP bridge ready (opt-in).');
  } else {
    logger.info('MCP bridge disabled (MCP_ENABLED=false).');
  }

  const validator = new Validator();
  const facilitator = new Facilitator();
  const processor = new JobProcessor();
  const handler = new JobHandler(validator, processor, {
    mcp: mcpBridge,
    facilitator,
  });

  try {
    const {senderAddress} = await loadSignerWithAddress();
    logger.info(
      `Discovering relayer for ${senderAddress.toBech32()} from ${CONFIG.PROVIDERS.RELAYER_URL}...`,
    );
    const relayerAddress = await discoverRelayerAddress(senderAddress);

    if (relayerAddress) {
      logger.info(`Using Relayer: ${relayerAddress}`);
      validator.setRelayerConfig(CONFIG.PROVIDERS.RELAYER_URL, relayerAddress);
    } else {
      logger.warn(
        'No relayer address returned, falling back to direct transactions.',
      );
    }
  } catch (e) {
    logger.warn(
      `Failed to init relayer: ${(e as Error).message}. Using direct transactions.`,
    );
  }

  facilitator.onPayment(async payment => {
    logger.info(
      `[Job] Payment Received! Amount: ${payment.amount} ${payment.token}`,
    );

    try {
      const jobId = await facilitator.verifyPayment(payment);
      handler.enqueue(jobId, payment);
    } catch (error) {
      logger.error(`Rejecting payment: ${(error as Error).message}`, error);
    }
  });

  await facilitator.start();
  logger.info('Listening for x402 payments (poll)...');

  const shutdown = async () => {
    logger.info('Shutting down Moltbot...');
    await facilitator.stop();
    await handler.drain(30_000);
    handler.closeStore();
    if (mcpBridge) {
      await mcpBridge.close();
    }
    process.exit(0);
  };

  process.once('SIGINT', () => {
    void shutdown();
  });
  process.once('SIGTERM', () => {
    void shutdown();
  });
}

main().catch(err => logger.error('Fatal error in main loop', err));
