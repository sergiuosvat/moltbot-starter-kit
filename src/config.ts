import * as dotenv from 'dotenv';
import * as path from 'path';

// Load .env from root
dotenv.config({path: path.resolve(__dirname, '../.env')});

/** Zero/SC placeholder — not a real deployed registry. */
export const PLACEHOLDER_ADDRESS =
  'erd1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq6gq4hu';

function requiredAddress(
  envValue: string | undefined,
  fallbackForTests: string,
): string {
  if (envValue && envValue.trim()) return envValue.trim();
  // Tests may run without .env; keep a placeholder only under NODE_ENV=test.
  if (process.env.NODE_ENV === 'test') return fallbackForTests;
  return '';
}

export const CONFIG = {
  // Network
  CHAIN_ID: process.env.MULTIVERSX_CHAIN_ID || 'D',
  API_URL:
    process.env.MULTIVERSX_API_URL || 'https://devnet-api.multiversx.com',
  EXPLORER_URL:
    process.env.MULTIVERSX_EXPLORER_URL ||
    'https://devnet-explorer.multiversx.com',

  // Addresses
  ADDRESSES: {
    IDENTITY_REGISTRY: requiredAddress(
      process.env.IDENTITY_REGISTRY_ADDRESS,
      PLACEHOLDER_ADDRESS,
    ),
    VALIDATION_REGISTRY: requiredAddress(
      process.env.VALIDATION_REGISTRY_ADDRESS,
      PLACEHOLDER_ADDRESS,
    ),
    REPUTATION_REGISTRY: requiredAddress(
      process.env.REPUTATION_REGISTRY_ADDRESS,
      PLACEHOLDER_ADDRESS,
    ),
    ESCROW_CONTRACT: requiredAddress(
      process.env.ESCROW_CONTRACT_ADDRESS,
      PLACEHOLDER_ADDRESS,
    ),
  },

  // External Services
  PROVIDERS: {
    MCP_ENABLED: process.env.MCP_ENABLED === 'true',
    MCP_URL: process.env.MULTIVERSX_MCP_URL || 'http://localhost:3000',
    FACILITATOR_URL:
      process.env.X402_FACILITATOR_URL || 'http://localhost:4000',
    RELAYER_URL: process.env.MULTIVERSX_RELAYER_URL || 'http://localhost:3001',
  },

  /**
   * When MCP is enabled: reject jobs whose counterparty reputation is below this
   * score (0–100). Set 0 to disable reputation gating.
   */
  MCP_MIN_REPUTATION: parseInt(process.env.MCP_MIN_REPUTATION || '0', 10),

  /**
   * Comma-separated MCP tool names allowed for meta.mcpTool processing.
   * Empty = reject all mcpTool jobs (hash/processor path still works).
   * Use * to allow any tool name.
   */
  MCP_ALLOWED_TOOLS: (process.env.MCP_ALLOWED_TOOLS || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean),

  /** Persistent job ledger path (idempotency across restarts). SQLite DB. */
  JOB_STORE_PATH:
    process.env.JOB_STORE_PATH ||
    path.resolve(process.cwd(), '.moltbot', 'jobs.db'),

  /** Reclaim jobs stuck in "processing" after this many ms. */
  JOB_STALE_MS: parseInt(
    process.env.JOB_STALE_MS || String(10 * 60 * 1000),
    10,
  ),

  /**
   * After successful proof: call escrow.release(jobId) when escrow is configured
   * and payment.meta.releaseEscrow is not false.
   */
  ESCROW_AUTO_RELEASE: process.env.ESCROW_AUTO_RELEASE === 'true',

  // Transaction Settings
  GAS_LIMITS: {
    REGISTER: 25_000_000n,
    UPDATE: 10_000_000n,
    SUBMIT_PROOF: 10_000_000n,
    REGISTER_AGENT: BigInt(process.env.GAS_LIMIT_REGISTER_AGENT || '6000000'),
  },

  // Relayer Settings
  RELAYER_GAS_OVERHEAD: BigInt(process.env.RELAYER_GAS_OVERHEAD || '50000'),

  // Agent Identity (used during auto-registration)
  AGENT: {
    NAME: process.env.AGENT_NAME || 'moltbot',
    URI: process.env.AGENT_URI || 'https://moltbot.io',
  },

  // Security
  SECURITY: {
    ALLOWED_DOMAINS: (
      process.env.ALLOWED_DOMAINS || 'example.com,jsonplaceholder.typicode.com'
    )
      .split(',')
      .map(d => d.trim()),
  },

  // Timeouts
  REQUEST_TIMEOUT: parseInt(process.env.REQUEST_TIMEOUT || '10000', 10),

  // Retry Strategy
  RETRY: {
    MAX_ATTEMPTS: parseInt(process.env.RETRY_MAX_ATTEMPTS || '5', 10),
    SUBMISSION_DELAY: parseInt(
      process.env.RETRY_SUBMISSION_DELAY || '10000',
      10,
    ),
    CHECK_INTERVAL: parseInt(process.env.RETRY_CHECK_INTERVAL || '2000', 10),
  },

  // Employer Settings (facilitator employer-flow demo)
  EMPLOYER: {
    PEM_PATH: process.env.EMPLOYER_PEM_PATH || '',
    ADDRESS: process.env.EMPLOYER_ADDRESS || '',
  },

  /** Local-dev escape hatch: accept facilitator events without /payments lookup. */
  ALLOW_UNVERIFIED_PAYMENTS: process.env.ALLOW_UNVERIFIED_PAYMENTS === 'true',
};

