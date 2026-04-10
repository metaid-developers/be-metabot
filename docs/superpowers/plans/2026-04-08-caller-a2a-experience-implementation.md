# Caller A2A Experience Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the first caller-side A2A experience for Codex and Claude Code so a local MetaBot can discover a real online remote MetaBot, ask for delegation confirmation, create an A2A session, watch progress, support one clarification round, and return the result in the current host session.

**Architecture:** Introduce a durable A2A session engine inside the local daemon, backed by transport-adapter boundaries so v1 uses MetaWeb inbox/session polling while preserving room for future socket/gateway acceleration. Add a thin public caller contract on top of that engine: `services call` initiates the delegation, `trace watch` streams public status events, `trace get` returns the full structured trace, and the local inspector reads the same session/trace state through daemon-backed APIs and SSE.

**Tech Stack:** TypeScript, Node 20+, existing `metabot` CLI/daemon runtime, current runtime-state hot JSON storage, existing local HTML pages, node:test

---

## File Structure

### New runtime/session files

- Create: `src/core/a2a/sessionTypes.ts`
  - Own the durable A2A session, task run, public status, and policy types shared across caller runtime, provider runtime, trace watch, and inspector.
- Create: `src/core/a2a/sessionStateStore.ts`
  - Persist A2A sessions, task runs, transcript entries, cursors, and public status snapshots in hot state without overloading the existing simple trace record.
- Create: `src/core/a2a/publicStatus.ts`
  - Map low-level IDBots-style session/transport events into the thin public host-facing state contract (`requesting_remote`, `remote_received`, `timeout`, etc.).
- Create: `src/core/a2a/delegationPolicy.ts`
  - Evaluate `confirm_all` now while preserving future `confirm_paid_only` / `auto_when_safe` branches and machine-readable policy reasons.
- Create: `src/core/a2a/sessionEngine.ts`
  - Own caller/provider session lifecycle, one clarification round, timeout semantics, and task-run transitions.
- Create: `src/core/a2a/transport/transportAdapter.ts`
  - Define the transport boundary so MetaWeb polling is v1's only adapter but future socket/gateway adapters can fit later.
- Create: `src/core/a2a/transport/metawebPollingAdapter.ts`
  - Implement provider inbox loop and caller session loop using cursor-based incremental polling over the validated MetaWeb semantics.
- Create: `src/core/a2a/watch/watchEvents.ts`
  - Define newline-delimited trace-watch event payloads for CLI and host skills.
- Create: `src/core/a2a/watch/traceWatch.ts`
  - Stream public status events from the local daemon/session engine without host-specific polling logic.
- Create: `src/core/a2a/provider/serviceRunnerRegistry.ts`
  - Register thin provider-side service runners and keep execution separate from transport/session state.
- Create: `src/core/a2a/provider/serviceRunnerContracts.ts`
  - Define the runner input/output contract: `completed`, `needs_clarification`, `failed`.

### Existing runtime files to extend

- Modify: `src/core/state/runtimeStateStore.ts`
  - Add durable storage for A2A sessions / task runs / transcript items or delegate to the new session store file without breaking current identity/services/traces state.
- Modify: `src/core/chat/sessionTrace.ts`
  - Extend trace records so they can represent A2A session identity, public status snapshots, and caller/provider role linkage without losing current export compatibility.
- Modify: `src/core/chat/transcriptExport.ts`
  - Export richer A2A transcripts and trace markdown/json from the new session engine state.
- Modify: `src/core/delegation/remoteCall.ts`
  - Reframe current "plan remote call" logic into the new delegation confirmation and A2A session start model instead of the existing daemon-to-daemon demo round-trip.
- Modify: `src/daemon/defaultHandlers.ts`
  - Replace current `services.call` / `services.execute` flow with caller/provider session-engine entrypoints; add trace watch + inspector data handlers.
- Modify: `src/daemon/routes/services.ts`
  - Add any caller/provider session routes needed by the new engine while preserving machine-first envelopes.
