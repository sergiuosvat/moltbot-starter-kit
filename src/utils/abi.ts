import {Abi} from '@multiversx/sdk-core';

/**
 * Patches known ABI type incompatibilities between the contract-generated ABI
 * and what sdk-core's TypeMapper expects.
 *
 * - `TokenId` → `TokenIdentifier`
 * - `NonZeroBigUint` → `BigUint`
 */
export function createPatchedAbi(abiJson: object): Abi {
  const raw = JSON.stringify(abiJson)
    .replace(/"TokenId"/g, '"TokenIdentifier"')
    .replace(/"NonZeroBigUint"/g, '"BigUint"');
  return Abi.create(JSON.parse(raw));
}
