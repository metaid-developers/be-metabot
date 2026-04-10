import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const { buildTraceInspectorViewModel } = require('../../dist/ui/pages/trace/viewModel.js');

test('buildTraceInspectorViewModel keeps transcript and status entries stable across repeated renders', () => {
  const input = {
    trace: {
      traceId: 'trace-weather-123',
      resultText: 'Remote weather result',
    },
    inspector: {
      transcriptItems: [
        {
          id: 'req-1',
          timestamp: 200,
          type: 'user_task',
          sender: 'caller',
          content: 'Tell me tomorrow weather',
        },
        {
          id: 'req-1',
          timestamp: 200,
          type: 'user_task',
          sender: 'caller',
          content: 'Tell me tomorrow weather',
        },
        {
          id: 'reply-1',
          timestamp: 400,
          type: 'assistant',
          sender: 'provider',
          content: 'Remote weather result',
        },
      ],
      publicStatusSnapshots: [
        {
          sessionId: 'session-1',
          taskRunId: 'run-1',
          status: 'requesting_remote',
          rawEvent: 'request_sent',
          resolvedAt: 1_775_000_000_000,
        },
        {
          sessionId: 'session-1',
          taskRunId: 'run-1',
          status: 'requesting_remote',
          rawEvent: 'request_sent',
          resolvedAt: 1_775_000_000_000,
        },
        {
          sessionId: 'session-1',
          taskRunId: 'run-1',
          status: 'remote_received',
          rawEvent: 'provider_received',
          resolvedAt: 1_775_000_002,
        },
        {
          sessionId: 'session-1',
          taskRunId: 'run-1',
          status: 'completed',
          rawEvent: 'provider_completed',
          resolvedAt: 1_775_000_002_500,
        },
      ],
    },
  };

  const first = buildTraceInspectorViewModel(input);
  const second = buildTraceInspectorViewModel(input);

  assert.equal(first.transcriptItems.length, 2);
  assert.equal(first.statusItems.length, 3);
  assert.deepEqual(second.transcriptItems, first.transcriptItems);
  assert.deepEqual(second.statusItems, first.statusItems);
  assert.deepEqual(
    first.transcriptItems.map((entry) => entry.content),
    ['Tell me tomorrow weather', 'Remote weather result'],
  );
  assert.deepEqual(
    first.statusItems.map((entry) => entry.status),
    ['requesting_remote', 'remote_received', 'completed'],
  );
});

test('buildTraceInspectorViewModel surfaces remote result and rating follow-up evidence', () => {
  const model = buildTraceInspectorViewModel({
    trace: {
      traceId: 'trace-weather-123',
      resultText: 'Tomorrow will be bright with a light wind.',
      resultObservedAt: 1775000000000,
      resultDeliveryPinId: 'delivery-pin-1',
      ratingRequested: true,
      ratingRequestText: '如果方便请给我一个评价吧。',
      ratingRequestedAt: 1775000005000,
      ratingPublished: true,
      ratingPinId: '/protocols/skill-service-rate-pin-7',
      ratingValue: 5,
      ratingComment: '评分：5分。结果清晰，感谢。',
      ratingMessageSent: true,
      ratingMessagePinId: '/protocols/simplemsg-pin-8',
      ratingMessageError: null,
      tStageCompleted: true,
      order: {
        paymentTxid: 'payment-tx-1',
        paymentAmount: '0.00001',
        paymentCurrency: 'SPACE',
        serviceName: 'Weather Oracle',
      },
    },
    inspector: {
      transcriptItems: [
        {
          id: 'rate-1',
          timestamp: 1775000007000,
          type: 'rating',
          sender: 'caller',
          content: '旧的 transcript 文案，不应覆盖结构化评分。',
          metadata: {
            rate: '1',
            ratingPinId: '/protocols/skill-service-rate-pin-old',
            ratingMessageSent: false,
            ratingMessagePinId: '/protocols/simplemsg-pin-old',
            ratingMessageError: 'old error',
          },
        },
      ],
    },
  });

  assert.equal(model.resultPanel.hasResult, true);
  assert.equal(model.resultPanel.text, 'Tomorrow will be bright with a light wind.');
  assert.deepEqual(
    model.resultPanel.metaRows,
    [
      { label: 'Observed At', value: '1775000000000' },
      { label: 'Delivery Pin', value: 'delivery-pin-1' },
      { label: 'Payment TXID', value: 'payment-tx-1' },
      { label: 'Paid', value: '0.00001 SPACE' },
      { label: 'Service', value: 'Weather Oracle' },
    ],
  );

  assert.equal(model.ratingPanel.status, 'sent');
  assert.match(model.ratingPanel.summary, /T-stage is complete/i);
  assert.equal(model.ratingPanel.requestText, '如果方便请给我一个评价吧。');
  assert.equal(model.ratingPanel.commentText, '评分：5分。结果清晰，感谢。');
  assert.deepEqual(
    model.ratingPanel.metaRows,
    [
      { label: 'T-Stage', value: 'Complete' },
      { label: 'Requested At', value: '1775000005000' },
      { label: 'Rating', value: '5' },
      { label: 'Rating Pin', value: '/protocols/skill-service-rate-pin-7' },
      { label: 'Provider Message', value: '/protocols/simplemsg-pin-8' },
    ],
  );
});

test('buildTraceInspectorViewModel treats on-chain rating plus follow-up delivery failure as successful closure', () => {
  const model = buildTraceInspectorViewModel({
    trace: {
      traceId: 'trace-weather-456',
      ratingRequested: true,
      ratingRequestText: '请给我一个评价吧。',
      ratingRequestedAt: 1775000009000,
      ratingPublished: true,
      ratingPinId: '/protocols/skill-service-rate-pin-9',
      ratingValue: 4,
      ratingComment: '解释完整。',
      ratingMessageSent: false,
      ratingMessagePinId: null,
      ratingMessageError: 'Provider follow-up delivery was not confirmed.',
      tStageCompleted: true,
    },
  });

  assert.equal(model.ratingPanel.status, 'publish_only');
  assert.match(model.ratingPanel.summary, /T-stage is complete/i);
  assert.equal(model.ratingPanel.commentText, '解释完整。');
  assert.deepEqual(model.ratingPanel.metaRows, [
    { label: 'T-Stage', value: 'Complete' },
    { label: 'Requested At', value: '1775000009000' },
    { label: 'Rating', value: '4' },
    { label: 'Rating Pin', value: '/protocols/skill-service-rate-pin-9' },
    { label: 'Provider Delivery Error', value: 'Provider follow-up delivery was not confirmed.' },
  ]);
});