- Modify: `src/daemon/routes/trace.ts`
  - Add a watch route and session-oriented trace endpoints.
- Modify: `src/daemon/routes/types.ts`
  - Add handler contracts for trace watch, session events, inspector session APIs, and future transport-neutral session actions.
- Modify: `src/cli/runtime.ts`
  - Wire new daemon dependencies and expose `trace watch` through the CLI dependency layer.
- Modify: `src/cli/commands/services.ts`
  - Support the new caller-side request/confirmation/session-init output contract.
- Modify: `src/cli/commands/trace.ts`
  - Add `trace watch` and preserve `trace get`.

### Existing UI / host-facing files to extend

- Modify: `src/ui/pages/hub/app.ts`
  - Update the yellow-pages page to point humans toward remote delegation and active A2A sessions instead of the older daemon demo flow.
- Modify: `src/ui/pages/trace/app.ts`
  - Turn the trace page into a real local inspector entrypoint for session timelines, transcript, timeout follow-up, and manual actions.
- Create: `src/ui/pages/trace/sseClient.ts`
  - Connect the inspector to daemon-backed SSE updates for one trace/session.
- Modify: `SKILLs/metabot-call-remote-service/SKILL.md`
  - Teach hosts to use `services call` + `trace watch` and to present "remote delegation confirmation" instead of a raw service invocation.
- Modify: `SKILLs/metabot-network-directory/SKILL.md`
  - Update the handoff contract so discovered services flow cleanly into caller A2A confirmation.
- Modify: `SKILLs/metabot-trace-inspector/SKILL.md`
  - Teach hosts when to recommend the inspector (timeout, clarification, manual action, user asks for details).
- Modify generated mirrors as needed through `npm run build:skillpacks`, not manual hand edits in `skillpacks/*`.

### New and updated tests

- Create: `tests/a2a/delegationPolicy.test.mjs`
- Create: `tests/a2a/publicStatus.test.mjs`
- Create: `tests/a2a/sessionEngineCaller.test.mjs`
- Create: `tests/a2a/sessionEngineProvider.test.mjs`
- Create: `tests/a2a/metawebPollingAdapter.test.mjs`
- Create: `tests/a2a/traceWatch.test.mjs`
- Modify: `tests/cli/runtime.test.mjs`
- Modify: `tests/daemon/httpServer.test.mjs`
- Modify: `tests/services/publishService.test.mjs` if shared fields change
- Modify: `tests/skillpacks/buildSkillpacks.test.mjs`

## Task 1: Lock In Durable A2A Types And Policy Surface

**Files:**
- Create: `src/core/a2a/sessionTypes.ts`
- Create: `src/core/a2a/delegationPolicy.ts`
- Create: `tests/a2a/delegationPolicy.test.mjs`

- [ ] **Step 1: Write the failing policy tests**

Add tests that prove:

- `confirm_all` always requires confirmation
- policy output includes `requiresConfirmation`, `policyMode`, and `policyReason`
- the model already accepts future-safe modes like `confirm_paid_only` without enabling them publicly yet

- [ ] **Step 2: Run the targeted policy tests**

Run: `npm run build && node --test tests/a2a/delegationPolicy.test.mjs`
Expected: FAIL because the new A2A policy module does not exist yet.

- [ ] **Step 3: Implement shared session and policy types**

Define:

- A2A session record
- task-run record
- clarification round tracking
- public policy decision type

Keep the first policy implementation conservative: `confirm_all`.

- [ ] **Step 4: Re-run the policy tests**

Run: `npm run build && node --test tests/a2a/delegationPolicy.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/a2a/sessionTypes.ts src/core/a2a/delegationPolicy.ts tests/a2a/delegationPolicy.test.mjs
git commit -m "feat: add a2a session types and delegation policy"
```

## Task 2: Add Public Caller Status Mapping

**Files:**
- Create: `src/core/a2a/publicStatus.ts`
- Create: `tests/a2a/publicStatus.test.mjs`
- Reference: `docs/superpowers/specs/2026-04-08-caller-a2a-experience-design.md`

