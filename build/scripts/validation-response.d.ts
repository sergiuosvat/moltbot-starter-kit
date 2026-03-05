#!/usr/bin/env node
/**
 * Validator/oracle responds to a validation request (ERC-8004 validation_response).
 * In production: third-party validator signs with VALIDATOR_PEM_PATH.
 * For mocking: omit VALIDATOR_PEM_PATH to use BOT_PEM_PATH (agent wallet).
 *
 * Usage: npx ts-node scripts/validation-response.ts <requestHash> <score> [responseUri] [tag]
 *
 * Env: VALIDATOR_PEM_PATH (oracle/validator), BOT_PEM_PATH (mock fallback),
 *      RELAYER_URL, VALIDATION_REGISTRY_ADDRESS
 */
export {};
