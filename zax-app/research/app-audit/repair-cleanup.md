# Source deletion cleanup repair

**Scope:** `deleteLibraryRecord` only. This repair preserves the already-existing owner confirmation, source/workspace compare-and-swap checks, capacity reclamation, workspace-match removal, source-version-index removal, and visual-vector removal. It does not change archive/strategy deletion, repository public DTOs, source jobs, routers, models, schema, migrations, services, or library-purpose notes.

## Implemented behavior

After the confirmed library-removal path has locked the workspace and source, verified the expected source version, verified the exact confirmation text, and computed the existing dependency-removal plan:

1. It reads the authoritative encrypted object key from the locked `trading_sources` row.
2. It creates a version-specific `trading_runtime_state` record with kind `source-cleanup` **inside the same database transaction**. Its private payload includes the owner ID, source ID, source version, and original encrypted object key, with `status: "pending"`.
3. It refuses a duplicate cleanup record for the same owner/source/version before changing workspace, source, version-index, or vector records.
4. It retains the existing CAS update plus source/version/vector deletion sequence. Transaction failure rolls back the pending cleanup record together with the logical deletion.
5. It returns a UI-safe result: **logical deletion completed**, **source-library capacity reclaimed**, `cleanupPending: true`, and `objectStorageDeleted: false`. The encrypted object key is never part of this result or other public DTOs.

The cleanup ID includes the source version, so a stale cleanup record from an older source version does not mask the currently confirmed version.

## Storage capability finding

`server/storage.ts` exposes `storagePut`, `storageGet`, and `storageGetSignedUrl`; it has **no safe provider-delete capability**. Therefore this repair intentionally makes **no provider/network call** and does not invent a deletion service. Logical deletion can reclaim the source-library record capacity, while the encrypted original remains retained and durably marked `cleanupPending`.

## Validation performed

- `pnpm vitest run tests/trading/source-cleanup.test.ts tests/trading/workspace-tools-transaction.test.ts` — **9 tests passed**.
  - Includes rollback of cleanup plus logical removal, duplicate pending-record rejection, stale-version record handling, no key in the UI result, and exact retained private runtime payload.
- `pnpm vitest run tests/trading/workspace-removal.test.ts tests/trading/workspace-capacity.test.ts tests/trading/source-public-dto.test.ts tests/trading/workspace-tools-router.test.ts` — **8 tests passed**.
- `git diff --check` — **passed**.
- `pnpm check` remains blocked by unrelated existing type errors in `tests/trading/ai-forecast.test.ts` and `tests/trading/pdc-continuation.test.ts`; no errors were reported in this repair's files.

## Explicitly remaining external work

1. A separately authorized cleanup worker/process and a verified storage-provider delete capability are required to physically delete the encrypted bytes.
2. That future worker must consume only the durable pending record, call the provider explicitly, and record a terminal outcome without exposing the object key.
3. No owner deletion, database mutation, provider operation, account/network action, migration, service operation, or Git mutation was executed for this repair; all persistence coverage used in-memory transaction mocks.