- [ ] **Step 1: Write the failing public-status tests**

Add tests that verify:

- low-level "request sent" maps to `requesting_remote`
- provider receipt maps to `remote_received`
- provider execution maps to `remote_executing`
- timeout maps to public `timeout` and does **not** collapse to `failed`
- remote failure maps to `remote_failed`
- clarification maps to `manual_action_required` or the explicit public clarification state you choose for the engine

- [ ] **Step 2: Run the targeted public-status tests**

Run: `npm run build && node --test tests/a2a/publicStatus.test.mjs`
Expected: FAIL because the status mapper does not exist yet.

- [ ] **Step 3: Implement the thin public status mapper**

Keep the public states limited to the approved contract and avoid leaking transport-specific details.

- [ ] **Step 4: Re-run the public-status tests**

Run: `npm run build && node --test tests/a2a/publicStatus.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/a2a/publicStatus.ts tests/a2a/publicStatus.test.mjs
git commit -m "feat: add caller-facing a2a public states"
```

## Task 3: Add Durable Session State Storage

**Files:**
- Create: `src/core/a2a/sessionStateStore.ts`
- Modify: `src/core/state/runtimeStateStore.ts`
- Create: `tests/a2a/sessionStateStore.test.mjs`

- [ ] **Step 1: Write the failing session-store tests**

Add tests for:

- writing and reading A2A sessions and task runs
- cursor persistence for provider and caller loops
- transcript item append behavior
- preserving current identity/services/traces state untouched

- [ ] **Step 2: Run the targeted session-store tests**

Run: `npm run build && node --test tests/a2a/sessionStateStore.test.mjs`
Expected: FAIL because the session store does not exist yet.

- [ ] **Step 3: Implement the new session store**

Choose whether to:

- extend `runtime-state.json`, or
- store A2A session state in a dedicated hot JSON file

Prefer the dedicated file if it keeps responsibilities cleaner and reduces accidental coupling.

- [ ] **Step 4: Re-run the session-store tests**

Run: `npm run build && node --test tests/a2a/sessionStateStore.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/a2a/sessionStateStore.ts src/core/state/runtimeStateStore.ts tests/a2a/sessionStateStore.test.mjs
git commit -m "feat: add durable a2a session state storage"
```

## Task 4: Build The Provider Runner Boundary

**Files:**
- Create: `src/core/a2a/provider/serviceRunnerContracts.ts`
- Create: `src/core/a2a/provider/serviceRunnerRegistry.ts`
- Create: `tests/a2a/serviceRunnerRegistry.test.mjs`

- [ ] **Step 1: Write the failing runner-registry tests**

Add tests that verify:

- a service pin or provider skill resolves to one runner
- the runner contract only returns `completed`, `needs_clarification`, or `failed`
- an unknown service returns a not-found execution error without touching transport logic

- [ ] **Step 2: Run the targeted runner tests**

Run: `npm run build && node --test tests/a2a/serviceRunnerRegistry.test.mjs`
Expected: FAIL because the runner registry does not exist yet.

- [ ] **Step 3: Implement the thin provider runner boundary**

Keep execution separate from session transport and traces.

- [ ] **Step 4: Re-run the runner tests**

Run: `npm run build && node --test tests/a2a/serviceRunnerRegistry.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/a2a/provider/serviceRunnerContracts.ts src/core/a2a/provider/serviceRunnerRegistry.ts tests/a2a/serviceRunnerRegistry.test.mjs
git commit -m "feat: add provider service runner registry"
```

## Task 5: Build The Session Engine For Caller And Provider Roles

**Files:**
- Create: `src/core/a2a/sessionEngine.ts`
- Create: `tests/a2a/sessionEngineCaller.test.mjs`
- Create: `tests/a2a/sessionEngineProvider.test.mjs`
- Reference: `src/core/delegation/remoteCall.ts`

- [ ] **Step 1: Write the failing caller-side session tests**

