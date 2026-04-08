import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const { createLocalEvolutionStore } = require('../../dist/core/evolution/localEvolutionStore.js');

function createScope() {
  return {
    allowedCommands: ['metabot network services --online', 'metabot ui open --page hub'],
    chainRead: true,
    chainWrite: false,
    localUiOpen: true,
    remoteDelegation: false,
  };
}

function createExecutionRecord() {
  return {
    executionId: 'exec-1',
    skillName: 'metabot-network-directory',
    activeVariantId: null,
    commandTemplate: 'metabot network services --online --json',
    startedAt: 1_744_444_444_000,
    finishedAt: 1_744_444_444_500,
    envelope: {
      state: 'failed',
    },
    stdout: '',
    stderr: 'missing data.services',
    usedUiFallback: false,
    manualRecovery: false,
  };
}

function createAnalysisRecord() {
  return {
    analysisId: 'analysis-1',
    executionId: 'exec-1',
    skillName: 'metabot-network-directory',
    triggerSource: 'hard_failure',
    evolutionType: 'FIX',
    shouldGenerateCandidate: true,
    summary: 'command returned a failed envelope',
    analyzedAt: 1_744_444_445_000,
  };
}

function createArtifactRecord() {
  return {
    variantId: 'variant-1',
    skillName: 'metabot-network-directory',
    status: 'inactive',
    scope: createScope(),
    metadata: {
      sameSkill: true,
      sameScope: true,
      scopeHash: 'scope-hash-v1',
    },
    patch: {
      instructionsPatch: 'Read machine output first and only open UI when explicitly requested.',
    },
    lineage: {
      lineageId: 'lineage-1',
      parentVariantId: null,
      rootVariantId: 'variant-1',
      executionId: 'exec-1',
      analysisId: 'analysis-1',
      createdAt: 1_744_444_445_500,
    },
    verification: {
      passed: true,
      checkedAt: 1_744_444_446_000,
      protocolCompatible: true,
      replayValid: true,
      notWorseThanBase: true,
      notes: 'fixture replay no longer fails',
    },
    adoption: 'manual',
    createdAt: 1_744_444_446_500,
    updatedAt: 1_744_444_446_500,
  };
}

test('local evolution store persists execution, analysis, artifact, and index under ~/.metabot/evolution', async () => {
  const homeDir = mkdtempSync(path.join(tmpdir(), 'metabot-evolution-store-'));
  const store = createLocalEvolutionStore(homeDir);
  const execution = createExecutionRecord();
  const analysis = createAnalysisRecord();
  const artifact = createArtifactRecord();

  await store.writeExecution(execution);
  await store.writeAnalysis(analysis);
  await store.writeArtifact(artifact);
  await store.setActiveVariant(artifact.skillName, artifact.variantId);

  const executionPath = path.join(store.paths.evolutionExecutionsRoot, `${execution.executionId}.json`);
  const analysisPath = path.join(store.paths.evolutionAnalysesRoot, `${analysis.analysisId}.json`);
  const artifactPath = path.join(store.paths.evolutionArtifactsRoot, `${artifact.variantId}.json`);

  assert.deepEqual(JSON.parse(readFileSync(executionPath, 'utf8')), execution);
  assert.deepEqual(JSON.parse(readFileSync(analysisPath, 'utf8')), analysis);
  assert.deepEqual(JSON.parse(readFileSync(artifactPath, 'utf8')), artifact);

  const indexFromFile = JSON.parse(readFileSync(store.paths.evolutionIndexPath, 'utf8'));
  assert.deepEqual(indexFromFile.executions, [execution.executionId]);
  assert.deepEqual(indexFromFile.analyses, [analysis.analysisId]);
  assert.deepEqual(indexFromFile.artifacts, [artifact.variantId]);
  assert.equal(indexFromFile.activeVariants['metabot-network-directory'], artifact.variantId);
});

test('local evolution store keeps deterministic, append-safe index updates and active mapping', async () => {
  const homeDir = mkdtempSync(path.join(tmpdir(), 'metabot-evolution-store-'));
  const store = createLocalEvolutionStore(homeDir);
  const execution = createExecutionRecord();
  const analysis = createAnalysisRecord();
  const artifact = createArtifactRecord();
  const newerArtifact = {
    ...artifact,
    variantId: 'variant-2',
    createdAt: 1_744_444_447_000,
    updatedAt: 1_744_444_447_000,
  };

  await store.writeExecution(execution);
  await store.writeExecution(execution);
  await store.writeAnalysis(analysis);
  await store.writeAnalysis(analysis);
  await store.writeArtifact(artifact);
  await store.writeArtifact(artifact);
  await store.writeArtifact(newerArtifact);
  await store.setActiveVariant(artifact.skillName, artifact.variantId);
  await store.setActiveVariant(artifact.skillName, newerArtifact.variantId);

  const index = await store.readIndex();
  assert.deepEqual(index.executions, [execution.executionId]);
  assert.deepEqual(index.analyses, [analysis.analysisId]);
  assert.deepEqual(index.artifacts, [artifact.variantId, newerArtifact.variantId]);
  assert.equal(index.activeVariants['metabot-network-directory'], newerArtifact.variantId);
});
