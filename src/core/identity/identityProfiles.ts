import fs from 'node:fs';
import { promises as fsp } from 'node:fs';
import path from 'node:path';

const MANAGER_DIR = 'manager';
const PROFILES_FILE = 'identity-profiles.json';
const ACTIVE_HOME_FILE = 'active-home.json';

export interface IdentityManagerPaths {
  managerRoot: string;
  profilesPath: string;
  activeHomePath: string;
}

export interface IdentityProfileRecord {
  name: string;
  homeDir: string;
  globalMetaId: string;
  mvcAddress: string;
  createdAt: number;
  updatedAt: number;
}

export interface IdentityProfilesState {
  profiles: IdentityProfileRecord[];
}

function normalizeText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
  }
  return value;
}

function normalizeRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function normalizeProfileRecord(value: unknown): IdentityProfileRecord | null {
  const record = normalizeRecord(value);
  if (!record) {
    return null;
  }

  const name = normalizeText(record.name);
  const homeDirRaw = normalizeText(record.homeDir);
  const homeDir = homeDirRaw ? path.resolve(homeDirRaw) : '';
  const globalMetaId = normalizeText(record.globalMetaId);
  const mvcAddress = normalizeText(record.mvcAddress);
  const createdAt = toFiniteNumber(record.createdAt) ?? Date.now();
  const updatedAt = toFiniteNumber(record.updatedAt) ?? createdAt;

  if (!name || !homeDir) {
    return null;
  }

  return {
    name,
    homeDir,
    globalMetaId,
    mvcAddress,
    createdAt,
    updatedAt,
  };
}

function sortProfiles(profiles: IdentityProfileRecord[]): IdentityProfileRecord[] {
  return [...profiles].sort((left, right) => {
    if (right.updatedAt !== left.updatedAt) {
      return right.updatedAt - left.updatedAt;
    }
    return left.name.localeCompare(right.name);
  });
}

function normalizeProfilesState(value: unknown): IdentityProfilesState {
  const record = normalizeRecord(value);
  if (!record) {
    return { profiles: [] };
  }

  const profiles = Array.isArray(record.profiles)
    ? record.profiles
      .map((entry) => normalizeProfileRecord(entry))
      .filter((entry): entry is IdentityProfileRecord => Boolean(entry))
    : [];

  const dedupedByHome = new Map<string, IdentityProfileRecord>();
  for (const profile of profiles) {
    const current = dedupedByHome.get(profile.homeDir);
    if (!current || profile.updatedAt >= current.updatedAt) {
      dedupedByHome.set(profile.homeDir, profile);
    }
  }

  return {
    profiles: sortProfiles([...dedupedByHome.values()]),
  };
}

