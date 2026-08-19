import {
  authenticateA2A,
  findAgentByOwner,
  openA2ASession,
  pingAgent,
  pingAgentUri,
} from '../src/skills/a2a_skills';
import * as identity from '../src/skills/identity_skills';
import * as mpp from '../src/skills/mpp_automation';
import {AgentDiscovery} from '../src/discovery';

const mockQuery = jest.fn();
const AGENT_ADDRESS =
  'erd1qqqqqqqqqqqqqpgqxyum8w6cn6xkz9q5rsy4mfcsw3njpd6cd8ssr4quyy';

jest.mock('../src/skills/identity_skills');
jest.mock('../src/skills/mpp_automation');
jest.mock('../src/chain', () => ({
  createEntrypoint: () => ({
    createSmartContractController: () => ({query: mockQuery}),
  }),
  createPatchedAbi: jest.fn(() => ({})),
  loadSignerWithAddress: jest.fn().mockResolvedValue({
    signer: {
      getAddress: () => ({bech32: () => AGENT_ADDRESS}),
      sign: jest.fn().mockResolvedValue(Buffer.from('sig')),
    },
  }),
}));
jest.mock('../src/skills/mpp_skills', () => ({
  MoltbotMppSkill: jest.fn().mockImplementation(() => ({
    attemptPayment: jest.fn().mockResolvedValue('0xpayment'),
  })),
}));

describe('A2A Skills', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn() as jest.Mock;
  });

  it('should ping an agent correctly if registered', async () => {
    (identity.getAgent as jest.Mock).mockResolvedValue({
      uri: 'https://agent.example.com',
    });
    (global.fetch as jest.Mock).mockResolvedValue({ok: true});

    const isUp = await pingAgent(42);
    expect(isUp).toBe(true);
    expect(global.fetch).toHaveBeenCalledWith(
      'https://agent.example.com/ping',
      expect.any(Object),
    );
  });

  it('should fall back to /health when /ping fails', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({ok: false})
      .mockResolvedValueOnce({ok: true});

    const isUp = await pingAgentUri('https://agent.example.com');
    expect(isUp).toBe(true);
    expect(global.fetch).toHaveBeenCalledWith(
      'https://agent.example.com/health',
      expect.any(Object),
    );
  });

  it('should fail ping if agent is not registered', async () => {
    (identity.getAgent as jest.Mock).mockResolvedValue(null);
    const isUp = await pingAgent(42);
    expect(isUp).toBe(false);
  });

  it('authenticates via nonce challenge-response', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({nonce: 'nonce-123'}),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({token: 'bearer-token'}),
      });

    const token = await authenticateA2A('https://agent.example.com');
    expect(token).toBe('bearer-token');
    expect(global.fetch).toHaveBeenNthCalledWith(
      1,
      'https://agent.example.com/auth/nonce',
      expect.objectContaining({method: 'POST'}),
    );
    expect(global.fetch).toHaveBeenNthCalledWith(
      2,
      'https://agent.example.com/auth/verify',
      expect.objectContaining({method: 'POST'}),
    );
  });

  it('returns null for invalid owner address in findAgentByOwner', async () => {
    const match = await findAgentByOwner('not-a-bech32');
    expect(match).toBeNull();
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('should open A2A session via OpenAPI negotiation when available', async () => {
    mockQuery.mockResolvedValueOnce([[1, {toBech32: () => AGENT_ADDRESS}]]);
    (identity.getAgent as jest.Mock).mockResolvedValue({
      uri: 'https://agent.example.com',
    });
    jest.spyOn(AgentDiscovery.prototype, 'getPaymentInfo').mockResolvedValue({
      intent: 'session',
      method: 'transfer',
      amount: '1000000000000000000',
      currency: 'EGLD',
    });
    jest
      .spyOn(AgentDiscovery.prototype, 'negotiateSession')
      .mockResolvedValue('0xsessionproof');
    (global.fetch as jest.Mock).mockResolvedValue({ok: true});

    const result = await openA2ASession(AGENT_ADDRESS, 'EGLD', 120);

    expect(result.success).toBe(true);
    expect(result.channelId).toBe('0xsessionproof');
    expect(AgentDiscovery.prototype.negotiateSession).toHaveBeenCalledWith(
      'https://agent.example.com',
      expect.objectContaining({intent: 'session'}),
      expect.objectContaining({
        recipientAddress: AGENT_ADDRESS,
        durationSeconds: 120,
      }),
    );
    expect(mpp.fundSessionFromDiscovery).not.toHaveBeenCalled();
  });

  it('should open A2A session by finding and funding an MPP session', async () => {
    mockQuery.mockResolvedValueOnce([[1, {toBech32: () => AGENT_ADDRESS}]]);
    (identity.getAgent as jest.Mock).mockResolvedValue({
      uri: 'https://agent.example.com',
    });
    jest
      .spyOn(AgentDiscovery.prototype, 'getPaymentInfo')
      .mockResolvedValue(null);
    (global.fetch as jest.Mock).mockResolvedValue({ok: true});
    (mpp.fundSessionFromDiscovery as jest.Mock).mockResolvedValue(
      '0xchannelfound',
    );

    const result = await openA2ASession(AGENT_ADDRESS, 'USDC-123456', 50);

    expect(result.success).toBe(true);
    expect(result.channelId).toBe('0xchannelfound');
    expect(result.agentUri).toBe('https://agent.example.com');
    expect(mpp.fundSessionFromDiscovery).toHaveBeenCalled();
  });
});
