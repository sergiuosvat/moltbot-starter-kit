import {assertRequiredConfig, CONFIG, PLACEHOLDER_ADDRESS} from '../src/config';

describe('assertRequiredConfig strict mode', () => {
  const original = {
    strict: process.env.MOLTBOT_STRICT_CONFIG,
    nodeEnv: process.env.NODE_ENV,
    unverified: CONFIG.ALLOW_UNVERIFIED_PAYMENTS,
    facilitator: CONFIG.PROVIDERS.FACILITATOR_URL,
    relayer: CONFIG.PROVIDERS.RELAYER_URL,
    mcpEnabled: CONFIG.PROVIDERS.MCP_ENABLED,
    mcpUrl: CONFIG.PROVIDERS.MCP_URL,
    escrowAuto: CONFIG.ESCROW_AUTO_RELEASE,
    escrow: CONFIG.ADDRESSES.ESCROW_CONTRACT,
    identity: CONFIG.ADDRESSES.IDENTITY_REGISTRY,
    validation: CONFIG.ADDRESSES.VALIDATION_REGISTRY,
    reputation: CONFIG.ADDRESSES.REPUTATION_REGISTRY,
    minRep: CONFIG.MCP_MIN_REPUTATION,
  };

  afterEach(() => {
    if (original.strict === undefined) delete process.env.MOLTBOT_STRICT_CONFIG;
    else process.env.MOLTBOT_STRICT_CONFIG = original.strict;
    if (original.nodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = original.nodeEnv;

    CONFIG.ALLOW_UNVERIFIED_PAYMENTS = original.unverified;
    CONFIG.PROVIDERS.FACILITATOR_URL = original.facilitator;
    CONFIG.PROVIDERS.RELAYER_URL = original.relayer;
    CONFIG.PROVIDERS.MCP_ENABLED = original.mcpEnabled;
    CONFIG.PROVIDERS.MCP_URL = original.mcpUrl;
    CONFIG.ESCROW_AUTO_RELEASE = original.escrowAuto;
    CONFIG.ADDRESSES.ESCROW_CONTRACT = original.escrow;
    CONFIG.ADDRESSES.IDENTITY_REGISTRY = original.identity;
    CONFIG.ADDRESSES.VALIDATION_REGISTRY = original.validation;
    CONFIG.ADDRESSES.REPUTATION_REGISTRY = original.reputation;
    CONFIG.MCP_MIN_REPUTATION = original.minRep;
  });

  it('does not apply localhost checks outside strict mode', () => {
    delete process.env.MOLTBOT_STRICT_CONFIG;
    process.env.NODE_ENV = 'test';
    CONFIG.ADDRESSES.IDENTITY_REGISTRY =
      'erd1qqqqqqqqqqqqqpgqxyum8w6cn6xkz9q5rsy4mfcsw3njpd6cd8ssr4quyy';
    CONFIG.ADDRESSES.VALIDATION_REGISTRY =
      'erd1qqqqqqqqqqqqqpgqvax6z79cvyz9gkfwg57hqume352p7s7rd8ss4g3t43';
    CONFIG.PROVIDERS.FACILITATOR_URL = 'http://localhost:4000';
    CONFIG.ALLOW_UNVERIFIED_PAYMENTS = true;
    expect(() => assertRequiredConfig()).not.toThrow();
  });

  it('rejects localhost facilitator in strict mode', () => {
    process.env.MOLTBOT_STRICT_CONFIG = 'true';
    process.env.NODE_ENV = 'test';
    CONFIG.ADDRESSES.IDENTITY_REGISTRY =
      'erd1qqqqqqqqqqqqqpgqxyum8w6cn6xkz9q5rsy4mfcsw3njpd6cd8ssr4quyy';
    CONFIG.ADDRESSES.VALIDATION_REGISTRY =
      'erd1qqqqqqqqqqqqqpgqvax6z79cvyz9gkfwg57hqume352p7s7rd8ss4g3t43';
    CONFIG.PROVIDERS.FACILITATOR_URL = 'http://localhost:4000';
    CONFIG.PROVIDERS.RELAYER_URL = 'https://relayer.example.com';
    CONFIG.ALLOW_UNVERIFIED_PAYMENTS = false;

    expect(() => assertRequiredConfig()).toThrow(/localhost/);
  });

  it('requires escrow address when ESCROW_AUTO_RELEASE in strict mode', () => {
    process.env.MOLTBOT_STRICT_CONFIG = 'true';
    CONFIG.ADDRESSES.IDENTITY_REGISTRY =
      'erd1qqqqqqqqqqqqqpgqxyum8w6cn6xkz9q5rsy4mfcsw3njpd6cd8ssr4quyy';
    CONFIG.ADDRESSES.VALIDATION_REGISTRY =
      'erd1qqqqqqqqqqqqqpgqvax6z79cvyz9gkfwg57hqume352p7s7rd8ss4g3t43';
    CONFIG.PROVIDERS.FACILITATOR_URL = 'https://facilitator.example.com';
    CONFIG.PROVIDERS.RELAYER_URL = 'https://relayer.example.com';
    CONFIG.ALLOW_UNVERIFIED_PAYMENTS = false;
    CONFIG.ESCROW_AUTO_RELEASE = true;
    CONFIG.ADDRESSES.ESCROW_CONTRACT = PLACEHOLDER_ADDRESS;

    expect(() => assertRequiredConfig()).toThrow(/ESCROW_CONTRACT/);
  });
});
