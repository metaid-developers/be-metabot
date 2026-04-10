import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const {
  createMetaWebPollingTransportAdapter,
} = require('../../dist/core/a2a/transport/metawebPollingAdapter.js');

function createAdapter(overrides = {}) {
  return createMetaWebPollingTransportAdapter({
    activePollIntervalMs: 1_500,
    idlePollIntervalMs: 8_000,
    fetchProviderInboxPage: async () => ({ messages: [], nextCursor: null }),
    fetchCallerSessionPage: async () => ({ messages: [], nextCursor: null }),
    ...overrides,
  });
}

test('provider inbox loop reads only new cursor-delimited task requests and clarification answers', async () => {
  const fetchCalls = [];
  const adapter = createAdapter({
    fetchProviderInboxPage: async (input) => {
      fetchCalls.push(input);
      return {
        nextCursor: 'provider-cursor-2',
        messages: [
          {
            messageId: 'msg-task-new',
            kind: 'task_request',
            traceId: 'trace-new',
            servicePinId: 'service-weather',
            callerGlobalMetaId: 'idq-caller',
            providerGlobalMetaId: 'idq-provider',
            externalConversationId: 'a2a-session:idq-provider:trace-new',
            userTask: 'Forecast tomorrow weather',
            taskContext: 'User is in Shanghai',
            observedAt: 1_775_000_000_001,
          },
          {
            messageId: 'msg-clarification-live',
            kind: 'clarification_answer',
            traceId: 'trace-live',
            servicePinId: 'service-weather',
            callerGlobalMetaId: 'idq-caller',
            providerGlobalMetaId: 'idq-provider',
            externalConversationId: 'a2a-session:idq-provider:trace-live',
            answer: 'Use Shanghai',
            observedAt: 1_775_000_000_002,
          },
          {
            messageId: 'msg-clarification-stale',
            kind: 'clarification_answer',
            traceId: 'trace-stale',
            servicePinId: 'service-weather',
            callerGlobalMetaId: 'idq-caller',
            providerGlobalMetaId: 'idq-provider',
            externalConversationId: 'a2a-session:idq-provider:trace-stale',
            answer: 'Ignore me',
            observedAt: 1_775_000_000_003,
          },
          {
            messageId: 'msg-other-provider',
            kind: 'task_request',
            traceId: 'trace-stranger',
            servicePinId: 'service-weather',
            callerGlobalMetaId: 'idq-caller',
            providerGlobalMetaId: 'idq-other-provider',
            externalConversationId: 'a2a-session:idq-other-provider:trace-stranger',
            userTask: 'Should be filtered',
            taskContext: '',
            observedAt: 1_775_000_000_004,
          },
        ],
      };
    },
  });

  const result = await adapter.pollProviderInbox({
    cursor: 'provider-cursor-1',
    providerGlobalMetaId: 'idq-provider',
    activeSessions: [
      {
        sessionId: 'session-live',
        traceId: 'trace-live',
        callerGlobalMetaId: 'idq-caller',
        providerGlobalMetaId: 'idq-provider',
        externalConversationId: 'a2a-session:idq-provider:trace-live',
      },
    ],
  });

  assert.deepEqual(fetchCalls, [
    {
      cursor: 'provider-cursor-1',
      providerGlobalMetaId: 'idq-provider',
      activeSessions: [
        {
          sessionId: 'session-live',
          traceId: 'trace-live',
          callerGlobalMetaId: 'idq-caller',
          providerGlobalMetaId: 'idq-provider',
          externalConversationId: 'a2a-session:idq-provider:trace-live',
        },
      ],
    },
  ]);
  assert.equal(result.cursor, 'provider-cursor-2');
  assert.equal(result.events.length, 2);
  assert.deepEqual(result.events.map((event) => event.kind), ['task_request', 'clarification_answer']);
  assert.equal(result.events[0].traceId, 'trace-new');
  assert.equal(result.events[1].traceId, 'trace-live');
});

