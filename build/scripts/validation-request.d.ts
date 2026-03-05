#!/usr/bin/env node
/**
 * Request third-party validation for a job (ERC-8004 validation_request).
 * Run AFTER submit_proof. The agent signs this; the validator/oracle signs validation_response.
 *
 * Usage: npx ts-node scripts/validation-request.ts <jobId> [validatorAddress]
 *
 * Env: AGENT_PEM_PATH (or BOT_PEM_PATH), VALIDATOR_ADDRESS (oracle to request from),
 *      RELAYER_URL, VALIDATION_REGISTRY_ADDRESS
 */
export {};
