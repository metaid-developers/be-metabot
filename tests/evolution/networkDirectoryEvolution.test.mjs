import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const { getBaseSkillContract } = require('../../dist/core/skills/baseSkillRegistry.js');
const {
  classifyNetworkDirectoryExecution,
} = require('../../dist/core/evolution/skills/networkDirectory/failureClassifier.js');
const {
  generateNetworkDirectoryFixCandidate,
} = require('../../dist/core/evolution/skills/networkDirectory/fixGenerator.js');
const {
  validateNetworkDirectoryFixCandidate,
} = require('../../dist/core/evolution/skills/networkDirectory/validator.js');

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

  const invalidServicesShape = classifyNetworkDirectoryExecution({
    execution: createExecutionRecord({
      envelope: {
        state: 'succeeded',
        data: {
          services: 'not-an-array',
        },
      },
    }),
  });
  assert.equal(invalidServicesShape.completed, false);
  assert.equal(invalidServicesShape.failureClass, 'hard_failure');
  assert.equal(invalidServicesShape.isEvolutionCandidate, true);
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

  const emptyServicesClassification = classifyNetworkDirectoryExecution({
    execution: createExecutionRecord({
      envelope: {
        state: 'succeeded',
        data: {
          services: [],
        },
      },
    }),
  });
  assert.equal(emptyServicesClassification.completed, false);
  assert.equal(emptyServicesClassification.failureClass, 'soft_failure');
  assert.equal(emptyServicesClassification.isEvolutionCandidate, true);
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

test('FIX generator keeps manual-recovery fallback policy generic and preserves lineage root when parent exists', () => {
  const base = getBaseSkillContract('metabot-network-directory');
  const execution = createExecutionRecord({
    executionId: 'execution-manual-recovery',
    activeVariantId: 'variant-parent-1',
    usedUiFallback: true,
  });
  const classification = classifyNetworkDirectoryExecution({
    execution,
  });
  const candidate = generateNetworkDirectoryFixCandidate({
    baseContract: base,
    execution,
    classification,
    analysisId: 'analysis-manual-1',
    now: 1_744_444_550_000,
  });

  assert.equal(candidate.lineage.parentVariantId, 'variant-parent-1');
  assert.equal(candidate.lineage.rootVariantId, 'variant-parent-1');
  assert.equal(candidate.patch.fallbackPolicyPatch.includes('metabot'), false);
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

test('validator rejects hard/soft trigger candidates when replay still requires manual recovery', () => {
  const base = getBaseSkillContract('metabot-network-directory');
  const triggeringExecution = createExecutionRecord({
    executionId: 'execution-hard-fail-manual-replay',
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
    analysisId: 'analysis-hard-manual-replay',
    now: 1_744_444_620_000,
  });
  const manualReplayResult = validateNetworkDirectoryFixCandidate({
    baseContract: base,
    candidate,
    triggerFailureClass: 'hard_failure',
    replayExecution: createExecutionRecord({
      executionId: 'execution-replay-manual-recovery',
      usedUiFallback: true,
    }),
  });

  assert.equal(manualReplayResult.passed, false);
  assert.equal(manualReplayResult.replayValid, false);
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

test('validator rejects malformed patch value types even when keys are allowed', () => {
  const base = getBaseSkillContract('metabot-network-directory');
  const triggeringExecution = createExecutionRecord({
    executionId: 'execution-for-malformed-patch',
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
    analysisId: 'analysis-malformed-patch',
    now: 1_744_444_710_000,
  });
  candidate.patch.instructionsPatch = 42;

  const result = validateNetworkDirectoryFixCandidate({
    baseContract: base,
    candidate,
    triggerFailureClass: 'hard_failure',
    replayExecution: createExecutionRecord({
      executionId: 'execution-replay-after-malformed-patch',
    }),
  });

  assert.equal(result.passed, false);
  assert.equal(result.protocolCompatible, false);
});
