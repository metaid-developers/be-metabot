import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const require = createRequire(import.meta.url);
const { createConfigStore } = require('../../dist/core/config/configStore.js');

async function withTempHome(action) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'metabot-config-'));
  const previousHome = process.env.METABOT_HOME;
  process.env.METABOT_HOME = tempDir;
  try {
    await action(tempDir);
  } finally {
    process.env.METABOT_HOME = previousHome;
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

test('createConfigStore defaults to evolution_network enabled true and persists updates', async () => {
  await withTempHome(async () => {
    const store = createConfigStore();
    const defaults = await store.read();
    assert.strictEqual(defaults.evolution_network.enabled, true);

    const updated = {
      evolution_network: {
        enabled: false,
        autoAdoptSameSkillSameScope: true,
        autoRecordExecutions: true
      }
    };

    await store.set(updated);
    const reloaded = await store.read();
    assert.deepEqual(reloaded, updated);
  });
});
