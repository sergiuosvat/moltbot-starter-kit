import axios, {type AxiosRequestConfig, isAxiosError} from 'axios';

import {CONFIG} from '../config';
import {Logger} from '../utils/logger';
import {assertAllowedAgentUrl} from '../utils/url_guard';
import {AcpError} from './acp_errors';

const logger = new Logger('ACPSkills');

export {AcpError, isAcpError} from './acp_errors';
export type {AcpErrorCode} from './acp_errors';

/** Normalized product view for agent skills (adapter + legacy feed shapes). */
export interface AcpProduct {
  id: string;
  name: string;
  description: string;
  price: string;
  currency: string;
  productId: string;
  title: string;
  customAttributes?: {
    token_id: string;
    nonce: number;
    image_url?: string;
  };
}

/** Normalized checkout payload for wallet signing in this starter kit. */
export interface AcpCheckoutPayload {
  receiver: string;
  value: string;
  data?: string;
  gasLimit?: string;
  chainId?: string;
  dappUrl?: string;
  status?: string;
  actionType?: 'sign_transaction' | 'use_dapp_wallet';
}

function acpUrl(agentUrl: string, path: string): string {
  try {
    assertAllowedAgentUrl(agentUrl);
  } catch (error) {
    throw new AcpError(
      `ACP URL rejected for ${agentUrl}: ${(error as Error).message}`,
      'SSRF',
      {cause: error},
    );
  }
  return new URL(path, agentUrl).toString();
}

