# Repair 03 — Feeds, provenance, acquisition clocks

**Status:** Complete within the assigned feed/provenance scope. The implementation remains **owner-only** and **paper-only**. No live provider, account, database, model, upload, schedule, consent, migration, service, or Git operation was performed for this repair.

## Implemented controls

| Area | Completed behavior | Scoped implementation |
|---|---|---|
| Broker origin cache | TradeLocker resolves the currently configured selected account before reusing the instruments catalog; the account cache is keyed to the selected-account configuration and the catalog cache to the resolved account ID. Quote/bar cache and pending keys remain based on the opaque INFO/BID source fingerprint. | `server/trading/tradelocker.ts`, `server/trading/source-identity.ts` |
| Source contract and quote observation | `Quote` and `QuoteObservationPair` carry optional opaque `sourceIdentity`. Durable v2 observations preserve a declared identity, never synthesize one from the human label, and reject label-equal / identity-different records. Legacy quotes without identity remain label-only. | `lib/trading/model.ts`, `lib/trading/session-strategy-model.ts`, `server/trading/strategy-quote-observations.ts` |
| PDC origin equality | PDC now compares `Quote.sourceIdentity` exactly when the execution feed declares an identity. A legacy selected source accepts only identity-absent, same-label quotes. The previous/current quote pair follows the same boundary; no provider-prefix fallback exists. Prior-day target and rollback logic were left intact. | `lib/trading/pdc-continuation.ts` |
| Retained bars | Retained v2 bars use the opaque identity in capture keys, row IDs, row discriminator, payload validation, and selection. Corrected duplicate bars upsert both `payload` and `source`. Rows lacking v2/exact identity are unavailable rather than merged. | `server/trading/setup-history.ts` |
| Immutable source clocks | Setup base/daily/hourly and session auxiliary bars use acquisition cutoffs before retention and analysis. A deliberately skipped optional hourly feed is treated as empty rather than validated as source candles. Timeframe bias uses `min(global request start, feed.requestedAt/fetchedAt)` for completed-bar classification while receipt-time freshness continues to use the observed clock. | `server/trading/setup-service.ts`, `server/trading/bias-router.ts` |
| Daily acquisition | Setup analysis always requests `1d` source history and the session acquisition fixture now supplies valid daily bars. Existing missing/current-bar source guards remain asserted. | `server/trading/setup-service.ts`, `tests/trading/session-source-acquisition.test.ts` |
| Paper balance | Proposal sizing imports `loadCanonicalPaperBalance(userId)` and passes that complete-ledger result to `proposePaper`; the accepted client `balance` field is compatibility-only and not used as a fallback. | `server/trading/paper-balance.ts`, `server/trading/setup-service.ts` |

## Targeted validation

All checks below are source-only, pure, or fully mocked; they made no real network or database request.

| Command / tests | Status | Coverage added or confirmed |
|---|---:|---|
| `pnpm check` | Passed | TypeScript no-emit check |
| `tests/trading/broker-read-refresh.test.ts` | Passed (3) | Selected-account change forces account/catalog/quote origin resolution; opaque identities differ and contain no raw account ID |
| `tests/trading/setup-history-source-identity.test.ts` | Passed (2) | Exact v2 identity selection, legacy rejection, identity-scoped capture, corrected duplicate payload/source upsert using a fully mocked DB |
| `tests/trading/strategy-quote-observations.test.ts` | Passed (15) | Durable v2 opaque identity persistence, same-label identity substitution rejection, legacy no-synthetic-identity behavior |
| `tests/trading/pdc-continuation.test.ts` | Passed (17) | Exact declared quote identity, legacy label-only rejection when a quote declares an identity, PDC continuation guards |
| `tests/trading/timeframe-bias.test.ts` | Passed (10) | Slow response cannot promote a bar that was forming at immutable request cutoff; receipt freshness stays separate |
| `tests/trading/session-source-acquisition.test.ts` | Passed (3) | Always-`1d` acquisition, valid daily fixture, retained/current source-bar guards |
| `tests/trading/paper-balance.test.ts` | Passed (3) | Complete bounded durable ledger balance, invalid ledger fail-closed, pagination bound |
| `tests/trading/paper-proposal-canonical-balance.test.ts` | Passed (1) | Fully mocked proposal ignores a client `balance: 999999999` and receives canonical balance `12345` |
| **Combined targeted run** | **Passed: 8 files / 54 tests** | `pnpm exec vitest run` over the eight files listed above |

## Remaining cross-dependencies / handoff notes

1. The existing market/router owner gate remains the authorization boundary for broker adapter calls; keep it in place when integrating concurrent parent changes. The direct adapter exports continue to be server-internal read helpers.
2. No schema migration is required: retained-history uses the existing indexed `source` column only for the opaque discriminator and validates v2 payload identity before reuse. Existing legacy rows intentionally remain unavailable until recaptured.
3. Other concurrently modified areas still need the parent agent's later full-suite/integration pass. This repair intentionally ran only the requested targeted suite; it did not run the full suite.
4. No live freshness, entitlement, broker account selection, or database state was claimed or tested.