async function readJsonFile<T>(filePath: string): Promise<T | null> {
  try {
    const raw = await fsp.readFile(filePath, 'utf8');
    return JSON.parse(raw) as T;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

async function ensureManagerRoot(paths: IdentityManagerPaths): Promise<void> {
  await fsp.mkdir(paths.managerRoot, { recursive: true });
}

export function resolveIdentityManagerPaths(systemHomeDir: string): IdentityManagerPaths {
  const normalizedSystemHome = normalizeText(systemHomeDir);
  if (!normalizedSystemHome) {
    throw new Error('A system home directory is required to resolve identity manager paths.');
  }

  const managerRoot = path.join(path.resolve(normalizedSystemHome), '.metabot', MANAGER_DIR);
  return {
    managerRoot,
    profilesPath: path.join(managerRoot, PROFILES_FILE),
    activeHomePath: path.join(managerRoot, ACTIVE_HOME_FILE),
  };
}

export async function readIdentityProfilesState(systemHomeDir: string): Promise<IdentityProfilesState> {
  const paths = resolveIdentityManagerPaths(systemHomeDir);
  await ensureManagerRoot(paths);
  const parsed = await readJsonFile<unknown>(paths.profilesPath);
  return normalizeProfilesState(parsed);
}

async function writeIdentityProfilesState(
  systemHomeDir: string,
  state: IdentityProfilesState,
): Promise<IdentityProfilesState> {
  const paths = resolveIdentityManagerPaths(systemHomeDir);
  await ensureManagerRoot(paths);
  const normalized = normalizeProfilesState(state);
  await fsp.writeFile(paths.profilesPath, `${JSON.stringify(normalized, null, 2)}\n`, 'utf8');
  return normalized;
}

export async function listIdentityProfiles(systemHomeDir: string): Promise<IdentityProfileRecord[]> {
  const state = await readIdentityProfilesState(systemHomeDir);
  return state.profiles;
}

export async function upsertIdentityProfile(input: {
  systemHomeDir: string;
  name: string;
  homeDir: string;
  globalMetaId?: string;
  mvcAddress?: string;
  now?: () => number;
}): Promise<IdentityProfileRecord> {
  const now = input.now ?? Date.now;
  const name = normalizeText(input.name);
  const homeDir = path.resolve(normalizeText(input.homeDir));
  const globalMetaId = normalizeText(input.globalMetaId);
  const mvcAddress = normalizeText(input.mvcAddress);
  if (!name || !homeDir) {
    throw new Error('Identity profile upsert requires both name and homeDir.');
  }

  const current = await readIdentityProfilesState(input.systemHomeDir);
  const timestamp = now();
  let updated: IdentityProfileRecord | null = null;

  const nextProfiles = current.profiles.map((profile) => {
    if (
      profile.homeDir === homeDir
      || (globalMetaId && profile.globalMetaId && profile.globalMetaId === globalMetaId)
    ) {
      updated = {
        ...profile,
        name,
        homeDir,
        globalMetaId: globalMetaId || profile.globalMetaId,
        mvcAddress: mvcAddress || profile.mvcAddress,
        updatedAt: timestamp,
      };
      return updated;
    }
    return profile;
  });

  if (!updated) {
    updated = {
      name,
      homeDir,
      globalMetaId,
      mvcAddress,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    nextProfiles.push(updated);
  }

  await writeIdentityProfilesState(input.systemHomeDir, {
    profiles: nextProfiles,
  });

  return updated;
}

function parseActiveHomePayload(value: unknown): string | null {
  const record = normalizeRecord(value);
  if (!record) {
    return null;
  }
  const homeDirRaw = normalizeText(record.homeDir);
  if (!homeDirRaw) {
    return null;
  }
  return path.resolve(homeDirRaw);
}

export function readActiveMetabotHomeSync(systemHomeDir: string): string | null {
  const paths = resolveIdentityManagerPaths(systemHomeDir);
  try {
    const raw = fs.readFileSync(paths.activeHomePath, 'utf8');
    const parsed = JSON.parse(raw) as unknown;
    return parseActiveHomePayload(parsed);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ENOENT' || error instanceof SyntaxError) {
      return null;
    }
    return null;
  }
}

export async function readActiveMetabotHome(systemHomeDir: string): Promise<string | null> {
  const paths = resolveIdentityManagerPaths(systemHomeDir);
  await ensureManagerRoot(paths);
  const parsed = await readJsonFile<unknown>(paths.activeHomePath);
  return parseActiveHomePayload(parsed);
}

export async function setActiveMetabotHome(input: {
  systemHomeDir: string;
  homeDir: string;
  now?: () => number;
}): Promise<string> {
  const now = input.now ?? Date.now;
  const homeDir = path.resolve(normalizeText(input.homeDir));
  if (!homeDir) {
    throw new Error('Active metabot home requires a non-empty homeDir.');
  }

  const paths = resolveIdentityManagerPaths(input.systemHomeDir);
  await ensureManagerRoot(paths);
  await fsp.writeFile(
    paths.activeHomePath,
    `${JSON.stringify({ homeDir, updatedAt: now() }, null, 2)}\n`,
    'utf8',
  );
  return homeDir;
}
