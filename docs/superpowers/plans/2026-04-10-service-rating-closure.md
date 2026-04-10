# Service Rating Closure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Formalize the first `be-metabot` service-rating closure so buyer-side auto-rating remains IDBots-compatible while provider-side order views and trace inspection clearly show DACT T-stage completion.

**Architecture:** Keep the existing `services rate` write path intact, then add one lightweight rating-detail cache that incrementally reads `/protocols/skill-service-rate` and joins rating detail back onto provider orders using `serviceID + servicePaidTx`. Extend provider summary and trace read models so HTML pages render explicit T-stage closure instead of inferring it only from transcript shape.

**Tech Stack:** TypeScript, node:test, existing daemon/runtime hot-state files, existing local HTML pages, MetaWeb chain read APIs

---

## File Structure

### New files

- Create: `src/core/ratings/ratingDetailState.ts`
  - Own the lightweight hot-file cache for rating detail items plus incremental sync cursors.
- Create: `src/core/ratings/ratingDetailSync.ts`
  - Parse `/protocols/skill-service-rate` chain rows using IDBots-compatible semantics and refresh the local cache.
- Create: `tests/ratings/ratingDetailState.test.mjs`
  - Cover hot-state persistence and cursor storage for the rating detail cache.
- Create: `tests/ratings/ratingDetailSync.test.mjs`
  - Cover chain parsing, incremental refresh, and `serviceID + servicePaidTx` lookup behavior.

### Existing files to extend

- Modify: `src/core/state/paths.ts`
  - Add one dedicated hot-state path for rating detail cache storage.
- Modify: `src/core/provider/providerConsole.ts`
  - Join seller-side orders with cached rating detail and expose explicit provider-side order rating fields.
- Modify: `src/ui/pages/my-services/viewModel.ts`
  - Render provider order rows with `未评价 / 已评价 / 回传未确认 / 评分同步异常` semantics and rating detail fields.
- Modify: `src/daemon/defaultHandlers.ts`
  - Refresh the rating cache before `provider.getSummary` and `trace.getTrace` when needed, then expose explicit rating closure fields.
- Modify: `src/ui/pages/trace/viewModel.ts`
  - Prefer structured trace rating closure state over transcript-only inference.

### Existing tests to extend

- Modify: `tests/provider/providerConsole.test.mjs`
  - Assert provider order rows expose the expected rating closure fields.
- Modify: `tests/ui/providerViewModels.test.mjs`
  - Assert `My Services` renders the expected rating closure labels and detail values.
- Modify: `tests/ui/traceViewModel.test.mjs`
  - Assert trace inspection renders explicit T-stage closure semantics.
- Modify: `tests/cli/runtime.test.mjs`
  - Prove provider summary and trace inspection expose rating closure after buyer-side auto-rating.
- Modify: `tests/state/stateLayout.test.mjs` if present, or add equivalent path-layout coverage if needed.

## Task 1: Add Rating Detail State Storage

**Files:**
- Create: `src/core/ratings/ratingDetailState.ts`
- Modify: `src/core/state/paths.ts`
- Create: `tests/ratings/ratingDetailState.test.mjs`

- [ ] **Step 1: Write the failing state-store tests**

Add tests that prove:

- the rating detail store persists entries in a dedicated hot JSON file
- the store also persists incremental sync cursors / latest pin state
- missing or malformed files safely normalize to an empty state

- [ ] **Step 2: Run the targeted state-store tests**

Run: `npm run build && node --test tests/ratings/ratingDetailState.test.mjs`

Expected: FAIL because the rating detail store does not exist yet.

- [ ] **Step 3: Add the new hot-state path**

Extend `resolveMetabotPaths()` with one dedicated file path, for example `rating-detail.json`, under `.metabot/hot`.

- [ ] **Step 4: Implement the rating detail state store**

Implement a dedicated store patterned after `providerPresenceState.ts` with:

- `items`
- `latestPinId`
- `backfillCursor`
- `lastSyncedAt`
- safe `read / write / update`

- [ ] **Step 5: Re-run the targeted state-store tests**

