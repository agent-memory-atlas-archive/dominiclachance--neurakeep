import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createId } from "../core/ids.js";
import type { VaultPaths } from "../core/paths.js";
import type { UmosDatabase } from "../db/client.js";

export interface GovernorAuditEntry {
  id: string;
  createdAt: string;
  action: string;
  targetIds: string[];
  before: Record<string, unknown>[];
  after: Record<string, unknown>[];
  undoable: boolean;
}

export function recordGovernorAudit(
  paths: VaultPaths,
  entry: Omit<GovernorAuditEntry, "id" | "createdAt" | "undoable">
): GovernorAuditEntry {
  const full: GovernorAuditEntry = {
    ...entry,
    id: createId("gov"),
    createdAt: new Date().toISOString(),
    undoable: entry.before.length > 0
  };
  mkdirSync(join(paths.root, "logs"), { recursive: true });
  appendFileSync(auditPath(paths), `${JSON.stringify(full)}\n`, "utf8");
  return full;
}

export function listGovernorAudit(paths: VaultPaths, limit = 50): GovernorAuditEntry[] {
  if (!existsSync(auditPath(paths))) {
    return [];
  }
  return readFileSync(auditPath(paths), "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line) as GovernorAuditEntry)
    .slice(-limit)
    .reverse();
}

export function undoGovernorAudit(db: UmosDatabase, paths: VaultPaths, auditId: string): Record<string, unknown> {
  const entries = listGovernorAudit(paths, 500);
  const entry = entries.find((item) => item.id === auditId);
  if (!entry || !entry.undoable) {
    throw new Error(`Governor audit entry is not undoable: ${auditId}`);
  }
  const update = db.prepare(
    "UPDATE facts SET object = ?, confidence = ?, valid_until = ?, supersedes_json = ?, review_after = ? WHERE id = ?"
  );
  for (const row of entry.before) {
    update.run(
      valueOrNull(row.object),
      Number(row.confidence ?? 0.8),
      valueOrNull(row.valid_until),
      String(row.supersedes_json ?? "[]"),
      valueOrNull(row.review_after),
      String(row.id)
    );
  }
  appendFileSync(auditPath(paths), `${JSON.stringify({
    id: createId("gov"),
    createdAt: new Date().toISOString(),
    action: "undo",
    targetIds: [auditId],
    before: [],
    after: entry.before,
    undoable: false
  })}\n`, "utf8");
  return { ok: true, undone: auditId, restored: entry.before.length };
}

export function factsSnapshot(db: UmosDatabase, factIds: string[]): Record<string, unknown>[] {
  if (factIds.length === 0) {
    return [];
  }
  const get = db.prepare(
    "SELECT id, subject, predicate, object, confidence, valid_until, supersedes_json, review_after FROM facts WHERE id = ?"
  );
  return factIds
    .map((id) => get.get(id) as Record<string, unknown> | undefined)
    .filter((row): row is Record<string, unknown> => Boolean(row));
}

export function supersedeTimeline(db: UmosDatabase): Array<Record<string, unknown>> {
  const rows = db
    .prepare("SELECT id, subject, predicate, object, valid_until, supersedes_json, review_after FROM facts")
    .all() as Array<Record<string, unknown>>;
  return rows
    .filter((row) => String(row.supersedes_json ?? "[]") !== "[]" || row.valid_until || row.review_after)
    .map((row) => ({
      ...row,
      supersedes: safeArray(String(row.supersedes_json ?? "[]"))
    }));
}

function auditPath(paths: VaultPaths): string {
  return join(paths.root, "logs", "governor-audit.jsonl");
}

function safeArray(value: string): string[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function valueOrNull(value: unknown): string | null {
  return value === undefined || value === null ? null : String(value);
}
