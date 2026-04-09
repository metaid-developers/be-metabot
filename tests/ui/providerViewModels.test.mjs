import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const { buildPublishPageViewModel } = require('../../dist/ui/pages/publish/viewModel.js');

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
