import { promises as fs } from 'node:fs';
import path from 'node:path';

import { resolveMetabotPaths, type MetabotPaths } from '../state/paths';
import type {
  SkillEvolutionIndex,
  SkillExecutionAnalysis,
  SkillExecutionRecord,
  SkillVariantArtifact,
} from './types';

const EVOLUTION_SCHEMA_VERSION = 1 as const;

function createEmptyIndex(): SkillEvolutionIndex {
  return {
    schemaVersion: EVOLUTION_SCHEMA_VERSION,
    executions: [],
    analyses: [],
    artifacts: [],
    activeVariants: {},
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function normalizeStringList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return [...new Set(value.filter((item): item is string => typeof item === 'string'))].sort();
}

function normalizeActiveVariants(value: unknown): Record<string, string> {
  if (!isRecord(value)) {
    return {};
  }

  const entries: Array<[string, string]> = [];
  for (const [skillName, variantId] of Object.entries(value)) {
    if (typeof skillName === 'string' && typeof variantId === 'string') {
      entries.push([skillName, variantId]);
    }
  }

  return Object.fromEntries(entries.sort(([left], [right]) => left.localeCompare(right)));
}

function normalizeIndex(value: unknown): SkillEvolutionIndex {
  if (!isRecord(value)) {
    return createEmptyIndex();
  }

  return {
    schemaVersion: EVOLUTION_SCHEMA_VERSION,
    executions: normalizeStringList(value.executions),
    analyses: normalizeStringList(value.analyses),
    artifacts: normalizeStringList(value.artifacts),
    activeVariants: normalizeActiveVariants(value.activeVariants),
  };
}

async function readJsonFile<T>(filePath: string): Promise<T | null> {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw) as T;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

async function writeJsonAtomic(filePath: string, value: unknown): Promise<string> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tempPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  await fs.rename(tempPath, filePath);
  return filePath;
}

function addIdentifier(values: string[], identifier: string): string[] {
  return normalizeStringList([...values, identifier]);
}

async function ensureEvolutionLayout(paths: MetabotPaths): Promise<void> {
  await fs.mkdir(paths.evolutionExecutionsRoot, { recursive: true });
  await fs.mkdir(paths.evolutionAnalysesRoot, { recursive: true });
  await fs.mkdir(paths.evolutionArtifactsRoot, { recursive: true });
}

export interface LocalEvolutionStore {
  paths: MetabotPaths;
  ensureLayout(): Promise<MetabotPaths>;
  readIndex(): Promise<SkillEvolutionIndex>;
  writeExecution(record: SkillExecutionRecord): Promise<string>;
  writeAnalysis(record: SkillExecutionAnalysis): Promise<string>;
  writeArtifact(record: SkillVariantArtifact): Promise<string>;
  setActiveVariant(skillName: string, variantId: string): Promise<SkillEvolutionIndex>;
}

export function createLocalEvolutionStore(homeDirOrPaths: string | MetabotPaths): LocalEvolutionStore {
  const paths = typeof homeDirOrPaths === 'string' ? resolveMetabotPaths(homeDirOrPaths) : homeDirOrPaths;

  async function updateIndex(
    updater: (current: SkillEvolutionIndex) => SkillEvolutionIndex
  ): Promise<SkillEvolutionIndex> {
    await ensureEvolutionLayout(paths);
    const current = normalizeIndex(await readJsonFile<SkillEvolutionIndex>(paths.evolutionIndexPath));
    const next = normalizeIndex(updater(current));
    await writeJsonAtomic(paths.evolutionIndexPath, next);
    return next;
  }

  return {
    paths,
    async ensureLayout() {
      await ensureEvolutionLayout(paths);
      return paths;
    },
    async readIndex() {
      await ensureEvolutionLayout(paths);
      return normalizeIndex(await readJsonFile<SkillEvolutionIndex>(paths.evolutionIndexPath));
    },
    async writeExecution(record) {
      await ensureEvolutionLayout(paths);
      const filePath = path.join(paths.evolutionExecutionsRoot, `${record.executionId}.json`);
      await writeJsonAtomic(filePath, record);
      await updateIndex((current) => ({
        ...current,
        executions: addIdentifier(current.executions, record.executionId),
      }));
      return filePath;
    },
    async writeAnalysis(record) {
      await ensureEvolutionLayout(paths);
      const filePath = path.join(paths.evolutionAnalysesRoot, `${record.analysisId}.json`);
      await writeJsonAtomic(filePath, record);
      await updateIndex((current) => ({
        ...current,
        analyses: addIdentifier(current.analyses, record.analysisId),
      }));
      return filePath;
    },
    async writeArtifact(record) {
      await ensureEvolutionLayout(paths);
      const filePath = path.join(paths.evolutionArtifactsRoot, `${record.variantId}.json`);
      await writeJsonAtomic(filePath, record);
      await updateIndex((current) => ({
        ...current,
        artifacts: addIdentifier(current.artifacts, record.variantId),
      }));
      return filePath;
    },
    async setActiveVariant(skillName, variantId) {
      return updateIndex((current) => ({
        ...current,
        activeVariants: normalizeActiveVariants({
          ...current.activeVariants,
          [skillName]: variantId,
        }),
      }));
    },
  };
}