Add tests for:

- creating an A2A session + task run from a confirmed remote delegation
- generating a stable trace/session linkage object
- transitioning to `requesting_remote`
- foreground timeout becoming public `timeout` without forcing terminal `failed`

- [ ] **Step 2: Write the failing provider-side session tests**

Add tests for:

- provider receives a new task request and moves to `remote_received`
- runner completion produces a result and terminal completion
- one clarification round is accepted
- second clarification attempt becomes `manual_action_required` or equivalent guarded state

- [ ] **Step 3: Run the targeted session-engine tests**

Run: `npm run build && node --test tests/a2a/sessionEngineCaller.test.mjs tests/a2a/sessionEngineProvider.test.mjs`
Expected: FAIL because the session engine does not exist yet.

- [ ] **Step 4: Implement the session engine**

Keep the engine transport-neutral and make sure it emits low-level internal events that the public-status mapper can reduce later.

- [ ] **Step 5: Re-run the session-engine tests**

Run: `npm run build && node --test tests/a2a/sessionEngineCaller.test.mjs tests/a2a/sessionEngineProvider.test.mjs`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/core/a2a/sessionEngine.ts tests/a2a/sessionEngineCaller.test.mjs tests/a2a/sessionEngineProvider.test.mjs
git commit -m "feat: add transport-neutral a2a session engine"
```

## Task 6: Implement The MetaWeb Polling Transport Adapter

**Files:**
- Create: `src/core/a2a/transport/transportAdapter.ts`
- Create: `src/core/a2a/transport/metawebPollingAdapter.ts`
- Create: `tests/a2a/metawebPollingAdapter.test.mjs`
- Reference: `src/core/discovery/chainDirectoryReader.ts`
- Reference: `src/daemon/defaultHandlers.ts`

- [ ] **Step 1: Write the failing transport-adapter tests**

Add tests for:

- provider inbox loop reading only new cursor-delimited messages
- caller session loop reading only active sessions it initiated
- adaptive polling mode transitions between idle and active sessions
- preserving a clean transport adapter interface so future socket/gateway implementations can fit later

- [ ] **Step 2: Run the targeted transport tests**

Run: `npm run build && node --test tests/a2a/metawebPollingAdapter.test.mjs`
Expected: FAIL because the transport adapter does not exist yet.

- [ ] **Step 3: Implement the transport boundary and MetaWeb polling adapter**

Keep v1 adapter limited to the validated MetaWeb semantics, but do not let session logic depend on polling-specific details.

- [ ] **Step 4: Re-run the transport tests**

Run: `npm run build && node --test tests/a2a/metawebPollingAdapter.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/a2a/transport/transportAdapter.ts src/core/a2a/transport/metawebPollingAdapter.ts tests/a2a/metawebPollingAdapter.test.mjs
git commit -m "feat: add metaweb polling transport adapter"
```

## Task 7: Replace The Existing Demo `services.call` Flow

**Files:**
- Modify: `src/core/delegation/remoteCall.ts`
- Modify: `src/daemon/defaultHandlers.ts`
- Modify: `src/daemon/routes/services.ts`
- Modify: `tests/cli/runtime.test.mjs`
- Modify: `tests/daemon/httpServer.test.mjs`

- [ ] **Step 1: Write the failing caller-runtime tests**

Add tests that prove:

- `services call` now returns a delegation/session/trace start contract instead of only the current daemon-to-daemon demo result
- confirmation semantics are represented in the response structure
- the result includes the policy metadata needed for future `confirm_paid_only` / `auto_when_safe`

- [ ] **Step 2: Write the failing provider-runtime tests**

Add a route-level or handler-level test showing:

- provider execution flows through the runner registry and session engine, not direct `providerDaemonBaseUrl` demo execution

- [ ] **Step 3: Run the targeted runtime tests**

Run: `npm run build && node --test tests/cli/runtime.test.mjs tests/daemon/httpServer.test.mjs`
Expected: FAIL because the current service-call path still uses the older demo flow.

- [ ] **Step 4: Implement the new caller/provider call path**

Preserve temporary compatibility where needed, but make the new A2A session path the default behavior.

- [ ] **Step 5: Re-run the targeted runtime tests**

Run: `npm run build && node --test tests/cli/runtime.test.mjs tests/daemon/httpServer.test.mjs`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/core/delegation/remoteCall.ts src/daemon/defaultHandlers.ts src/daemon/routes/services.ts tests/cli/runtime.test.mjs tests/daemon/httpServer.test.mjs
git commit -m "feat: wire services call into the a2a session engine"
```

