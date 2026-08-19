import {Address} from '@multiversx/sdk-core';
import axios from 'axios';

import {loadSignerSync, discoverRelayerAddress} from '../chain';
import {CONFIG} from '../config';

/**
 * Thin compatibility layer over `src/chain/` for CLI scripts.
 * Prefer importing from `../src/chain` or skills directly in new code.
 */

export function getSigner(customPath?: string) {
  return loadSignerSync(customPath);
}

export async function getRelayerAddress(sender: Address): Promise<string> {
  const relayer = await discoverRelayerAddress(sender);
  if (!relayer) {
    throw new Error(
      `No relayer address found for ${sender.toBech32()} at ${CONFIG.PROVIDERS.RELAYER_URL}`,
    );
  }
  return relayer;
}

export interface ITransactionPlainObject {
  nonce: number;
  value: string;
  receiver: string;
  sender: string;
  gasPrice: number;
  gasLimit: number;
  data?: string;
  signature?: string;
  chainID: string;
  version: number;
  options?: number;
  relayer?: string;
}

export async function relayTransaction(
  txPlain: ITransactionPlainObject,
): Promise<string> {
  const url = `${CONFIG.PROVIDERS.RELAYER_URL.replace(/\/$/, '')}/relay`;
  const response = await axios.post(
    url,
    {transaction: txPlain},
    {timeout: CONFIG.REQUEST_TIMEOUT},
  );
  const result = response.data as {txHash?: string; error?: string};
  if (result.txHash) return result.txHash;
  throw new Error(result.error || JSON.stringify(result));
}
