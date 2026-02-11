import { NetworkEntrypoint } from '@multiversx/sdk-core';
/**
 * Creates a network-aware entrypoint using CONFIG values.
 * This replaces the hardcoded DevnetEntrypoint usage across the codebase.
 */
export declare function createEntrypoint(): NetworkEntrypoint;
