import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const { buildPublishPageViewModel } = require('../../dist/ui/pages/publish/viewModel.js');
const { buildMyServicesPageViewModel } = require('../../dist/ui/pages/my-services/viewModel.js');

test('buildPublishPageViewModel shows the local provider identity that will publish the service', () => {
  const model = buildPublishPageViewModel({
    providerSummary: {
      identity: {
        name: 'Alice Weather Bot',
        globalMetaId: 'idq1aliceweatherprovider000000000000000000000000000000',
        mvcAddress: '1AliceWeatherProviderAddress11111111111111',
      },
    },
  });

  assert.equal(model.providerCard.title, 'Provider Identity');
  assert.match(model.providerCard.summary, /current chain identity/i);
  assert.deepEqual(model.providerCard.rows, [
    { label: 'Provider Name', value: 'Alice Weather Bot' },
    {
      label: 'Provider GlobalMetaId',
      value: 'idq1aliceweatherprovider000000000000000000000000000000',
    },
    {
      label: 'Payment Address',
      value: '1AliceWeatherProviderAddress11111111111111',
    },
  ]);
});

test('buildPublishPageViewModel shows the publish result with the real chain pin, price, and output type', () => {
  const model = buildPublishPageViewModel({
    publishResult: {
      servicePinId: 'service-pin-weather-1',
      sourceServicePinId: 'source-pin-weather-1',
      price: '0.00001',
      currency: 'SPACE',
      outputType: 'text',
      path: '/protocols/skill-service',
    },
  });

  assert.equal(model.resultCard.hasResult, true);
  assert.match(model.resultCard.summary, /real chain pin/i);
  assert.deepEqual(model.resultCard.rows, [
    { label: 'Service Pin ID', value: 'service-pin-weather-1' },
    { label: 'Source Pin ID', value: 'source-pin-weather-1' },
    { label: 'Price', value: '0.00001 SPACE' },
    { label: 'Output Type', value: 'text' },
    { label: 'Path', value: '/protocols/skill-service' },
  ]);
});

test('buildMyServicesPageViewModel renders provider presence, current services, and chain publish metadata', () => {
  const model = buildMyServicesPageViewModel({
    providerSummary: {
      identity: {
        name: 'Provider Bot',
        globalMetaId: 'idq1provider000000000000000000000000000000000000',
      },
      presence: {
        enabled: true,
        lastHeartbeatAt: 1775000030000,
        lastHeartbeatPinId: '/protocols/metabot-heartbeat-pin-1',
      },
      services: [
        {
          servicePinId: '/protocols/skill-service-pin-1',
          sourceServicePinId: '/protocols/skill-service-pin-1',
          serviceName: 'tarot-rws-service',
          displayName: 'Tarot Reading',
          price: '0.00001',
          currency: 'SPACE',
          available: true,
          updatedAt: 1775000010000,
        },
      ],
      totals: {
        serviceCount: 1,
        activeServiceCount: 1,
        sellerOrderCount: 0,
        manualActionCount: 0,
      },
    },
  });

  assert.equal(model.presenceCard.title, 'Provider Presence');
  assert.equal(model.presenceCard.statusLabel, 'Online');
  assert.equal(model.presenceCard.actionLabel, 'Go offline');
  assert.deepEqual(model.presenceCard.rows, [
    { label: 'Provider', value: 'Provider Bot' },
    {
      label: 'GlobalMetaId',
      value: 'idq1provider000000000000000000000000000000000000',
    },
    { label: 'Last Heartbeat', value: '1775000030000' },
    { label: 'Heartbeat Pin', value: '/protocols/metabot-heartbeat-pin-1' },
    { label: 'Active Services', value: '1 / 1' },
  ]);

  assert.equal(model.serviceInventory.length, 1);
  assert.deepEqual(model.serviceInventory[0], {
    key: '/protocols/skill-service-pin-1',
    displayName: 'Tarot Reading',
    serviceName: 'tarot-rws-service',
    availabilityLabel: 'Available',
    priceLabel: '0.00001 SPACE',
    servicePinId: '/protocols/skill-service-pin-1',
    lastPublishAt: '1775000010000',
  });
});

test('buildMyServicesPageViewModel renders recent seller orders with trace linkage and manual refund state', () => {
  const model = buildMyServicesPageViewModel({
    providerSummary: {
      recentOrders: [
        {
          traceId: 'trace-provider-refund',
          orderId: 'order-refund-1',
          servicePinId: '/protocols/skill-service-pin-1',
          serviceName: 'Tarot Reading',
          buyerGlobalMetaId: 'idq1buyer0000000000000000000000000000000000000',
          buyerName: 'Buyer Bot',
          publicStatus: 'manual_action_required',
          createdAt: 1775000020000,
        },
      ],
      manualActions: [
        {
          kind: 'refund',
          traceId: 'trace-provider-refund',
          orderId: 'order-refund-1',
          refundRequestPinId: 'refund-pin-1',
          sessionId: 'seller-session-1',
        },
      ],
    },
  });

  assert.equal(model.recentOrders.length, 1);
  assert.deepEqual(model.recentOrders[0], {
    key: 'order-refund-1',
    serviceName: 'Tarot Reading',
    buyerLabel: 'Buyer Bot · idq1buyer0000000000000000000000000000000000000',
    stateLabel: 'manual_action_required',
    traceHref: '/ui/trace?traceId=trace-provider-refund',
    traceLabel: 'trace-provider-refund',
    createdAt: '1775000020000',
    requiresManualRefund: true,
  });

  assert.equal(model.manualActions.length, 1);
  assert.deepEqual(model.manualActions[0], {
    key: 'order-refund-1',
    kindLabel: 'Refund confirmation',
    orderId: 'order-refund-1',
    refundRequestPinId: 'refund-pin-1',
    refundHref: '/ui/refund?orderId=order-refund-1',
    traceHref: '/ui/trace?traceId=trace-provider-refund',
  });
});