test('caller session loop reads only active sessions it initiated and skips chain reads when idle', async () => {
  let fetchCalls = 0;
  const adapter = createAdapter({
    fetchCallerSessionPage: async () => {
      fetchCalls += 1;
      return {
        nextCursor: 'caller-cursor-2',
        messages: [
          {
            messageId: 'msg-live-received',
            kind: 'provider_received',
            traceId: 'trace-live',
            servicePinId: 'service-weather',
            callerGlobalMetaId: 'idq-caller',
            providerGlobalMetaId: 'idq-provider',
            externalConversationId: 'a2a-session:idq-provider:trace-live',
            observedAt: 1_775_000_000_010,
          },
          {
            messageId: 'msg-live-completed',
            kind: 'provider_completed',
            traceId: 'trace-live',
            servicePinId: 'service-weather',
            callerGlobalMetaId: 'idq-caller',
            providerGlobalMetaId: 'idq-provider',
            externalConversationId: 'a2a-session:idq-provider:trace-live',
            responseText: 'Tomorrow will be bright.',
            observedAt: 1_775_000_000_011,
          },
          {
            messageId: 'msg-other-trace',
            kind: 'provider_completed',
            traceId: 'trace-other',
            servicePinId: 'service-weather',
            callerGlobalMetaId: 'idq-caller',
            providerGlobalMetaId: 'idq-provider',
            externalConversationId: 'a2a-session:idq-provider:trace-other',
            responseText: 'Ignore me.',
            observedAt: 1_775_000_000_012,
          },
          {
            messageId: 'msg-other-caller',
            kind: 'provider_completed',
            traceId: 'trace-live',
            servicePinId: 'service-weather',
            callerGlobalMetaId: 'idq-someone-else',
            providerGlobalMetaId: 'idq-provider',
            externalConversationId: 'a2a-session:idq-provider:trace-live',
            responseText: 'Ignore me too.',
            observedAt: 1_775_000_000_013,
          },
        ],
      };
    },
  });

  const activeResult = await adapter.pollCallerSessions({
    cursor: 'caller-cursor-1',
    callerGlobalMetaId: 'idq-caller',
    activeSessions: [
      {
        sessionId: 'session-live',
        traceId: 'trace-live',
        callerGlobalMetaId: 'idq-caller',
        providerGlobalMetaId: 'idq-provider',
        externalConversationId: 'a2a-session:idq-provider:trace-live',
      },
    ],
  });

  assert.equal(fetchCalls, 1);
  assert.equal(activeResult.cursor, 'caller-cursor-2');
  assert.equal(activeResult.events.length, 2);
  assert.deepEqual(activeResult.events.map((event) => event.kind), ['provider_received', 'provider_completed']);

  const idleResult = await adapter.pollCallerSessions({
    cursor: 'caller-cursor-2',
    callerGlobalMetaId: 'idq-caller',
    activeSessions: [],
  });

  assert.equal(fetchCalls, 1);
  assert.equal(idleResult.cursor, 'caller-cursor-2');
  assert.deepEqual(idleResult.events, []);
});

test('adaptive polling mode tightens when sessions are active and relaxes when idle', () => {
  const adapter = createAdapter();

  const providerIdle = adapter.getPollSchedule({ role: 'provider', activeSessions: 0 });
  const providerActive = adapter.getPollSchedule({ role: 'provider', activeSessions: 2 });
  const callerIdle = adapter.getPollSchedule({ role: 'caller', activeSessions: 0 });
  const callerActive = adapter.getPollSchedule({ role: 'caller', activeSessions: 1 });

  assert.equal(providerIdle.mode, 'idle');
  assert.equal(callerIdle.mode, 'idle');
  assert.equal(providerActive.mode, 'active');
  assert.equal(callerActive.mode, 'active');
  assert.ok(providerActive.intervalMs < providerIdle.intervalMs);
  assert.ok(callerActive.intervalMs < callerIdle.intervalMs);
});

test('transport adapter exposes a boundary-friendly interface for future socket or gateway adapters', () => {
  const adapter = createAdapter();

  assert.deepEqual(adapter.descriptor, {
    adapterId: 'metaweb_polling',
    sourceOfTruth: 'metaweb',
    delivery: 'polling',
  });
  assert.equal(typeof adapter.getPollSchedule, 'function');
  assert.equal(typeof adapter.pollProviderInbox, 'function');
  assert.equal(typeof adapter.pollCallerSessions, 'function');
});
