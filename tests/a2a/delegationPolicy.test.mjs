import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const {
  evaluateDelegationPolicy,
  resolveDelegationPolicyMode,
} = require('../../dist/core/a2a/delegationPolicy.js');

test('confirm_all always requires confirmation', () => {
  const decision = evaluateDelegationPolicy({
    policyMode: 'confirm_all',
    estimatedCostAmount: '0',
    estimatedCostCurrency: 'SPACE',
  });

  assert.equal(decision.requiresConfirmation, true);
  assert.equal(decision.policyMode, 'confirm_all');
  assert.equal(decision.policyReason, 'confirm_all_requires_confirmation');
  assert.equal(decision.confirmationBypassed, false);
  assert.equal(decision.bypassReason, null);
});

test('policy decision shape exposes requiresConfirmation, policyMode, and policyReason', () => {
  const decision = evaluateDelegationPolicy({ policyMode: 'confirm_all' });

  assert.equal(typeof decision.requiresConfirmation, 'boolean');
  assert.equal(typeof decision.policyMode, 'string');
  assert.equal(typeof decision.policyReason, 'string');
});

test('future-safe modes are accepted but not publicly enabled yet', () => {
  assert.equal(resolveDelegationPolicyMode('confirm_paid_only'), 'confirm_paid_only');
  assert.equal(resolveDelegationPolicyMode('auto_when_safe'), 'auto_when_safe');

  const decision = evaluateDelegationPolicy({ policyMode: 'confirm_paid_only' });
  assert.equal(decision.requestedPolicyMode, 'confirm_paid_only');
  assert.equal(decision.policyMode, 'confirm_all');
  assert.equal(decision.requiresConfirmation, true);
  assert.equal(decision.policyReason, 'policy_mode_not_publicly_enabled');
});
