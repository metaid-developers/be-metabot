import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const { buildHubServiceDirectoryViewModel } = require('../../dist/ui/pages/hub/viewModel.js');

test('buildHubServiceDirectoryViewModel sorts online services first and keeps long identifiers readable', () => {
  const model = buildHubServiceDirectoryViewModel({
    services: [
      {
        servicePinId: 'service-offline-1',
        displayName: 'Offline Archive',
        providerGlobalMetaId: 'idq1offlineprovider0000000000000000000000000000000000',
        description: 'Offline service should still remain visible after online entries.',
        price: '0.00010',
        currency: 'SPACE',
        providerSkill: 'offline-archive',
        online: false,
        lastSeenSec: 1775660000,
      },
      {
        servicePinId: 'service-online-1',
        displayName: 'Tarot Reader',
        providerGlobalMetaId: 'idq1onlineprovider1111111111111111111111111111111111',
        description: 'Returns tarot guidance.',
        price: '0.00001',
        currency: 'SPACE',
        providerSkill: 'tarot-rws',
        online: true,
        lastSeenSec: 1775663600,
      },
    ],
  });

  assert.equal(model.countLabel, '2');
  assert.equal(model.entries.length, 2);
  assert.equal(model.entries[0].servicePinId, 'service-online-1');
  assert.equal(model.entries[0].statusLabel, 'Online now');
  assert.equal(model.entries[0].priceLabel, '0.00001 SPACE');
  assert.equal(
    model.entries[0].providerLabel,
    'idq1onlineprovider1111111111111111111111111111111111',
  );
  assert.equal(model.entries[1].servicePinId, 'service-offline-1');
  assert.equal(model.entries[1].statusLabel, 'Recently seen');
});

test('buildHubServiceDirectoryViewModel returns an empty-state summary when no services are discoverable', () => {
  const model = buildHubServiceDirectoryViewModel({ services: [] });

  assert.equal(model.countLabel, '0');
  assert.equal(model.entries.length, 0);
  assert.equal(model.emptyTitle, 'No online MetaBot services yet');
  assert.match(model.emptyBody, /directory source/i);
});
