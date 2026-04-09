import type { ChainWriteResult } from '../chain/writePin';
import type { Signer } from '../signing/signer';
import {
  buildPublishedService,
  type PublishedServiceDraft,
  type PublishedServiceRecord,
} from './publishService';

const SKILL_SERVICE_PROTOCOL_PATH = '/protocols/skill-service';
const PENDING_SERVICE_PIN_ID = 'pending-skill-service-pin';

function normalizeText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function buildServicePublishChainWrite(input: {
  payload: Record<string, string>;
  network?: string;
}) {
  return {
    operation: 'create',
    path: SKILL_SERVICE_PROTOCOL_PATH,
    payload: JSON.stringify(input.payload),
    contentType: 'application/json',
    network: normalizeText(input.network).toLowerCase() || 'mvc',
  };
}

export interface PublishServiceToChainResult {
  payload: Record<string, string>;
  record: PublishedServiceRecord;
  chainWrite: ChainWriteResult;
}

export async function publishServiceToChain(input: {
  signer: Pick<Signer, 'writePin'>;
  creatorMetabotId: number;
  providerGlobalMetaId: string;
  paymentAddress: string;
  draft: PublishedServiceDraft;
  skillDocument: string;
  now: number;
  network?: string;
}): Promise<PublishServiceToChainResult> {
  const prepared = buildPublishedService({
    sourceServicePinId: PENDING_SERVICE_PIN_ID,
    currentPinId: PENDING_SERVICE_PIN_ID,
    creatorMetabotId: input.creatorMetabotId,
    providerGlobalMetaId: input.providerGlobalMetaId,
    paymentAddress: input.paymentAddress,
    draft: input.draft,
    skillDocument: input.skillDocument,
    now: input.now,
  });

  const chainWriteRequest = buildServicePublishChainWrite({
    payload: prepared.payload,
    network: input.network,
  });
  const chainWrite = await input.signer.writePin(chainWriteRequest);
  const chainPinId = normalizeText(chainWrite.pinId);

  const published = buildPublishedService({
    sourceServicePinId: chainPinId,
    currentPinId: chainPinId,
    creatorMetabotId: input.creatorMetabotId,
    providerGlobalMetaId: input.providerGlobalMetaId,
    paymentAddress: input.paymentAddress,
    draft: input.draft,
    skillDocument: input.skillDocument,
    now: input.now,
  });

  return {
    payload: published.payload,
    record: published.record,
    chainWrite,
  };
}