## Task 8: Add `trace watch` As The Host-Facing Progress Stream

**Files:**
- Create: `src/core/a2a/watch/watchEvents.ts`
- Create: `src/core/a2a/watch/traceWatch.ts`
- Modify: `src/cli/commands/trace.ts`
- Modify: `src/cli/runtime.ts`
- Modify: `src/daemon/routes/trace.ts`
- Modify: `src/daemon/routes/types.ts`
- Create: `tests/a2a/traceWatch.test.mjs`
- Modify: `tests/cli/trace.test.mjs` or add `tests/cli/traceWatch.test.mjs`

- [ ] **Step 1: Write the failing trace-watch tests**

Add tests that verify:

- `trace watch` emits newline-delimited machine-first status events
- it only emits the public status contract, not raw transport internals
- it terminates on `completed`, `manual_action_required`, or public timeout handoff

- [ ] **Step 2: Run the targeted trace-watch tests**

Run: `npm run build && node --test tests/a2a/traceWatch.test.mjs tests/cli/trace.test.mjs`
Expected: FAIL because `trace watch` does not exist yet.

- [ ] **Step 3: Implement `trace watch` through daemon + CLI**

Prefer a streaming response shape that works for hosts without custom polling logic.

- [ ] **Step 4: Re-run the trace-watch tests**

Run: `npm run build && node --test tests/a2a/traceWatch.test.mjs tests/cli/trace.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/a2a/watch/watchEvents.ts src/core/a2a/watch/traceWatch.ts src/cli/commands/trace.ts src/cli/runtime.ts src/daemon/routes/trace.ts src/daemon/routes/types.ts tests/a2a/traceWatch.test.mjs tests/cli/trace.test.mjs
git commit -m "feat: add trace watch for host-side progress streaming"
```

## Task 9: Upgrade Trace Records And Exports For A2A Sessions

**Files:**
- Modify: `src/core/chat/sessionTrace.ts`
- Modify: `src/core/chat/transcriptExport.ts`
- Modify: `tests/chat/sessionTrace.test.mjs` or create it if missing
- Modify: `tests/chat/transcriptExport.test.mjs`

- [ ] **Step 1: Write the failing trace/export tests**

Add tests that prove:

- trace records now carry A2A session and task-run identity
- transcript export clearly identifies caller MetaBot and remote MetaBot
- timeout traces remain inspectable and do not masquerade as completed runs
- clarification messages render in transcript order

- [ ] **Step 2: Run the targeted trace/export tests**

Run: `npm run build && node --test tests/chat/sessionTrace.test.mjs tests/chat/transcriptExport.test.mjs`
Expected: FAIL because current trace/export shape is too shallow.

- [ ] **Step 3: Implement richer trace and export rendering**

Keep backward compatibility where practical, but prioritize the new A2A session model.

- [ ] **Step 4: Re-run the trace/export tests**

Run: `npm run build && node --test tests/chat/sessionTrace.test.mjs tests/chat/transcriptExport.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/chat/sessionTrace.ts src/core/chat/transcriptExport.ts tests/chat/sessionTrace.test.mjs tests/chat/transcriptExport.test.mjs
git commit -m "feat: enrich a2a trace and transcript exports"
```

## Task 10: Turn The Trace Page Into A Real Inspector

