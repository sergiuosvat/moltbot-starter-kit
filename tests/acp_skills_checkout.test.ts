import axios from 'axios';
import {
  browseAcpProducts,
  checkoutAcpProduct,
  createAcpCheckoutSession,
  negotiateAcpJob,
} from '../src/skills/acp_skills';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('ACP skills checkout paths', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns empty list when products payload is missing', async () => {
    mockedAxios.get.mockResolvedValueOnce({data: {}} as never);

    const products = await browseAcpProducts('https://agent.example.com');
    expect(products).toEqual([]);
  });

  it('returns checkout payload on sign_transaction success', async () => {
    mockedAxios.post.mockResolvedValueOnce({
      data: {
        status: 'requires_action',
        next_action: {
          type: 'sign_transaction',
          receiver: 'erd1receiver',
          value: '1000',
          data: '0xabc',
        },
      },
    } as never);

    const result = await checkoutAcpProduct(
      'https://agent.example.com',
      'prod-1',
      'erd1buyer',
    );

    expect(result).toEqual({
      status: 'requires_action',
      actionType: 'sign_transaction',
      receiver: 'erd1receiver',
      value: '1000',
      data: '0xabc',
      gasLimit: '',
    });
    expect(mockedAxios.post).toHaveBeenCalledWith(
      'https://agent.example.com/checkout',
      {
        product_id: 'prod-1',
        buyer_address: 'erd1buyer',
      },
      expect.objectContaining({timeout: expect.any(Number)}),
    );
  });

  it('returns dapp wallet action when adapter requires wallet handoff', async () => {
    mockedAxios.post.mockResolvedValueOnce({
      data: {
        status: 'requires_action',
        next_action: {
          type: 'use_dapp_wallet',
          dapp_url: 'https://wallet.multiversx.com/hook/sign',
        },
      },
    } as never);

    const result = await checkoutAcpProduct(
      'https://agent.example.com',
      'prod-1',
    );

    expect(result).toEqual({
      status: 'requires_action',
      actionType: 'use_dapp_wallet',
      receiver: '',
      value: '0',
      dappUrl: 'https://wallet.multiversx.com/hook/sign',
    });
  });

  it('throws AcpError when checkout fails', async () => {
    mockedAxios.post.mockRejectedValueOnce(new Error('down'));

    await expect(
      checkoutAcpProduct('https://agent.example.com', 'prod-1', 'erd1buyer'),
    ).rejects.toMatchObject({
      name: 'AcpError',
      code: 'NETWORK',
    });
  });

  it('creates checkout sessions via ACP endpoint', async () => {
    mockedAxios.post.mockResolvedValueOnce({
      data: {id: 'checkout_session_1', status: 'not_ready_for_payment'},
    } as never);

    const session = await createAcpCheckoutSession(
      'https://agent.example.com',
      {
        items: [{id: 'prod-1', quantity: 1}],
      },
    );

    expect((session as {id: string}).id).toBe('checkout_session_1');
    expect(mockedAxios.post).toHaveBeenCalledWith(
      'https://agent.example.com/checkout_sessions',
      {items: [{id: 'prod-1', quantity: 1}]},
      expect.any(Object),
    );
  });

  it('negotiates ACP jobs via /negotiate', async () => {
    mockedAxios.post.mockResolvedValueOnce({
      data: {
        status: 'accepted',
        proposal: {job_id: 'job-1', price: '100', token: 'EGLD'},
      },
    } as never);

    const result = await negotiateAcpJob('https://agent.example.com', {
      rfp_id: 'rfp-1',
      client_id: 'erd1client',
      budget_limit: '1000',
    });

    expect((result as {proposal: {job_id: string}}).proposal.job_id).toBe(
      'job-1',
    );
    expect(mockedAxios.post).toHaveBeenCalledWith(
      'https://agent.example.com/negotiate',
      expect.objectContaining({rfp_id: 'rfp-1'}),
      expect.any(Object),
    );
  });
});