function isLocalhostUrl(url: string): boolean {
  try {
    const {hostname} = new URL(url);
    return (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '[::1]' ||
      hostname === '::1'
    );
  } catch {
    return false;
  }
}

/** True when NODE_ENV=production or MOLTBOT_STRICT_CONFIG=true. */
export function isStrictConfigMode(): boolean {
  return (
    process.env.NODE_ENV === 'production' ||
    process.env.MOLTBOT_STRICT_CONFIG === 'true'
  );
}

/**
 * Fails fast when required on-chain addresses are missing or still placeholders.
 * In strict/production mode, also rejects localhost service URLs and unsafe flags.
 * Call from the agent runtime entrypoint (not from unit tests).
 */
export function assertRequiredConfig(): void {
  const required: Array<[string, string]> = [
    ['IDENTITY_REGISTRY_ADDRESS', CONFIG.ADDRESSES.IDENTITY_REGISTRY],
    ['VALIDATION_REGISTRY_ADDRESS', CONFIG.ADDRESSES.VALIDATION_REGISTRY],
  ];

  const missing = required.filter(
    ([, value]) => !value || value === PLACEHOLDER_ADDRESS,
  );

  if (missing.length > 0) {
    const names = missing.map(([name]) => name).join(', ');
    throw new Error(
      `Missing required contract addresses: ${names}. Copy .env.example → .env and set real registry addresses.`,
    );
  }

  if (!isStrictConfigMode()) return;

  const errors: string[] = [];

  if (CONFIG.ALLOW_UNVERIFIED_PAYMENTS) {
    errors.push('ALLOW_UNVERIFIED_PAYMENTS must be false in strict mode');
  }

  const urlChecks: Array<[string, string]> = [
    ['X402_FACILITATOR_URL', CONFIG.PROVIDERS.FACILITATOR_URL],
    ['MULTIVERSX_RELAYER_URL', CONFIG.PROVIDERS.RELAYER_URL],
  ];
  if (CONFIG.PROVIDERS.MCP_ENABLED) {
    urlChecks.push(['MULTIVERSX_MCP_URL', CONFIG.PROVIDERS.MCP_URL]);
  }
  for (const [name, url] of urlChecks) {
    if (isLocalhostUrl(url)) {
      errors.push(
        `${name} must not point at localhost in strict mode (${url})`,
      );
    }
  }

  if (CONFIG.ESCROW_AUTO_RELEASE) {
    if (
      !CONFIG.ADDRESSES.ESCROW_CONTRACT ||
      CONFIG.ADDRESSES.ESCROW_CONTRACT === PLACEHOLDER_ADDRESS
    ) {
      errors.push(
        'ESCROW_AUTO_RELEASE=true requires a real ESCROW_CONTRACT_ADDRESS',
      );
    }
  }

  if (CONFIG.MCP_MIN_REPUTATION > 0) {
    if (
      !CONFIG.ADDRESSES.REPUTATION_REGISTRY ||
      CONFIG.ADDRESSES.REPUTATION_REGISTRY === PLACEHOLDER_ADDRESS
    ) {
      errors.push(
        'MCP_MIN_REPUTATION>0 requires a real REPUTATION_REGISTRY_ADDRESS',
      );
    }
  }

  if (errors.length > 0) {
    throw new Error(
      `Strict config checks failed:\n- ${errors.join('\n- ')}\nSet MOLTBOT_STRICT_CONFIG=false only for local dev.`,
    );
  }
}