**Files:**
- Modify: `src/ui/pages/trace/app.ts`
- Create: `src/ui/pages/trace/sseClient.ts`
- Modify: `src/ui/pages/trace/index.html`
- Modify: `src/daemon/defaultHandlers.ts`
- Modify: `tests/daemon/httpServer.test.mjs`
- Add UI smoke coverage if there is an existing page-definition test harness

- [ ] **Step 1: Write the failing inspector tests**

Add tests or page-definition assertions that verify:

- trace page can load session/trace detail from the daemon
- trace page can subscribe to SSE updates
- timeout / manual action / clarification states render as first-class cases

- [ ] **Step 2: Run the targeted inspector tests**

Run: `npm run build && node --test tests/daemon/httpServer.test.mjs`
Expected: FAIL because the current trace page is still only a placeholder shell.

- [ ] **Step 3: Implement the real inspector view**

Keep the inspector local-only and observational. Do not let it become the primary normal-path UX.

- [ ] **Step 4: Re-run the inspector tests**

Run: `npm run build && node --test tests/daemon/httpServer.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/ui/pages/trace/app.ts src/ui/pages/trace/sseClient.ts src/ui/pages/trace/index.html src/daemon/defaultHandlers.ts tests/daemon/httpServer.test.mjs
git commit -m "feat: add local a2a trace inspector"
```

## Task 11: Update Host Skills And Generated Skill Packs

**Files:**
- Modify: `SKILLs/metabot-call-remote-service/SKILL.md`
- Modify: `SKILLs/metabot-network-directory/SKILL.md`
- Modify: `SKILLs/metabot-trace-inspector/SKILL.md`
- Modify generated outputs through `npm run build:skillpacks`
- Modify: `tests/skillpacks/buildSkillpacks.test.mjs`

- [ ] **Step 1: Write the failing skill-pack tests**

Add assertions that generated host packs now teach:

- remote delegation confirmation, not raw purchase language
- `services call` + `trace watch`
- when to recommend the inspector
- that MetaBot is the subject, not an endpoint

- [ ] **Step 2: Run the targeted skill-pack tests**

Run: `npm run build && npm run build:skillpacks && node --test tests/skillpacks/buildSkillpacks.test.mjs`
Expected: FAIL because the current skills still reflect the older demo round-trip.

- [ ] **Step 3: Update the source SKILLs and regenerate packs**

Keep all human-facing host wording aligned with the caller A2A spec.

- [ ] **Step 4: Re-run the skill-pack tests**

Run: `npm run build && npm run build:skillpacks && node --test tests/skillpacks/buildSkillpacks.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add SKILLs/metabot-call-remote-service/SKILL.md SKILLs/metabot-network-directory/SKILL.md SKILLs/metabot-trace-inspector/SKILL.md tests/skillpacks/buildSkillpacks.test.mjs skillpacks
git commit -m "feat: update host skills for caller a2a experience"
```

## Task 12: Full Verification And Documentation Pass

**Files:**
- Modify: `README.md`
- Modify: `docs/hosts/codex.md`
- Modify: `docs/hosts/claude-code.md`
- Modify: `docs/hosts/openclaw.md`
- Reference: `docs/superpowers/specs/2026-04-08-caller-a2a-experience-design.md`

- [ ] **Step 1: Update docs to reflect the new caller experience**

Document:

- remote delegation confirmation language
- `trace watch`
- inspector recommendation rules
- timeout semantics
- future policy evolution without promising more than v1 actually ships

- [ ] **Step 2: Run full verification**

Run: `npm run verify`
Expected: PASS with all tests green and regenerated skill packs current.

- [ ] **Step 3: Commit**

```bash
git add README.md docs/hosts/codex.md docs/hosts/claude-code.md docs/hosts/openclaw.md
git commit -m "docs: document caller a2a experience"
```

- [ ] **Step 4: Final review checkpoint**

Run:

```bash
git status --short
git log --oneline -5
```

Expected:

- clean worktree
- clear incremental commits for policy, session engine, transport adapter, trace watch, inspector, and docs
