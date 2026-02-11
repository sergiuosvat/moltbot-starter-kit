import {NetworkEntrypoint} from '@multiversx/sdk-core';
import {CONFIG} from '../config';

/**
 * Creates a network-aware entrypoint using CONFIG values.
 * This replaces the hardcoded DevnetEntrypoint usage across the codebase.
 */
export function createEntrypoint(): NetworkEntrypoint {
  return new NetworkEntrypoint({
    networkProviderUrl: CONFIG.API_URL,
    networkProviderKind: 'api',
    chainId: CONFIG.CHAIN_ID,
  });
}
