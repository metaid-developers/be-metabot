import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const { getBaseSkillContract } = require('../../dist/core/skills/baseSkillRegistry.js');
const { evaluateSkillAdoption } = require('../../dist/core/evolution/adoptionPolicy.js');

function createCandidateVariant(scopeOverrides = {}) {
  const base = getBaseSkillContract('metabot-network-directory');
  return {
    variantId: 'variant-candidate-1',
    skillName: 'metabot-network-directory',
    status: 'inactive',
    scope: {
      ...base.scope,
      ...scopeOverrides,
    },
    metadata: {
      sameSkill: true,
      sameScope: true,
      scopeHash: 'scope-hash-v1',
    },
    patch: {
      instructionsPatch: 'Prefer machine payload before opening UI.',
    },
    lineage: {
      lineageId: 'lineage-1',
      parentVariantId: null,
      rootVariantId: 'variant-candidate-1',
      executionId: 'exec-1',
      analysisId: 'analysis-1',
      createdAt: 1_744_444_445_000,
    },
    verification: {
      passed: true,
      checkedAt: 1_744_444_446_000,
      protocolCompatible: true,
      replayValid: true,
      notWorseThanBase: true,
    },
    adoption: 'manual',
    createdAt: 1_744_444_446_500,
    updatedAt: 1_744_444_446_500,
  };
}

test('adoption policy auto-adopts same-skill same-scope candidates', () => {
  const base = getBaseSkillContract('metabot-network-directory');
  const candidate = createCandidateVariant();

  const decision = evaluateSkillAdoption({
    activeSkillName: base.skillName,
    activeScope: base.scope,
    candidate,
  });

  assert.equal(decision.autoAdopt, true);
  assert.equal(decision.status, 'active');
  assert.equal(decision.adoption, 'active');
});

test('adoption policy leaves widened-scope candidates non-active for manual adoption', () => {
  const base = getBaseSkillContract('metabot-network-directory');
  const candidate = createCandidateVariant({
    chainWrite: true,
  });

  const decision = evaluateSkillAdoption({
    activeSkillName: base.skillName,
    activeScope: base.scope,
    candidate,
  });

  assert.equal(decision.autoAdopt, false);
  assert.equal(decision.status, 'inactive');
  assert.equal(decision.adoption, 'manual');
});
