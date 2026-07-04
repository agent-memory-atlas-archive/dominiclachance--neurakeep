import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { VaultPaths } from "../core/paths.js";

export interface PersistedWatcherRun {
  at: string;
  profileId?: string;
  folders: string[];
  recursive: boolean;
  ok: boolean;
  ingested: number;
  proposals: number;
  error?: string;
}

export interface PersistedWatcherState {
  running: boolean;
  folders: string[];
  debounceMs: number;
  recursive: boolean;
  profileId?: string;
  startedAt?: string;
  stoppedAt?: string;
  runCount: number;
  history: PersistedWatcherRun[];
}

export function readPersistedWatcherState(paths: VaultPaths): PersistedWatcherState {
  const fallback: PersistedWatcherState = {
    running: false,
    folders: [],
    debounceMs: 1500,
    recursive: false,
    runCount: 0,
    history: []
  };
  const file = watcherStatePath(paths);
  if (!existsSync(file)) {
    return fallback;
  }
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8")) as Partial<PersistedWatcherState>;
    return {
      ...fallback,
      ...parsed,
      folders: Array.isArray(parsed.folders) ? parsed.folders.map(String) : [],
      history: Array.isArray(parsed.history) ? parsed.history.slice(-50) as PersistedWatcherRun[] : []
    };
  } catch {
    return fallback;
  }
}

export function writePersistedWatcherState(paths: VaultPaths, state: PersistedWatcherState): PersistedWatcherState {
  const file = watcherStatePath(paths);
  mkdirSync(dirname(file), { recursive: true });
  const normalized = { ...state, history: (state.history ?? []).slice(-50) };
  writeFileSync(file, `${JSON.stringify(normalized, null, 2)}\n`, "utf8");
  return normalized;
}

export function appendWatcherHistory(paths: VaultPaths, run: PersistedWatcherRun): PersistedWatcherState {
  const state = readPersistedWatcherState(paths);
  return writePersistedWatcherState(paths, {
    ...state,
    runCount: (state.runCount ?? 0) + 1,
    history: [...(state.history ?? []), run].slice(-50)
  });
}

function watcherStatePath(paths: VaultPaths): string {
  return join(paths.root, "state", "watcher-state.json");
}
