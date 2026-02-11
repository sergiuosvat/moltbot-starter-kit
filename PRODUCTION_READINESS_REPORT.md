# Production Readiness Report — moltbot-starter-kit

**Date**: 2026-02-11  
**Verdict**: **NO** — 2 P1 blockers (network lock-in), 4 P2 issues

---

## 1. Executive Summary

The codebase is **well-structured** with centralized config, structured logging, SSRF protection, retry logic with backoff, and 83%+ test coverage. However, **two P1 blockers prevent mainnet/testnet deployment**: the SDK entry point is hardcoded to `DevnetEntrypoint` and the facilitator hardcodes `network: 'D'`.

## 2. Test Coverage

| Metric | Value | Target | Status |
|--------|-------|--------|--------|
| Test Suites | 9/9 pass | — | ✅ |
| Tests | 21/21 pass | — | ✅ |
| Statement Coverage | 83.6% | 80% | ✅ |
| Branch Coverage | 75.2% | 80% | ⚠️ |
| Function Coverage | 82.9% | 80% | ✅ |
| Line Coverage | 84.7% | 80% | ✅ |
| Lint (gts) | Clean | Clean | ✅ |

### Uncovered Areas
- `facilitator.ts` L64-83 (prepare/settle methods)
- `job_handler.ts` L70-74, L111-117 (broadcast failure + not-found monitoring branches)
- `pow.ts` L34-35, L50-51 (challenge expiry + remaining bits check)
- `validator.ts` L131-135 (auto-registration branch)

## 3. Documentation

| Item | Status |
|------|--------|
| README.md | ✅ Present — Quick Start, env vars, prerequisites |
| STARTER_KIT_GUIDE.md | ✅ Detailed setup guide |
| RELAYER_HANDSHAKE.md | ✅ Relayer integration docs |
| .env.example | ✅ Present |
| Inline code comments | ✅ Good |

## 4. Security

| Check | Status | Notes |
|-------|--------|-------|
| Committed secrets | ✅ Clean | `.env`, `*.pem`, `wallet.pem` in `.gitignore` |
| SSRF protection | ✅ | Domain whitelist in `processor.ts` |
| Input validation | ✅ | URL parsing before fetch |
| Request timeouts | ✅ | Configurable via `CONFIG.REQUEST_TIMEOUT` |
| No `unwrap`/`expect` | N/A | TypeScript project |
| `any` types | ⚠️ 1 | `scripts/sign_tx.ts:103` — `const plain: any` |

## 5. Code Quality & Standards

### P1 — Blockers

| # | File | Line | Issue |
|---|------|------|-------|
| 1 | `validator.ts` | 6, 51, 179 | **`DevnetEntrypoint` hardcoded** — will fail on mainnet/testnet |
| | `hiring.ts` | 7, 173, 228 | Same |
| | `BlockchainService.ts` | 4, 22 | Same |
| 2 | `facilitator.ts` | 80 | **`network: 'D'` hardcoded** — should use `CONFIG.CHAIN_ID` |

> [!CAUTION]
> The `DevnetEntrypoint` class is a convenience wrapper that hardwires devnet URLs.
> For production, use `Entrypoint` or construct `SmartContractTransactionsFactory` / `SmartContractController` directly with a custom `ApiNetworkProvider` pointing to `CONFIG.API_URL`. This is needed in 3 files, 5 call sites.

### P2 — Should Fix

| # | File | Line | Issue |
|---|------|------|-------|
| 3 | `validator.ts` | 52-54 | ABI type patching hack: `s/TokenId/TokenIdentifier/g` — fragile, breaks if ABI changes |
| | `hiring.ts` | 174-177, 220-223 | Same hack repeated in 2 more places |
| | `BlockchainService.ts` | 24-28 | Same |
| 4 | `mcp_bridge.ts` | 15 | Bare `console.warn` instead of `Logger` |
| | `mcp_bridge.ts` | 25 | Hardcoded gas price fallback `'1000000000'` |
| 5 | `BlockchainService.ts` | 42, 55 | Unsafe `as AgentDetails` / `as bigint` casts without runtime validation |
| 6 | `facilitator.ts` | 47-50 | Silent error swallowing in polling loop (commented-out logging) |

### P3 — Minor / Informational

| # | File | Line | Issue |
|---|------|------|-------|
| 7 | `hiring.ts` | 33, 212 | Hardcoded `agentNonce = 1` — OK for demo script, but should be configurable |
| 8 | `scripts/sign_tx.ts` | 103 | `const plain: any` — use proper type from SDK |

### Good Practices ✅
- No `TODO` / `FIXME` / `HACK` comments
- Centralized config with env var fallbacks
- Structured `Logger` class with levels
- Retry strategy with exponential backoff (`job_handler.ts`)
- PoW solver with challenge expiry check
- Auto-registration on 403 with retry
- Proper `withTimeout` wrapper for all network calls

## 6. Action Plan

### Must Fix (P1) — Blocking Production

1. **Replace `DevnetEntrypoint` with network-aware factory construction**
   - Files: `validator.ts`, `hiring.ts`, `BlockchainService.ts` (5 call sites)
   - Fix: Use `ApiNetworkProvider(CONFIG.API_URL)` directly, create `SmartContractTransactionsFactory` and `SmartContractController` manually with the ABI and provider
   - Or use the generic `Entrypoint` if available in sdk-core v15

2. **Fix hardcoded `network: 'D'` in `facilitator.ts:80`**
   - Replace `network: 'D'` with `network: CONFIG.CHAIN_ID`

### Should Fix (P2)

3. **Centralize ABI patching** into a single utility function (`src/utils/abi.ts`) instead of repeating the hack in 3 files

4. **Use Logger in `mcp_bridge.ts`** instead of bare `console.warn`

5. **Add runtime validation** for query results in `BlockchainService.ts` instead of unsafe `as` casts

6. **Log poll errors** in `facilitator.ts:47-50` instead of silently swallowing

### Nice to Have (P3)

7. Make `agentNonce` configurable in `hiring.ts` via env var
8. Type the `sign_tx.ts` plain object properly
9. Improve branch coverage to 80%+ (currently 75.2%)
