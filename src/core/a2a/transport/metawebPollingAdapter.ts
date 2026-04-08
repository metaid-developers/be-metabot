import type { A2ALoopCursor } from '../sessionStateStore';
import type {
  A2ACallerSessionTransportEvent,
  A2AProviderInboxTransportEvent,
  A2ATransportAdapter,
  A2ATransportPollResult,
  A2ATransportSessionRef,
  PollCallerSessionsInput,
  PollProviderInboxInput,
} from './transportAdapter';

const DEFAULT_ACTIVE_POLL_INTERVAL_MS = 2_000;
const DEFAULT_IDLE_POLL_INTERVAL_MS = 10_000;

type MetaWebProviderInboxMessage = Partial<A2AProviderInboxTransportEvent> & {
  messageId?: unknown;
  kind?: unknown;
  traceId?: unknown;
  servicePinId?: unknown;
  callerGlobalMetaId?: unknown;
  providerGlobalMetaId?: unknown;
  externalConversationId?: unknown;
  userTask?: unknown;
  taskContext?: unknown;
  answer?: unknown;
  observedAt?: unknown;
  replyPinId?: unknown;
  rawMessage?: unknown;
};

type MetaWebCallerSessionMessage = Partial<A2ACallerSessionTransportEvent> & {
  messageId?: unknown;
  kind?: unknown;
  traceId?: unknown;
  servicePinId?: unknown;
  callerGlobalMetaId?: unknown;
  providerGlobalMetaId?: unknown;
  externalConversationId?: unknown;
  responseText?: unknown;
  question?: unknown;
  failureCode?: unknown;
  failureMessage?: unknown;
  observedAt?: unknown;
  replyPinId?: unknown;
  rawMessage?: unknown;
};

export interface MetaWebProviderInboxPage {
  messages?: MetaWebProviderInboxMessage[] | null;
  nextCursor?: A2ALoopCursor;
}

export interface MetaWebCallerSessionPage {
  messages?: MetaWebCallerSessionMessage[] | null;
  nextCursor?: A2ALoopCursor;
}

export interface MetaWebPollingTransportAdapterOptions {
  activePollIntervalMs?: number;
  idlePollIntervalMs?: number;
  fetchProviderInboxPage: (input: PollProviderInboxInput) => Promise<MetaWebProviderInboxPage>;
  fetchCallerSessionPage: (input: PollCallerSessionsInput) => Promise<MetaWebCallerSessionPage>;
}

function normalizeText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeCursor(nextCursor: A2ALoopCursor | undefined, fallback: A2ALoopCursor): A2ALoopCursor {
  if (typeof nextCursor === 'string') {
    return nextCursor.trim() || fallback;
  }
  if (typeof nextCursor === 'number') {
    return Number.isFinite(nextCursor) ? nextCursor : fallback;
  }
  return nextCursor === null ? null : fallback;
}

