import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { VaultPaths } from "../core/paths.js";

export interface GraphState {
  mode: string;
  layout: Record<string, { x: number; y: number; pinned?: boolean }>;
  pinned: string[];
  collapsed: string[];
  clusterBy: "type" | "space" | "trust" | "sensitivity";
  updatedAt: string;
}

const defaultGraphState: GraphState = {
  mode: "all",
  layout: {},
  pinned: [],
  collapsed: [],
  clusterBy: "type",
  updatedAt: new Date(0).toISOString()
};

export function readGraphState(paths: VaultPaths): GraphState {
  const statePath = graphStatePath(paths);
  if (!existsSync(statePath)) {
    return { ...defaultGraphState };
  }
  try {
    return { ...defaultGraphState, ...(JSON.parse(readFileSync(statePath, "utf8")) as Partial<GraphState>) };
  } catch {
    return { ...defaultGraphState };
  }
}

export function writeGraphState(paths: VaultPaths, patch: Partial<GraphState>): GraphState {
  const next: GraphState = {
    ...readGraphState(paths),
    ...patch,
    layout: patch.layout ?? readGraphState(paths).layout,
    pinned: uniqueStrings(patch.pinned ?? readGraphState(paths).pinned),
    collapsed: uniqueStrings(patch.collapsed ?? readGraphState(paths).collapsed),
    clusterBy: normalizeCluster(patch.clusterBy),
    updatedAt: new Date().toISOString()
  };
  mkdirSync(join(paths.root, "state"), { recursive: true });
  writeFileSync(graphStatePath(paths), JSON.stringify(next, null, 2), "utf8");
  return next;
}

function graphStatePath(paths: VaultPaths): string {
  return join(paths.root, "state", "graph-state.json");
}

function uniqueStrings(values: unknown): string[] {
  return Array.isArray(values) ? Array.from(new Set(values.map(String).filter(Boolean))) : [];
}

function normalizeCluster(value: unknown): GraphState["clusterBy"] {
  return value === "space" || value === "trust" || value === "sensitivity" || value === "type"
    ? value
    : "type";
}
