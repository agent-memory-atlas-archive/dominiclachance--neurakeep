import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { VaultPaths } from "../core/paths.js";
import type { ExtractionScore } from "./extraction-eval.js";

export interface ExtractionReport {
  id: string;
  proposalId: string;
  sourceId?: string;
  extractor: "deterministic" | "command" | "unknown";
  createdAt: string;
  score: ExtractionScore;
}

export function recordExtractionReport(
  paths: VaultPaths,
  report: Omit<ExtractionReport, "id" | "createdAt">
): ExtractionReport {
  const row: ExtractionReport = {
    ...report,
    id: `eval_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString()
  };
  const rows = listExtractionReports(paths);
  writeReports(paths, [...rows, row].slice(-250));
  return row;
}

export function listExtractionReports(paths: VaultPaths): ExtractionReport[] {
  const file = reportsPath(paths);
  if (!existsSync(file)) {
    return [];
  }
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8")) as unknown;
    return Array.isArray(parsed) ? parsed as ExtractionReport[] : [];
  } catch {
    return [];
  }
}

function writeReports(paths: VaultPaths, rows: ExtractionReport[]): void {
  const file = reportsPath(paths);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(rows, null, 2)}\n`, "utf8");
}

function reportsPath(paths: VaultPaths): string {
  return join(paths.root, "logs", "extraction-evals.json");
}
