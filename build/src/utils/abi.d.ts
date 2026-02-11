import { Abi } from '@multiversx/sdk-core';
/**
 * Patches known ABI type incompatibilities between the contract-generated ABI
 * and what sdk-core's TypeMapper expects.
 *
 * - `TokenId` → `TokenIdentifier`
 * - `NonZeroBigUint` → `BigUint`
 */
export declare function createPatchedAbi(abiJson: object): Abi;
