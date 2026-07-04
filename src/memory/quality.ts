import type { UmosDatabase } from "../db/client.js";

export interface QualityReport {
  duplicateFacts: DuplicateFactGroup[];
  conflictingFacts: ConflictingFactGroup[];
  staleFacts: StaleFact[];
  duplicateFailures: DuplicateFailureGroup[];
}

export interface DuplicateFactGroup {
  key: string;
  factIds: string[];
  count: number;
}

export interface ConflictingFactGroup {
  key: string;
  values: Array<{ factId: string; object: string; confidence: number }>;
}

export interface StaleFact {
  factId: string;
  subject: string;
  predicate: string;
  reviewAfter: string;
}

export interface DuplicateFailureGroup {
  key: string;
  failureIds: string[];
  count: number;
}

interface FactRow {
  id: string;
  subject: string;
  predicate: string;
  object: string;
  confidence: number;
  review_after: string | null;
}

interface FailureRow {
  id: string;
  attempted: string;
  do_not_repeat: string;
}

export function inspectMemoryQuality(db: UmosDatabase): QualityReport {
  const facts = db
    .prepare("SELECT id, subject, predicate, object, confidence, review_after FROM facts")
    .all() as FactRow[];
  const failures = db
    .prepare("SELECT id, attempted, do_not_repeat FROM failures")
    .all() as FailureRow[];

  return {
    duplicateFacts: duplicateFacts(facts),
    conflictingFacts: conflictingFacts(facts),
    staleFacts: staleFacts(facts),
    duplicateFailures: duplicateFailures(failures)
  };
}

function duplicateFacts(facts: FactRow[]): DuplicateFactGroup[] {
  const groups = new Map<string, string[]>();
  for (const fact of facts) {
    const key = normalize(`${fact.subject}|${fact.predicate}|${fact.object}`);
    groups.set(key, [...(groups.get(key) ?? []), fact.id]);
  }
  return Array.from(groups.entries())
    .filter(([, ids]) => ids.length > 1)
    .map(([key, factIds]) => ({ key, factIds, count: factIds.length }));
}

function conflictingFacts(facts: FactRow[]): ConflictingFactGroup[] {
  const groups = new Map<string, FactRow[]>();
  for (const fact of facts) {
    const key = normalize(`${fact.subject}|${fact.predicate}`);
    groups.set(key, [...(groups.get(key) ?? []), fact]);
  }
  return Array.from(groups.entries())
    .filter(([, rows]) => new Set(rows.map((row) => normalize(row.object))).size > 1)
    .map(([key, rows]) => ({
      key,
      values: rows.map((row) => ({
        factId: row.id,
        object: row.object,
        confidence: row.confidence
      }))
    }));
}

function staleFacts(facts: FactRow[]): StaleFact[] {
  const now = Date.now();
  return facts
    .filter((fact) => fact.review_after && Date.parse(fact.review_after) <= now)
    .map((fact) => ({
      factId: fact.id,
      subject: fact.subject,
      predicate: fact.predicate,
      reviewAfter: fact.review_after ?? ""
    }));
}

function duplicateFailures(failures: FailureRow[]): DuplicateFailureGroup[] {
  const groups = new Map<string, string[]>();
  for (const failure of failures) {
    const key = normalize(`${failure.attempted}|${failure.do_not_repeat}`);
    groups.set(key, [...(groups.get(key) ?? []), failure.id]);
  }
  return Array.from(groups.entries())
    .filter(([, ids]) => ids.length > 1)
    .map(([key, failureIds]) => ({ key, failureIds, count: failureIds.length }));
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}
