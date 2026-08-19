import {browseAcpProducts, mapCheckoutResponse} from '../src/skills/acp_skills';
import axios from 'axios';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('ACP Skills', () => {
  it('should browse products from an ACP well-known url', async () => {
    mockedAxios.get.mockResolvedValue({
      data: {
        products: [
          {
            product_id: 'nft-1',
            title: 'AI API Access',
            description: 'On-chain access',
            price: {amount: '100', currency: 'EGLD'},
          },
        ],
      },
    });

    const products = await browseAcpProducts('https://agent.example.com');
    expect(products.length).toBe(1);
    expect(products[0].name).toBe('AI API Access');
    expect(products[0].id).toBe('nft-1');
    expect(products[0].price).toBe('100');
    expect(mockedAxios.get).toHaveBeenCalledWith(
      'https://agent.example.com/.well-known/acp/products.json',
      expect.objectContaining({timeout: expect.any(Number)}),
    );
  });

  it('should normalize legacy product feed fields', async () => {
    mockedAxios.get.mockResolvedValue({
      data: {
        products: [
          {id: '1', name: 'Legacy Product', price: '50 USDC', description: ''},
        ],
      },
    });

    const products = await browseAcpProducts('https://agent.example.com');
    expect(products[0]).toMatchObject({
      id: '1',
      name: 'Legacy Product',
      price: '50',
      currency: 'USDC',
    });
  });

  it('should throw AcpError when browse fails', async () => {
    mockedAxios.get.mockRejectedValue(new Error('Network Error'));
    await expect(
      browseAcpProducts('https://agent.example.com'),
    ).rejects.toMatchObject({
      name: 'AcpError',
      code: 'NETWORK',
    });
  });

  it('maps sign_transaction checkout responses', () => {
    const payload = mapCheckoutResponse({
      status: 'requires_action',
      next_action: {
        type: 'sign_transaction',
        receiver: 'erd1receiver',
        value: '1000',
        data: '0xabc',
        chain_id: 'D',
        gasLimit: 60000000,
      },
    });

    expect(payload).toEqual({
      status: 'requires_action',
      actionType: 'sign_transaction',
      receiver: 'erd1receiver',
      value: '1000',
      data: '0xabc',
      chainId: 'D',
      gasLimit: '60000000',
    });
  });
});