Run: `npm run build && node --test tests/ratings/ratingDetailState.test.mjs`

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/core/state/paths.ts src/core/ratings/ratingDetailState.ts tests/ratings/ratingDetailState.test.mjs
git commit -m "feat: add rating detail hot state store"
```

## Task 2: Add IDBots-Compatible Rating Detail Sync

**Files:**
- Create: `src/core/ratings/ratingDetailSync.ts`
- Create: `tests/ratings/ratingDetailSync.test.mjs`
- Reference: `/Users/tusm/Documents/MetaID_Projects/IDBots/IDBots/src/main/services/gigSquareRatingSyncService.ts`

- [ ] **Step 1: Write the failing parser and sync tests**

Add tests that prove:

- valid `/protocols/skill-service-rate` rows parse into:
  - `pinId`
  - `serviceId`
  - `servicePaidTx`
  - `rate`
  - `comment`
  - `raterGlobalMetaId`
  - `raterMetaId`
  - `createdAt`
- invalid rows are skipped without failing the whole sync
- incremental refresh ignores already-seen pin ids
- a lookup helper can find one rating detail by `serviceID + servicePaidTx`

- [ ] **Step 2: Run the targeted sync tests**

Run: `npm run build && node --test tests/ratings/ratingDetailSync.test.mjs`

Expected: FAIL because the parser and sync module do not exist yet.

- [ ] **Step 3: Implement chain pin parsing**

Reuse the IDBots-compatible parsing assumptions for:

- `contentSummary`
- `serviceID`
- `servicePaidTx`
- `rate`
- `comment`
- rater identity metadata
- timestamp normalization

- [ ] **Step 4: Implement lightweight incremental refresh**

Implement a sync helper that:

- fetches `/protocols/skill-service-rate`
- updates the local cache incrementally
- records latest pin / cursor state
- leaves existing entries untouched when already seen

- [ ] **Step 5: Re-run the targeted sync tests**

Run: `npm run build && node --test tests/ratings/ratingDetailSync.test.mjs`

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/core/ratings/ratingDetailSync.ts tests/ratings/ratingDetailSync.test.mjs
git commit -m "feat: add rating detail sync"
```

## Task 3: Join Rating Detail Into Provider Orders

**Files:**
- Modify: `src/core/provider/providerConsole.ts`
- Modify: `tests/provider/providerConsole.test.mjs`

- [ ] **Step 1: Write the failing provider snapshot tests**

Extend provider-console tests so seller orders expose:

- `ratingStatus`
- `ratingValue`
- `ratingComment`
- `ratingPinId`
- `ratingCreatedAt`

Cover at least:

- no matching rating => `requested_unrated` or unrated provider state
- matching on-chain rating => `rated_on_chain`
- matching on-chain rating with unconfirmed provider follow-up => `rated_on_chain_followup_unconfirmed`

- [ ] **Step 2: Run the targeted provider snapshot tests**

Run: `npm run build && node --test tests/provider/providerConsole.test.mjs`

Expected: FAIL because provider order rows do not yet include rating closure fields.

- [ ] **Step 3: Extend provider order rows**

Update `ProviderConsoleOrderRow` so each seller order can carry:

- rating status
- score
- comment
- rating pin
- created-at timestamp

- [ ] **Step 4: Join ratings by `serviceID + servicePaidTx`**

Update `buildProviderConsoleSnapshot()` to join cached rating detail back onto seller orders using:

- `order.serviceId`
- `order.paymentTxid`

Keep the join logic focused on order closure, not general aggregate reputation.

- [ ] **Step 5: Re-run the targeted provider snapshot tests**

Run: `npm run build && node --test tests/provider/providerConsole.test.mjs`

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/core/provider/providerConsole.ts tests/provider/providerConsole.test.mjs
git commit -m "feat: join ratings into provider orders"
```

## Task 4: Expose Rating Closure Through Provider Summary

**Files:**
- Modify: `src/daemon/defaultHandlers.ts`
- Modify: `tests/cli/runtime.test.mjs`

- [ ] **Step 1: Write the failing runtime tests for provider-side order closure**

Add runtime coverage that:

- publishes one buyer-side rating after a completed remote trace
- refreshes provider summary
- proves the provider summary order row shows the expected rating fields and closure state

- [ ] **Step 2: Run the targeted runtime tests**

Run: `npm run build && node --test tests/cli/runtime.test.mjs`

Expected: FAIL because provider summary does not yet refresh rating detail or expose order rating fields.

- [ ] **Step 3: Refresh rating detail before provider summary reads**

Inside `provider.getSummary`, add a lightweight best-effort refresh path that:

- reads current rating cache state
- refreshes from `/protocols/skill-service-rate` when stale or missing
- passes rating detail into `buildProviderSummaryPayload()`

- [ ] **Step 4: Keep degradation explicit**

If refresh fails:

- do not invent a positive rating
- surface a machine-readable degraded state so the UI can render `评分同步异常`

- [ ] **Step 5: Re-run the targeted runtime tests**

Run: `npm run build && node --test tests/cli/runtime.test.mjs`

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/daemon/defaultHandlers.ts tests/cli/runtime.test.mjs
git commit -m "feat: expose rating closure in provider summary"
```

