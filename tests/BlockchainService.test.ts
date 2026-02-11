import {BlockchainService} from '../src/BlockchainService';
import {Address} from '@multiversx/sdk-core';

jest.mock('../src/utils/entrypoint', () => ({
  createEntrypoint: jest.fn().mockImplementation(() => ({
    createSmartContractController: jest.fn().mockImplementation(() => ({
      query: jest.fn(),
    })),
  })),
}));

jest.mock('../src/utils/abi', () => ({
  createPatchedAbi: jest.fn().mockReturnValue({}),
}));

describe('BlockchainService', () => {
  let service: BlockchainService;
  let mockController: {query: jest.Mock};

  beforeEach(() => {
    service = new BlockchainService();
    mockController = (
      service as unknown as {
        identityController: {query: jest.Mock};
      }
    ).identityController;
  });

  it('should fetch agent details using ABI', async () => {
    const mockDetails = {
      name: 'Test Agent',
      uri: 'ipfs://test',
      public_key: 'pk',
      owner: Address.newFromBech32(
        'erd1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq6gq4hu',
      ),
      metadata: [],
    };
    mockController.query.mockResolvedValue([mockDetails]);

    const details = await service.getAgentDetails(1);

    expect(details).toEqual(mockDetails);
    expect(mockController.query).toHaveBeenCalledWith(
      expect.objectContaining({
        function: 'get_agent',
      }),
    );
  });

  it('should fetch agent service price using ABI', async () => {
    const mockPrice = 1000000000000000000n;
    mockController.query.mockResolvedValue([mockPrice]);

    const price = await service.getAgentServicePrice(1, 'chat');

    expect(price).toEqual(mockPrice);
    expect(mockController.query).toHaveBeenCalledWith(
      expect.objectContaining({
        function: 'get_agent_service_price',
      }),
    );
  });
});
