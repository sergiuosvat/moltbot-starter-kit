import {AgentDiscovery, type PaymentInfo} from '../src/discovery';
import * as chain from '../src/chain';
import {MoltbotMppSkill} from '../src/skills/mpp_skills';

jest.mock('axios');
jest.mock('../src/chain');
jest.mock('../src/skills/mpp_skills');

import axios from 'axios';

const mockedAxios = axios as jest.Mocked<typeof axios>;
const mockedLoadSigner = chain.loadSignerWithAddress as jest.Mock;
const MockedMppSkill = MoltbotMppSkill as jest.MockedClass<
  typeof MoltbotMppSkill
>;

const AGENT_ADDRESS =
  'erd1qqqqqqqqqqqqqpgqxyum8w6cn6xkz9q5rsy4mfcsw3njpd6cd8ssr4quyy';

describe('AgentDiscovery', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedLoadSigner.mockResolvedValue({
      signer: {getAddress: () => ({bech32: () => AGENT_ADDRESS})},
    });
    MockedMppSkill.mockImplementation(
      () =>
        ({
          attemptPayment: jest.fn().mockResolvedValue('0xrealtxhash'),
        }) as unknown as MoltbotMppSkill,
    );
  });

  describe('getPaymentInfo', () => {
    it('parses x-payment-info including recipient', async () => {
      mockedAxios.get.mockResolvedValueOnce({
        data: {
          info: {title: 'Test Agent'},
          paths: {
            '/mcp/tools': {
              post: {
                'x-payment-info': {
                  intent: 'session',
                  method: 'transfer',
                  amount: '1000000000000000000',
                  currency: 'EGLD',
                  recipient: AGENT_ADDRESS,
                },
              },
            },
          },
        },
      });

      const discovery = new AgentDiscovery();
      const info = await discovery.getPaymentInfo(
        'https://agent.example.com',
        '/mcp/tools',
      );

      expect(info).toEqual({
        intent: 'session',
        method: 'transfer',
        amount: '1000000000000000000',
        currency: 'EGLD',
        recipient: AGENT_ADDRESS,
      });
    });
  });

  describe('negotiateSession', () => {
    const paymentInfo: PaymentInfo = {
      intent: 'session',
      method: 'transfer',
      amount: '1000000000000000000',
      currency: 'EGLD',
      recipient: AGENT_ADDRESS,
    };

    it('broadcasts payment and returns tx hash', async () => {
      const discovery = new AgentDiscovery();
      const proof = await discovery.negotiateSession(
        'https://agent.example.com',
        paymentInfo,
        {durationSeconds: 120},
      );

      expect(proof).toBe('0xrealtxhash');
      const mppInstance = MockedMppSkill.mock.results[0].value as {
        attemptPayment: jest.Mock;
      };
      expect(mppInstance.attemptPayment).toHaveBeenCalledWith(
        `mpp://pay?recipient=${AGENT_ADDRESS}&amount=1000000000000000000&currency=EGLD&method=transfer&duration=120`,
      );
    });

    it('uses recipientAddress option when payment info omits recipient', async () => {
      const discovery = new AgentDiscovery();
      const proof = await discovery.negotiateSession(
        'https://agent.example.com',
        {...paymentInfo, recipient: undefined},
        {recipientAddress: AGENT_ADDRESS},
      );

      expect(proof).toBe('0xrealtxhash');
    });

    it('returns null when amount is missing', async () => {
      const discovery = new AgentDiscovery();
      const proof = await discovery.negotiateSession(
        'https://agent.example.com',
        {...paymentInfo, amount: null},
      );

      expect(proof).toBeNull();
      expect(MockedMppSkill).not.toHaveBeenCalled();
    });

    it('returns null when recipient cannot be resolved', async () => {
      const discovery = new AgentDiscovery();
      const proof = await discovery.negotiateSession(
        'https://agent.example.com',
        {...paymentInfo, recipient: undefined},
      );

      expect(proof).toBeNull();
      expect(MockedMppSkill).not.toHaveBeenCalled();
    });

    it('returns null when payment fails', async () => {
      MockedMppSkill.mockImplementation(
        () =>
          ({
            attemptPayment: jest
              .fn()
              .mockRejectedValue(new Error('policy violation')),
          }) as unknown as MoltbotMppSkill,
      );

      const discovery = new AgentDiscovery();
      const proof = await discovery.negotiateSession(
        'https://agent.example.com',
        paymentInfo,
      );

      expect(proof).toBeNull();
    });
  });
});