function acpRequestConfig(
  headers?: Record<string, string>,
): AxiosRequestConfig {
  return {
    timeout: CONFIG.REQUEST_TIMEOUT,
    headers,
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function readString(
  record: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = record[key];
  return typeof value === 'string' ? value : undefined;
}

function throwAcpFailure(op: string, agentUrl: string, error: unknown): never {
  if (error instanceof AcpError) throw error;
  if (isAxiosError(error)) {
    const status = error.response?.status;
    throw new AcpError(
      `ACP ${op} failed for ${agentUrl}: ${error.message}`,
      status ? 'HTTP' : 'NETWORK',
      {status, cause: error},
    );
  }
  throw new AcpError(
    `ACP ${op} failed for ${agentUrl}: ${(error as Error).message}`,
    'NETWORK',
    {cause: error},
  );
}

function normalizeProduct(raw: Record<string, unknown>): AcpProduct | null {
  const productId = String(raw.product_id ?? raw.item_id ?? raw.id ?? '');
  if (!productId) return null;

  const title = String(raw.title ?? raw.name ?? productId);
  let amount = '';
  let currency = 'EGLD';

  if (raw.price && typeof raw.price === 'object') {
    const priceObj = raw.price as {amount?: string; currency?: string};
    amount = String(priceObj.amount ?? '');
    currency = String(priceObj.currency ?? 'EGLD');
  } else if (typeof raw.price === 'string') {
    const [priceAmount, priceCurrency] = raw.price.split(' ');
    amount = priceAmount ?? '';
    currency = priceCurrency ?? 'EGLD';
  }

  const customAttributes = asRecord(raw.custom_attributes);
  const customAttrs =
    customAttributes &&
    typeof customAttributes.token_id === 'string' &&
    typeof customAttributes.nonce === 'number'
      ? {
          token_id: customAttributes.token_id,
          nonce: customAttributes.nonce,
          image_url: readString(customAttributes, 'image_url'),
        }
      : undefined;

  return {
    id: productId,
    productId,
    name: title,
    title,
    description: String(raw.description ?? ''),
    price: amount,
    currency,
    customAttributes: customAttrs,
  };
}

/** Narrows an adapter checkout response into a wallet-ready payload. */
export function mapCheckoutResponse(data: unknown): AcpCheckoutPayload | null {
  const body = asRecord(data);
  if (!body) return null;

  const status = readString(body, 'status');
  const nextAction = asRecord(body.next_action);
  const actionType = readString(nextAction ?? {}, 'type');

  if (actionType === 'sign_transaction' && nextAction) {
    return {
      status,
      actionType: 'sign_transaction',
      receiver: readString(nextAction, 'receiver') ?? '',
      value: readString(nextAction, 'value') ?? '0',
      data: readString(nextAction, 'data'),
      gasLimit: String(nextAction.gasLimit ?? nextAction.gas_limit ?? ''),
      chainId: readString(nextAction, 'chain_id'),
    };
  }

  if (actionType === 'use_dapp_wallet' && nextAction) {
    return {
      status,
      actionType: 'use_dapp_wallet',
      receiver: '',
      value: '0',
      dappUrl: readString(nextAction, 'dapp_url'),
    };
  }

  const receiver = readString(body, 'receiver');
  if (receiver) {
    return {
      status,
      receiver,
      value: readString(body, 'value') ?? '0',
      data: readString(body, 'data'),
    };
  }

  return null;
}

export async function browseAcpProducts(
  agentUrl: string,
): Promise<AcpProduct[]> {
  try {
    const url = acpUrl(agentUrl, '/.well-known/acp/products.json');
    const response = await axios.get(url, acpRequestConfig());
    const payload = asRecord(response.data);
    const products = payload?.products;
    if (products === undefined) {
      return [];
    }
    if (!Array.isArray(products)) {
      throw new AcpError(
        `ACP browse invalid response for ${agentUrl}: products is not an array`,
        'INVALID_RESPONSE',
      );
    }

    return products
      .map((product: unknown) => normalizeProduct(asRecord(product) ?? {}))
      .filter((product): product is AcpProduct => product !== null);
  } catch (error) {
    if (error instanceof AcpError) {
      logger.warn(error.message);
      throw error;
    }
    throwAcpFailure('browse', agentUrl, error);
  }
}

/**
 * Retail or escrow checkout via multiversx-acp-adapter `POST /checkout`.
 */
export async function checkoutAcpProduct(
  agentUrl: string,
  productId: string,
  buyerAddress?: string,
  options?: {jobId?: string; type?: 'escrow' | 'retail'},
): Promise<AcpCheckoutPayload> {
  try {
    const url = acpUrl(agentUrl, '/checkout');
    const body: Record<string, string> = {product_id: productId};
    if (buyerAddress) body.buyer_address = buyerAddress;
    if (options?.jobId) body.job_id = options.jobId;
    if (options?.type) body.type = options.type;

    const response = await axios.post(url, body, acpRequestConfig());
    const mapped = mapCheckoutResponse(response.data);
    if (!mapped) {
      throw new AcpError(
        `ACP checkout invalid response for ${agentUrl}`,
        'INVALID_RESPONSE',
      );
    }
    return mapped;
  } catch (error) {
    if (error instanceof AcpError) {
      logger.warn(error.message);
      throw error;
    }
    throwAcpFailure('checkout', agentUrl, error);
  }
}

async function acpPost(
  op: string,
  agentUrl: string,
  path: string,
  body: unknown,
  headers?: Record<string, string>,
): Promise<unknown> {
  try {
    const url = acpUrl(agentUrl, path);
    const response = await axios.post(url, body, acpRequestConfig(headers));
    return response.data;
  } catch (error) {
    if (error instanceof AcpError) {
      logger.warn(error.message);
      throw error;
    }
    throwAcpFailure(op, agentUrl, error);
  }
}

async function acpGet(
  op: string,
  agentUrl: string,
  path: string,
  headers?: Record<string, string>,
): Promise<unknown> {
  try {
    const url = acpUrl(agentUrl, path);
    const response = await axios.get(url, acpRequestConfig(headers));
    return response.data;
  } catch (error) {
    if (error instanceof AcpError) {
      logger.warn(error.message);
      throw error;
    }
    throwAcpFailure(op, agentUrl, error);
  }
}

export async function negotiateAcpJob(
  agentUrl: string,
  rfp: Record<string, unknown>,
): Promise<unknown> {
  return acpPost('negotiate', agentUrl, '/negotiate', rfp);
}

export async function createAcpCheckoutSession(
  agentUrl: string,
  request: Record<string, unknown>,
  headers?: Record<string, string>,
): Promise<unknown> {
  return acpPost(
    'createCheckoutSession',
    agentUrl,
    '/checkout_sessions',
    request,
    headers,
  );
}

export async function updateAcpCheckoutSession(
  agentUrl: string,
  sessionId: string,
  request: Record<string, unknown>,
  headers?: Record<string, string>,
): Promise<unknown> {
  return acpPost(
    'updateCheckoutSession',
    agentUrl,
    `/checkout_sessions/${sessionId}`,
    request,
    headers,
  );
}

export async function getAcpCheckoutSession(
  agentUrl: string,
  sessionId: string,
  headers?: Record<string, string>,
): Promise<unknown> {
  return acpGet(
    'getCheckoutSession',
    agentUrl,
    `/checkout_sessions/${sessionId}`,
    headers,
  );
}

export async function completeAcpCheckoutSession(
  agentUrl: string,
  sessionId: string,
  request: Record<string, unknown>,
  headers?: Record<string, string>,
): Promise<unknown> {
  return acpPost(
    'completeCheckoutSession',
    agentUrl,
    `/checkout_sessions/${sessionId}/complete`,
    request,
    headers,
  );
}

export async function cancelAcpCheckoutSession(
  agentUrl: string,
  sessionId: string,
  headers?: Record<string, string>,
): Promise<unknown> {
  return acpPost(
    'cancelCheckoutSession',
    agentUrl,
    `/checkout_sessions/${sessionId}/cancel`,
    {},
    headers,
  );
}

export async function delegateAcpPayment(
  agentUrl: string,
  payload: Record<string, unknown>,
  headers?: Record<string, string>,
): Promise<unknown> {
  return acpPost(
    'delegatePayment',
    agentUrl,
    '/agentic_commerce/delegate_payment',
    payload,
    headers,
  );
}

export async function captureAcpPayment(
  agentUrl: string,
  paymentToken: string,
): Promise<unknown> {
  return acpPost('capturePayment', agentUrl, '/capture', {
    payment_token: paymentToken,
  });
}
