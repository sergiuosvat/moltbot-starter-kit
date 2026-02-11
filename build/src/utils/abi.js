"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createPatchedAbi = createPatchedAbi;
const sdk_core_1 = require("@multiversx/sdk-core");
/**
 * Patches known ABI type incompatibilities between the contract-generated ABI
 * and what sdk-core's TypeMapper expects.
 *
 * - `TokenId` → `TokenIdentifier`
 * - `NonZeroBigUint` → `BigUint`
 */
function createPatchedAbi(abiJson) {
    const raw = JSON.stringify(abiJson)
        .replace(/"TokenId"/g, '"TokenIdentifier"')
        .replace(/"NonZeroBigUint"/g, '"BigUint"');
    return sdk_core_1.Abi.create(JSON.parse(raw));
}
//# sourceMappingURL=abi.js.map