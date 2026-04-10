import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const {
  mapPublicStatus,
  resolvePublicStatus,
} = require('../../dist/core/a2a/publicStatus.js');

test('public status mapper covers the required progress and exception labels', () => {
  assert.equal(mapPublicStatus({ event: 'request_sent' }), 'requesting_remote');
  assert.equal(mapPublicStatus({ event: 'provider_received' }), 'remote_received');
  assert.equal(mapPublicStatus({ event: 'provider_executing' }), 'remote_executing');
  assert.equal(mapPublicStatus({ event: 'timeout' }), 'timeout');
  assert.equal(mapPublicStatus({ event: 'provider_failed' }), 'remote_failed');
  assert.equal(mapPublicStatus({ event: 'clarification_needed' }), 'manual_action_required');
});

test('provider completion maps to completed', () => {
  assert.equal(mapPublicStatus({ event: 'provider_completed' }), 'completed');
});

test('resolvePublicStatus surfaces raw unknown events as unmapped', () => {
  const resolution = resolvePublicStatus({ event: 'provider_cancelled' });
  assert.equal(resolution.status, null);
  assert.equal(resolution.rawEvent, 'provider_cancelled');
  assert.equal(resolution.mapped, false);
  assert.equal(mapPublicStatus({}), null);
});

test('prototype-edge event names remain unmapped', () => {
  const resolution = resolvePublicStatus({ event: 'toString' });
  assert.equal(resolution.status, null);
  assert.equal(resolution.rawEvent, 'toString');
  assert.equal(resolution.mapped, false);
});

test('mapPublicStatus handles missing input by keeping unmapped state', () => {
  assert.equal(mapPublicStatus(undefined), null);
});

test('known mapped events still expose rawEvent metadata', () => {
  const resolution = resolvePublicStatus({ event: 'timeout' });
  assert.equal(resolution.status, 'timeout');
  assert.equal(resolution.rawEvent, 'timeout');
  assert.equal(resolution.mapped, true);
});
