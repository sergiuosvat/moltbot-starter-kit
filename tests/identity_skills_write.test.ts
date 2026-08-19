/* eslint-disable @typescript-eslint/no-explicit-any */
const mockCreateTransactionForExecute = jest.fn();
const mockFactory = {
  createTransactionForExecute: mockCreateTransactionForExecute,
};
const mockQuery = jest.fn();
const mockController = {query: mockQuery};

const mockLoadSignerWithAddress = jest.fn();
const mockCreateProvider = jest.fn();
const mockCreateEntrypoint = jest.fn(() => ({
  createSmartContractTransactionsFactory: jest.fn(() => mockFactory),
  createSmartContractController: jest.fn(() => mockController),
}));
const mockCreatePatchedAbi = jest.fn(() => ({}));
const mockDiscoverRelayerAddress = jest.fn();
const mockSignAndSend = jest.fn();
const mockSignAndRelay = jest.fn();
const mockSolveRelayerChallenge = jest.fn();
const mockWithRelayer = jest.fn();

jest.mock('../src/chain', () => ({
  loadSignerWithAddress: (...args: unknown[]) =>
    mockLoadSignerWithAddress(...args),
  createProvider: (...args: unknown[]) => mockCreateProvider(...args),
  createEntrypoint: () => mockCreateEntrypoint(),
  createPatchedAbi: () => mockCreatePatchedAbi(),
  discoverRelayerAddress: (...args: unknown[]) =>
    mockDiscoverRelayerAddress(...args),
  signAndSend: (...args: unknown[]) => mockSignAndSend(...args),
  signAndRelay: (...args: unknown[]) => mockSignAndRelay(...args),
  solveRelayerChallenge: (...args: unknown[]) =>
    mockSolveRelayerChallenge(...args),
  withRelayer: (...args: unknown[]) => mockWithRelayer(...args),
}));

import {
  registerAgent,
  setMetadata,
  setServiceConfigs,
  getAgent,
} from '../src/skills/identity_skills';

describe('identity_skills write paths', () => {
  const tx = {id: 'tx'} as any;
  const senderAddress = {
    toBech32: () => 'erd1sender',
    getPublicKey: () => Buffer.from('pub'),
  } as any;
  const signer = {sign: jest.fn()} as any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockLoadSignerWithAddress.mockResolvedValue({signer, senderAddress});
    mockCreateProvider.mockReturnValue({provider: true});
    mockCreateTransactionForExecute.mockResolvedValue(tx);
    mockSignAndSend.mockResolvedValue('tx-hash');
    mockSignAndRelay.mockResolvedValue('relay-tx-hash');
    mockSolveRelayerChallenge.mockResolvedValue('42');
    mockDiscoverRelayerAddress.mockResolvedValue(
      'erd1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq6gq4hu',
    );
    mockQuery.mockResolvedValue([null]);
  });

  it('registerAgent creates tx and broadcasts', async () => {
    const hash = await registerAgent({name: 'bot', uri: 'https://bot.io'});

    expect(hash).toBe('tx-hash');
    expect(mockCreateTransactionForExecute).toHaveBeenCalledWith(
      senderAddress,
      expect.objectContaining({function: 'register_agent'}),
    );
    expect(mockSignAndSend).toHaveBeenCalled();
  });

  it('registerAgent relays via HTTP when useRelayer is enabled', async () => {
    const hash = await registerAgent({
      name: 'bot',
      uri: 'https://bot.io',
      useRelayer: true,
    });

    expect(hash).toBe('relay-tx-hash');
    expect(mockDiscoverRelayerAddress).toHaveBeenCalledWith(senderAddress);
    expect(mockWithRelayer).toHaveBeenCalledWith(tx, expect.anything());
    expect(mockSolveRelayerChallenge).toHaveBeenCalled();
    expect(mockSignAndRelay).toHaveBeenCalledWith(
      tx,
      signer,
      senderAddress,
      expect.anything(),
      expect.any(String),
      {challengeNonce: '42'},
    );
    expect(mockSignAndSend).not.toHaveBeenCalled();
  });

  it('registerAgent passes metadata and services when provided', async () => {
    await registerAgent({
      name: 'bot',
      uri: 'https://bot.io',
      metadata: [{key: 'version', value: '1.0.0'}],
      services: [
        {
          service_id: 1,
          price: '1000000000000000000',
          token: 'EGLD',
          nonce: 0,
        },
      ],
    });

    const callArgs = mockCreateTransactionForExecute.mock.calls[0][1];
    expect(callArgs.arguments).toHaveLength(5);
  });

  it('setMetadata creates set_metadata transaction with entries', async () => {
    const hash = await setMetadata({
      agentNonce: 5,
      entries: [{key: 'k', value: 'v'}],
    });

    expect(hash).toBe('tx-hash');
    const callArgs = mockCreateTransactionForExecute.mock.calls[0][1];
    expect(callArgs.function).toBe('set_metadata');
    expect(callArgs.arguments).toHaveLength(2);
  });

  it('setServiceConfigs creates set_service_configs transaction', async () => {
    const hash = await setServiceConfigs({
      agentNonce: 5,
      services: [
        {
          service_id: 1,
          price: '1000000000000000000',
          token: 'EGLD',
          nonce: 0,
        },
      ],
    });

    expect(hash).toBe('tx-hash');
    expect(mockCreateTransactionForExecute).toHaveBeenCalledWith(
      senderAddress,
      expect.objectContaining({function: 'set_service_configs'}),
    );
  });

  it('getAgent returns null when query returns empty', async () => {
    mockQuery.mockResolvedValueOnce([null]);
    const result = await getAgent(123);
    expect(result).toBeNull();
  });
});