## Task 5: Make Trace Inspection Prefer Explicit T-Stage Closure

**Files:**
- Modify: `src/daemon/defaultHandlers.ts`
- Modify: `src/ui/pages/trace/viewModel.ts`
- Modify: `tests/ui/traceViewModel.test.mjs`
- Modify: `tests/cli/runtime.test.mjs`

- [ ] **Step 1: Write the failing trace closure tests**

Add tests that prove:

- trace data can explicitly represent:
  - `ratingRequested`
  - `ratingPublished`
  - `ratingPinId`
  - `ratingValue`
  - `ratingComment`
  - `ratingMessageSent`
  - `ratingMessageError`
  - `tStageCompleted`
- on-chain rating success plus follow-up delivery failure still renders as successful closure

- [ ] **Step 2: Run the targeted trace tests**

Run: `npm run build && node --test tests/ui/traceViewModel.test.mjs tests/cli/runtime.test.mjs`

Expected: FAIL because trace closure still relies too heavily on transcript inference.

- [ ] **Step 3: Extend `trace.getTrace` payload**

Update the daemon trace payload so it includes explicit rating closure fields derived from:

- existing trace state
- transcript evidence
- cached rating detail lookup by `serviceID + servicePaidTx`

- [ ] **Step 4: Update the trace view model**

Make `buildTraceInspectorViewModel()` prefer structured closure state over transcript-only inference, while keeping transcript fallback behavior for older traces.

- [ ] **Step 5: Re-run the targeted trace tests**

Run: `npm run build && node --test tests/ui/traceViewModel.test.mjs tests/cli/runtime.test.mjs`

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/daemon/defaultHandlers.ts src/ui/pages/trace/viewModel.ts tests/ui/traceViewModel.test.mjs tests/cli/runtime.test.mjs
git commit -m "feat: expose explicit trace rating closure"
```

## Task 6: Render Provider Rating Closure In My Services

**Files:**
- Modify: `src/ui/pages/my-services/viewModel.ts`
- Modify: `tests/ui/providerViewModels.test.mjs`

- [ ] **Step 1: Write the failing provider UI view-model tests**

Extend `My Services` view-model tests so recent order rows render:

- `未评价`
- `已评价 · 4/5`
- `已评价 · 4/5 · 回传未确认`
- `评分同步异常`

Also expose:

- comment preview
- rating pin when available

- [ ] **Step 2: Run the targeted provider UI tests**

Run: `npm run build && node --test tests/ui/providerViewModels.test.mjs`

Expected: FAIL because the current view model only renders buyer, state, trace, and refund state.

- [ ] **Step 3: Extend recent-order UI fields**

Add the provider-side rating display fields needed by the HTML page, keeping the browser logic thin and derived from provider summary.

- [ ] **Step 4: Re-run the targeted provider UI tests**

Run: `npm run build && node --test tests/ui/providerViewModels.test.mjs`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/ui/pages/my-services/viewModel.ts tests/ui/providerViewModels.test.mjs
git commit -m "feat: render provider rating closure"
```

## Task 7: Full Verification And Docs Touch-Up

**Files:**
- Modify: `README.md` if user-facing validation steps need one short note
- Modify: `docs/acceptance/cross-host-demo-runbook.md` if the manual acceptance evidence should now include rating closure
- Test: `tests/**/*.test.mjs`

- [ ] **Step 1: Add acceptance wording only where the new behavior is user-visible**

Document only the new closure evidence:

- provider order row shows rating state
- trace inspector shows T-stage closure

- [ ] **Step 2: Run full verification**

Run: `npm run verify`

Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add README.md docs/acceptance/cross-host-demo-runbook.md
git commit -m "docs: cover service rating closure"
```
