import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const { getBaseSkillContract } = require('../../dist/core/skills/baseSkillRegistry.js');
const { evaluateSkillAdoption } = require('../../dist/core/evolution/adoptionPolicy.js');
const {
  classifyNetworkDirectoryExecution,
} = require('../../dist/core/evolution/skills/networkDirectory/failureClassifier.js');
const {
  generateNetworkDirectoryFixCandidate,
} = require('../../dist/core/evolution/skills/networkDirectory/fixGenerator.js');
const {
  validateNetworkDirectoryFixCandidate,
} = require('../../dist/core/evolution/skills/networkDirectory/validator.js');

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

function createExecutionRecord(overrides = {}) {
  return {
    executionId: 'execution-1',
    skillName: 'metabot-network-directory',
    activeVariantId: null,
    commandTemplate: 'metabot network services --online',
    startedAt: 1_744_444_440_000,
    finishedAt: 1_744_444_441_000,
    envelope: {
      state: 'succeeded',
      data: {
        services: [
          {
            servicePinId: 'pin-1',
            providerGlobalMetaId: 'metaid://provider-1',
          },
        ],
      },
    },
    stdout: '',
    stderr: '',
    usedUiFallback: false,
    manualRecovery: false,
    ...overrides,
  };
}

test('classifier returns hard_failure for failed state and invalid services envelope', () => {
  const failedState = classifyNetworkDirectoryExecution({
    execution: createExecutionRecord({
      envelope: {
        state: 'failed',
        data: {},
      },
    }),
  });
  assert.equal(failedState.completed, false);
  assert.equal(failedState.failureClass, 'hard_failure');
  assert.equal(failedState.isEvolutionCandidate, true);

  const missingServices = classifyNetworkDirectoryExecution({
    execution: createExecutionRecord({
      envelope: {
        state: 'succeeded',
        data: {},
      },
    }),
  });
  assert.equal(missingServices.completed, false);
  assert.equal(missingServices.failureClass, 'hard_failure');
  assert.equal(missingServices.isEvolutionCandidate, true);
});

test('classifier returns soft_failure when service rows are unusable for automation', () => {
  const classification = classifyNetworkDirectoryExecution({
    execution: createExecutionRecord({
      envelope: {
        state: 'succeeded',
        data: {
          services: [
            {
              servicePinId: 'pin-only',
            },
          ],
        },
      },
    }),
  });

  assert.equal(classification.completed, false);
  assert.equal(classification.failureClass, 'soft_failure');
  assert.equal(classification.isEvolutionCandidate, true);
});

test('classifier returns manual_recovery when UI fallback or repeated command repair is recorded', () => {
  const fallbackClassification = classifyNetworkDirectoryExecution({
    execution: createExecutionRecord({
      usedUiFallback: true,
    }),
  });

  assert.equal(fallbackClassification.completed, true);
  assert.equal(fallbackClassification.failureClass, 'manual_recovery');
  assert.equal(fallbackClassification.isEvolutionCandidate, true);

  const repeatedRepairClassification = classifyNetworkDirectoryExecution({
    execution: createExecutionRecord(),
    repairAttemptCount: 2,
  });

  assert.equal(repeatedRepairClassification.completed, true);
  assert.equal(repeatedRepairClassification.failureClass, 'manual_recovery');
  assert.equal(repeatedRepairClassification.isEvolutionCandidate, true);
});

test('FIX generator emits only allowed patch fields and preserves scope', () => {
  const base = getBaseSkillContract('metabot-network-directory');
  const execution = createExecutionRecord({
    envelope: {
      state: 'failed',
      data: {},
    },
  });
  const classification = classifyNetworkDirectoryExecution({
    execution,
  });
  const candidate = generateNetworkDirectoryFixCandidate({
    baseContract: base,
    execution,
    classification,
    analysisId: 'analysis-1',
    now: 1_744_444_500_000,
  });

  assert.ok(candidate);
  assert.equal(candidate.skillName, base.skillName);
  assert.deepEqual(candidate.scope, base.scope);

  const patchKeys = Object.keys(candidate.patch).sort();
  const allowedPatchKeys = [
    'instructionsPatch',
    'commandTemplatePatch',
    'outputExpectationPatch',
    'fallbackPolicyPatch',
  ].sort();

  assert.ok(patchKeys.length > 0);
  assert.equal(patchKeys.every((key) => allowedPatchKeys.includes(key)), true);
});

test('validator rejects widened scope and accepts candidates that solve the triggering case', () => {
  const base = getBaseSkillContract('metabot-network-directory');
  const triggeringExecution = createExecutionRecord({
    executionId: 'execution-hard-fail',
    envelope: {
      state: 'failed',
      data: {},
    },
  });
  const classification = classifyNetworkDirectoryExecution({
    execution: triggeringExecution,
  });
  const candidate = generateNetworkDirectoryFixCandidate({
    baseContract: base,
    execution: triggeringExecution,
    classification,
    analysisId: 'analysis-2',
    now: 1_744_444_600_000,
  });

  const solvedCase = validateNetworkDirectoryFixCandidate({
    baseContract: base,
    candidate,
    triggerFailureClass: 'hard_failure',
    replayExecution: createExecutionRecord({
      executionId: 'execution-replay-success',
    }),
  });

  assert.equal(solvedCase.passed, true);
  assert.equal(solvedCase.protocolCompatible, true);
  assert.equal(solvedCase.replayValid, true);
  assert.equal(solvedCase.notWorseThanBase, true);

  const widenedScopeCandidate = {
    ...candidate,
    scope: {
      ...candidate.scope,
      chainWrite: true,
    },
  };
  const widenedScopeResult = validateNetworkDirectoryFixCandidate({
    baseContract: base,
    candidate: widenedScopeCandidate,
    triggerFailureClass: 'hard_failure',
    replayExecution: createExecutionRecord({
      executionId: 'execution-replay-success-2',
    }),
  });

  assert.equal(widenedScopeResult.passed, false);
  assert.equal(widenedScopeResult.protocolCompatible, false);
});

test('validator rejects candidates that repeat the triggering failure class', () => {
  const base = getBaseSkillContract('metabot-network-directory');
  const triggeringExecution = createExecutionRecord({
    executionId: 'execution-soft-fail',
    envelope: {
      state: 'succeeded',
      data: {
        services: [
          {
            servicePinId: 'pin-only',
          },
        ],
      },
    },
  });
  const classification = classifyNetworkDirectoryExecution({
    execution: triggeringExecution,
  });
  const candidate = generateNetworkDirectoryFixCandidate({
    baseContract: base,
    execution: triggeringExecution,
    classification,
    analysisId: 'analysis-3',
    now: 1_744_444_700_000,
  });
  const repeatedFailureResult = validateNetworkDirectoryFixCandidate({
    baseContract: base,
    candidate,
    triggerFailureClass: 'soft_failure',
    replayExecution: createExecutionRecord({
      executionId: 'execution-replay-soft-fail',
      envelope: {
        state: 'succeeded',
        data: {
          services: [
            {
              servicePinId: 'pin-only',
            },
          ],
        },
      },
    }),
  });

  assert.equal(repeatedFailureResult.passed, false);
  assert.equal(repeatedFailureResult.replayValid, false);
});

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
