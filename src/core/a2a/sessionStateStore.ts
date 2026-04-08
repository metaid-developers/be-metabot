import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { MetabotPaths } from '../state/paths';
import { resolveMetabotPaths } from '../state/paths';
import type { A2ASessionRecord, A2ASessionRole, A2ATaskRunRecord } from './sessionTypes';
import type { PublicStatus } from './publicStatus';
import { ensureHotLayout } from '../state/runtimeStateStore';

const SESSION_STATE_FILENAME = 'a2a-session-state.json';

export type A2ATranscriptSender = 'caller' | 'provider' | 'system';
export type A2ALoopCursor = string | number | null;

export interface A2ALoopCursors {
  caller: A2ALoopCursor;
  provider: A2ALoopCursor;
}

export interface A2ATranscriptItemRecord {
  id: string;
  sessionId: string;
  taskRunId?: string | null;
  timestamp: number;
  type: string;
  sender: A2ATranscriptSender;
  content: string;
  metadata?: Record<string, unknown> | null;
}

export interface A2APublicStatusSnapshot {
  sessionId: string;
  taskRunId?: string | null;
  status: PublicStatus | null;
  mapped: boolean;
  rawEvent?: string | null;
  resolvedAt: number;
}

export interface A2ASessionStoreState {
  sessions: A2ASessionRecord[];
  taskRuns: A2ATaskRunRecord[];
  transcriptItems: A2ATranscriptItemRecord[];
  cursors: A2ALoopCursors;
  publicStatusSnapshots: A2APublicStatusSnapshot[];
}

export interface A2ASessionStateStore {
  paths: MetabotPaths;
  sessionStatePath: string;
  ensureLayout(): Promise<MetabotPaths>;
  readState(): Promise<A2ASessionStoreState>;
  writeState(nextState: A2ASessionStoreState): Promise<A2ASessionStoreState>;
  updateState(
    updater: (currentState: A2ASessionStoreState) => A2ASessionStoreState | Promise<A2ASessionStoreState>
  ): Promise<A2ASessionStoreState>;
  writeSession(record: A2ASessionRecord): Promise<A2ASessionRecord>;
  writeTaskRun(record: A2ATaskRunRecord): Promise<A2ATaskRunRecord>;
  appendTranscriptItems(items: A2ATranscriptItemRecord[]): Promise<A2ATranscriptItemRecord[]>;
  appendPublicStatusSnapshots(
    items: A2APublicStatusSnapshot[]
  ): Promise<A2APublicStatusSnapshot[]>;
  setLoopCursor(role: A2ASessionRole, cursor: A2ALoopCursor): Promise<A2ALoopCursor>;
  readLoopCursor(role: A2ASessionRole): Promise<A2ALoopCursor>;
}

function cloneEmptyState(): A2ASessionStoreState {
  return {
    sessions: [],
    taskRuns: [],
    transcriptItems: [],
    cursors: {
      caller: null,
      provider: null,
    },
    publicStatusSnapshots: [],
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

function normalizeLoopCursors(raw: Partial<A2ALoopCursors> | null | undefined): A2ALoopCursors {
  const normalizeCursor = (value: unknown): A2ALoopCursor => {
    if (typeof value === 'string' || typeof value === 'number') {
      return value;
    }
    return null;
  };

  return {
    caller: normalizeCursor(raw?.caller),
    provider: normalizeCursor(raw?.provider),
  };
}

function normalizeState(value: A2ASessionStoreState | null): A2ASessionStoreState {
  if (!value || typeof value !== 'object') {
    return cloneEmptyState();
  }

  return {
    sessions: Array.isArray(value.sessions) ? value.sessions : [],
    taskRuns: Array.isArray(value.taskRuns) ? value.taskRuns : [],
    transcriptItems: Array.isArray(value.transcriptItems) ? value.transcriptItems : [],
    cursors: normalizeLoopCursors(value.cursors),
    publicStatusSnapshots: Array.isArray(value.publicStatusSnapshots)
      ? value.publicStatusSnapshots
      : [],
  };
}

export function createSessionStateStore(homeDirOrPaths: string | MetabotPaths): A2ASessionStateStore {
  const paths =
    typeof homeDirOrPaths === 'string' ? resolveMetabotPaths(homeDirOrPaths) : homeDirOrPaths;
  const sessionStatePath = path.join(paths.hotRoot, SESSION_STATE_FILENAME);

  return {
    paths,
    sessionStatePath,
    async ensureLayout() {
      await ensureHotLayout(paths);
      return paths;
    },
    async readState() {
      await ensureHotLayout(paths);
      return normalizeState(await readJsonFile<A2ASessionStoreState>(sessionStatePath));
    },
    async writeState(nextState) {
      await ensureHotLayout(paths);
      const normalized = normalizeState(nextState);
      await fs.writeFile(sessionStatePath, `${JSON.stringify(normalized, null, 2)}\n`, 'utf8');
      return normalized;
    },
    async updateState(updater) {
      const current = await this.readState();
      const nextState = await updater(current);
      return this.writeState(nextState);
    },
    async writeSession(record) {
      await this.updateState(state => ({
        ...state,
        sessions: [...state.sessions.filter(session => session.sessionId !== record.sessionId), record],
      }));
      return record;
    },
    async writeTaskRun(record) {
      await this.updateState(state => ({
        ...state,
        taskRuns: [...state.taskRuns.filter(run => run.runId !== record.runId), record],
      }));
      return record;
    },
    async appendTranscriptItems(items) {
      if (!items.length) {
        return items;
      }
      await this.updateState(state => ({
        ...state,
        transcriptItems: [...state.transcriptItems, ...items],
      }));
      return items;
    },
    async appendPublicStatusSnapshots(items) {
      if (!items.length) {
        return items;
      }
      await this.updateState(state => ({
        ...state,
        publicStatusSnapshots: [...state.publicStatusSnapshots, ...items],
      }));
      return items;
    },
    async setLoopCursor(role, cursor) {
      await this.updateState(state => ({
        ...state,
        cursors: {
          ...state.cursors,
          [role]: cursor,
        },
      }));
      return cursor;
    },
    async readLoopCursor(role) {
      const state = await this.readState();
      return state.cursors[role];
    },
  };
}
