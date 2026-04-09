import type { SessionTraceRecord } from '../chat/sessionTrace';
import { resolveManualRefundDecision } from '../orders/manualRefund';
import type { PublishedServiceRecord } from '../services/publishService';

type ProviderConsoleTraceOrder = NonNullable<SessionTraceRecord['order']> & {
  status?: string | null;
  refundRequestPinId?: string | null;
  coworkSessionId?: string | null;
};

export interface ProviderConsoleTraceRecord extends Omit<SessionTraceRecord, 'order'> {
  order: ProviderConsoleTraceOrder | null;
}

export interface ProviderConsoleServiceRow {
  servicePinId: string;
  sourceServicePinId: string;
  serviceName: string;
  displayName: string;
  price: string;
  currency: string;
  available: boolean;
  updatedAt: number;
}

export interface ProviderConsoleOrderRow {
  traceId: string;
  orderId: string;
  servicePinId: string;
  serviceName: string;
  paymentTxid: string | null;
  paymentAmount: string | null;
  paymentCurrency: string | null;
  buyerGlobalMetaId: string | null;
  buyerName: string | null;
  publicStatus: string | null;
  createdAt: number;
}

export interface ProviderConsoleManualActionRow {
  kind: 'refund';
  traceId: string;
  orderId: string;
  refundRequestPinId: string;
  sessionId: string | null;
}

export interface ProviderConsoleSnapshot {
  services: ProviderConsoleServiceRow[];
  recentOrders: ProviderConsoleOrderRow[];
  manualActions: ProviderConsoleManualActionRow[];
  totals: {
    serviceCount: number;
    activeServiceCount: number;
    sellerOrderCount: number;
    manualActionCount: number;
  };
}

function normalizeText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function sortByUpdatedAtDesc<T extends { updatedAt?: number; createdAt?: number }>(left: T, right: T): number {
  const leftValue = Number.isFinite(left.updatedAt) ? Number(left.updatedAt) : Number(left.createdAt) || 0;
  const rightValue = Number.isFinite(right.updatedAt) ? Number(right.updatedAt) : Number(right.createdAt) || 0;
  return rightValue - leftValue;
}

function buildServiceRow(record: PublishedServiceRecord): ProviderConsoleServiceRow {
  return {
    servicePinId: normalizeText(record.currentPinId),
    sourceServicePinId: normalizeText(record.sourceServicePinId),
    serviceName: normalizeText(record.serviceName),
    displayName: normalizeText(record.displayName) || normalizeText(record.serviceName),
    price: normalizeText(record.price),
    currency: normalizeText(record.currency),
    available: record.available === 1,
    updatedAt: Number.isFinite(record.updatedAt) ? Number(record.updatedAt) : 0,
  };
}

function buildOrderRow(trace: ProviderConsoleTraceRecord): ProviderConsoleOrderRow | null {
  const order = trace.order;
  if (!order || normalizeText(order.role) !== 'seller') {
    return null;
  }

  const orderId = normalizeText(order.id);
  const servicePinId = normalizeText(order.serviceId);
  if (!orderId || !servicePinId) {
    return null;
  }

  return {
    traceId: normalizeText(trace.traceId),
    orderId,
    servicePinId,
    serviceName: normalizeText(order.serviceName),
    paymentTxid: normalizeText(order.paymentTxid) || null,
    paymentAmount: normalizeText(order.paymentAmount) || null,
    paymentCurrency: normalizeText(order.paymentCurrency) || null,
    buyerGlobalMetaId: normalizeText(trace.session?.peerGlobalMetaId) || null,
    buyerName: normalizeText(trace.session?.peerName) || null,
    publicStatus: normalizeText(trace.a2a?.publicStatus) || null,
    createdAt: Number.isFinite(trace.createdAt) ? Number(trace.createdAt) : 0,
  };
}

function buildManualAction(trace: ProviderConsoleTraceRecord): ProviderConsoleManualActionRow | null {
  const order = trace.order;
  if (!order) {
    return null;
  }

  const decision = resolveManualRefundDecision({
    id: normalizeText(order.id),
    role: normalizeText(order.role) === 'seller' ? 'seller' : 'buyer',
    status: normalizeText(order.status),
    refundRequestPinId: normalizeText(order.refundRequestPinId) || null,
    coworkSessionId: normalizeText(order.coworkSessionId) || null,
    paymentTxid: normalizeText(order.paymentTxid) || null,
  });

  if (!decision.required) {
    return null;
  }

  return {
    kind: 'refund',
    traceId: normalizeText(trace.traceId),
    orderId: decision.ui.orderId,
    refundRequestPinId: decision.ui.refundRequestPinId,
    sessionId: decision.ui.sessionId,
  };
}

export function buildProviderConsoleSnapshot(input: {
  services: PublishedServiceRecord[];
  traces: ProviderConsoleTraceRecord[];
}): ProviderConsoleSnapshot {
  const services = [...input.services]
    .sort(sortByUpdatedAtDesc)
    .map(buildServiceRow);
  const recentOrders = input.traces
    .map(buildOrderRow)
    .filter((entry): entry is ProviderConsoleOrderRow => Boolean(entry))
    .sort(sortByUpdatedAtDesc);
  const manualActions = input.traces
    .map(buildManualAction)
    .filter((entry): entry is ProviderConsoleManualActionRow => Boolean(entry));

  return {
    services,
    recentOrders,
    manualActions,
    totals: {
      serviceCount: services.length,
      activeServiceCount: services.filter((entry) => entry.available).length,
      sellerOrderCount: recentOrders.length,
      manualActionCount: manualActions.length,
    },
  };
}
