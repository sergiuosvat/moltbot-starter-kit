#!/usr/bin/env node
/**
 * Submit job proof directly (no MCP). Much faster than mcporter call multiversx.submit-job-proof.
 *
 * Usage: npx ts-node scripts/submit-job-proof.ts <jobId> [--standalone]
 *
 * Bot signs the tx, then sends to relayer for relay. Proof hash is SHA256("proof").
 * --standalone: submit only, no validation flow (omit to use as step 1 of validate-and-submit).
 * Env: BOT_PEM_PATH, RELAYER_URL, RELAYER_BASE_URL, VALIDATION_REGISTRY_ADDRESS
 */
export {};