function normalizeObservedAt(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function normalizeRawMessage(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function matchesSession(
  message: { traceId: string; externalConversationId: string | null },
  session: A2ATransportSessionRef,
): boolean {
  return (
    normalizeText(session.traceId) === message.traceId
    || (
      normalizeText(session.externalConversationId) !== ''
      && normalizeText(session.externalConversationId) === normalizeText(message.externalConversationId)
    )
  );
}

function matchesAnyActiveSession(
  message: { traceId: string; externalConversationId: string | null },
  activeSessions: A2ATransportSessionRef[],
): boolean {
  return activeSessions.some((session) => matchesSession(message, session));
}

function normalizeProviderInboxEvent(message: MetaWebProviderInboxMessage): A2AProviderInboxTransportEvent | null {
  const kind = normalizeText(message.kind);
  if (kind !== 'task_request' && kind !== 'clarification_answer') {
    return null;
  }

  const messageId = normalizeText(message.messageId);
  const traceId = normalizeText(message.traceId);
  const servicePinId = normalizeText(message.servicePinId);
  const callerGlobalMetaId = normalizeText(message.callerGlobalMetaId);
  const providerGlobalMetaId = normalizeText(message.providerGlobalMetaId);
  if (!messageId || !traceId || !servicePinId || !callerGlobalMetaId || !providerGlobalMetaId) {
    return null;
  }

  return {
    messageId,
    kind,
    traceId,
    servicePinId,
    callerGlobalMetaId,
    providerGlobalMetaId,
    externalConversationId: normalizeText(message.externalConversationId) || null,
    userTask: normalizeText(message.userTask) || null,
    taskContext: normalizeText(message.taskContext) || null,
    answer: normalizeText(message.answer) || null,
    observedAt: normalizeObservedAt(message.observedAt),
    replyPinId: normalizeText(message.replyPinId) || null,
    rawMessage: normalizeRawMessage(message.rawMessage),
  };
}

function normalizeCallerSessionEvent(message: MetaWebCallerSessionMessage): A2ACallerSessionTransportEvent | null {
  const kind = normalizeText(message.kind);
  if (
    kind !== 'provider_received'
    && kind !== 'provider_completed'
    && kind !== 'provider_failed'
    && kind !== 'clarification_needed'
  ) {
    return null;
  }

  const messageId = normalizeText(message.messageId);
  const traceId = normalizeText(message.traceId);
  const servicePinId = normalizeText(message.servicePinId);
  const callerGlobalMetaId = normalizeText(message.callerGlobalMetaId);
  const providerGlobalMetaId = normalizeText(message.providerGlobalMetaId);
  if (!messageId || !traceId || !servicePinId || !callerGlobalMetaId || !providerGlobalMetaId) {
    return null;
  }

  return {
    messageId,
    kind,
    traceId,
    servicePinId,
    callerGlobalMetaId,
    providerGlobalMetaId,
    externalConversationId: normalizeText(message.externalConversationId) || null,
    responseText: normalizeText(message.responseText) || null,
    question: normalizeText(message.question) || null,
    failureCode: normalizeText(message.failureCode) || null,
    failureMessage: normalizeText(message.failureMessage) || null,
    observedAt: normalizeObservedAt(message.observedAt),
    replyPinId: normalizeText(message.replyPinId) || null,
    rawMessage: normalizeRawMessage(message.rawMessage),
  };
}

export function createMetaWebPollingTransportAdapter(
  options: MetaWebPollingTransportAdapterOptions,
): A2ATransportAdapter {
  const activePollIntervalMs = Number.isFinite(options.activePollIntervalMs)
    ? Math.max(250, Math.floor(options.activePollIntervalMs as number))
    : DEFAULT_ACTIVE_POLL_INTERVAL_MS;
  const idlePollIntervalMs = Number.isFinite(options.idlePollIntervalMs)
    ? Math.max(activePollIntervalMs, Math.floor(options.idlePollIntervalMs as number))
    : DEFAULT_IDLE_POLL_INTERVAL_MS;

  const getPollSchedule: A2ATransportAdapter['getPollSchedule'] = (input) => {
    const activeSessions = Number.isFinite(input.activeSessions)
      ? Math.max(0, Math.floor(input.activeSessions))
      : 0;
    if (activeSessions > 0) {
      return {
        mode: 'active',
        intervalMs: activePollIntervalMs,
      };
    }
    return {
      mode: 'idle',
      intervalMs: idlePollIntervalMs,
    };
  };

  const pollProviderInbox = async (
    input: PollProviderInboxInput,
  ): Promise<A2ATransportPollResult<A2AProviderInboxTransportEvent>> => {
    const schedule = getPollSchedule({
      role: 'provider',
      activeSessions: input.activeSessions.length,
    });
    const page = await options.fetchProviderInboxPage({
      cursor: input.cursor,
      providerGlobalMetaId: normalizeText(input.providerGlobalMetaId),
      activeSessions: input.activeSessions,
    });
    const providerGlobalMetaId = normalizeText(input.providerGlobalMetaId);
    const events = (page.messages ?? [])
      .map((message) => normalizeProviderInboxEvent(message))
      .filter((event): event is A2AProviderInboxTransportEvent => Boolean(event))
      .filter((event) => {
        if (event.providerGlobalMetaId !== providerGlobalMetaId) {
          return false;
        }
        if (event.kind === 'task_request') {
          return true;
        }
        return matchesAnyActiveSession(event, input.activeSessions);
      });

    return {
      cursor: normalizeCursor(page.nextCursor, input.cursor),
      events,
      schedule,
    };
  };

  const pollCallerSessions = async (
    input: PollCallerSessionsInput,
  ): Promise<A2ATransportPollResult<A2ACallerSessionTransportEvent>> => {
    const schedule = getPollSchedule({
      role: 'caller',
      activeSessions: input.activeSessions.length,
    });
    if (input.activeSessions.length === 0) {
      return {
        cursor: input.cursor,
        events: [],
        schedule,
      };
    }

    const page = await options.fetchCallerSessionPage({
      cursor: input.cursor,
      callerGlobalMetaId: normalizeText(input.callerGlobalMetaId),
      activeSessions: input.activeSessions,
    });
    const callerGlobalMetaId = normalizeText(input.callerGlobalMetaId);
    const events = (page.messages ?? [])
      .map((message) => normalizeCallerSessionEvent(message))
      .filter((event): event is A2ACallerSessionTransportEvent => Boolean(event))
      .filter((event) => (
        event.callerGlobalMetaId === callerGlobalMetaId
        && matchesAnyActiveSession(event, input.activeSessions)
      ));

    return {
      cursor: normalizeCursor(page.nextCursor, input.cursor),
      events,
      schedule,
    };
  };

  return {
    descriptor: {
      adapterId: 'metaweb_polling',
      sourceOfTruth: 'metaweb',
      delivery: 'polling',
    },
    getPollSchedule,
    pollProviderInbox,
    pollCallerSessions,
  };
}
