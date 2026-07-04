import type { UmosDatabase } from "../db/client.js";
import type { ExtractedMemory, ExtractedFact } from "./extractor.js";

export interface GovernorReport {
  ok: boolean;
  warnings: GovernorWarning[];
  blocked: GovernorWarning[];
}

export interface GovernorWarning {
  severity: "warn" | "block";
  kind: "duplicate" | "conflict" | "sensitivity" | "do_not_remember" | "citation";
  itemType: "event" | "fact" | "failure";
  itemId: string;
  message: string;
  relatedIds: string[];
}

export function governProposalDiff(db: UmosDatabase, diff: ExtractedMemory): GovernorReport {
  const warnings: GovernorWarning[] = [];

  for (const event of diff.events) {
    if (lacksCitation(event.sourceIds, event.sectionIds)) {
      warnings.push(block("citation", "event", event.id, "Event lacks source and section citations."));
    }
    if (doNotRemember(event.summary)) {
      warnings.push(block("do_not_remember", "event", event.id, "Event text asks not to be remembered."));
    }
  }

  for (const fact of diff.facts) {
    if (lacksCitation(fact.sourceIds, fact.sectionIds)) {
      warnings.push(block("citation", "fact", fact.id, "Fact lacks source and section citations."));
    }
    const duplicate = findDuplicateFact(db, fact);
    if (duplicate.length > 0) {
      warnings.push(warn("duplicate", "fact", fact.id, "Similar fact already exists.", duplicate));
    }
    const conflict = findConflictingFact(db, fact);
    if (conflict.length > 0) {
      warnings.push(warn("conflict", "fact", fact.id, "Fact conflicts with existing subject/predicate values.", conflict));
    }
    if (doNotRemember(`${fact.subject} ${fact.predicate} ${fact.object}`)) {
      warnings.push(block("do_not_remember", "fact", fact.id, "Fact text asks not to be remembered."));
    }
  }

  for (const failure of diff.failures) {
    if (lacksCitation(failure.sourceIds, failure.sectionIds)) {
      warnings.push(block("citation", "failure", failure.id, "Failure lacks source and section citations."));
    }
    if (doNotRemember(`${failure.attempted} ${failure.failedBecause} ${failure.doNotRepeat}`)) {
      warnings.push(block("do_not_remember", "failure", failure.id, "Failure text asks not to be remembered."));
    }
  }

  const blocked = warnings.filter((warning) => warning.severity === "block");
  return { ok: blocked.length === 0, warnings, blocked };
}

function findDuplicateFact(db: UmosDatabase, fact: ExtractedFact): string[] {
  const rows = db
    .prepare(
      "SELECT id FROM facts WHERE lower(subject)=lower(?) AND lower(predicate)=lower(?) AND lower(object)=lower(?) LIMIT 5"
    )
    .all(fact.subject, fact.predicate, fact.object) as Array<{ id: string }>;
  return rows.map((row) => row.id);
}

function findConflictingFact(db: UmosDatabase, fact: ExtractedFact): string[] {
  const rows = db
    .prepare(
      "SELECT id FROM facts WHERE lower(subject)=lower(?) AND lower(predicate)=lower(?) AND lower(object) != lower(?) LIMIT 5"
    )
    .all(fact.subject, fact.predicate, fact.object) as Array<{ id: string }>;
  return rows.map((row) => row.id);
}

function lacksCitation(sourceIds: string[], sectionIds: string[]): boolean {
  return sourceIds.length === 0 || sectionIds.length === 0;
}

function doNotRemember(value: string): boolean {
  return /\b(do not remember|don't remember|forget this|should not be saved)\b/i.test(value);
}

function warn(
  kind: GovernorWarning["kind"],
  itemType: GovernorWarning["itemType"],
  itemId: string,
  message: string,
  relatedIds: string[] = []
): GovernorWarning {
  return { severity: "warn", kind, itemType, itemId, message, relatedIds };
}

function block(
  kind: GovernorWarning["kind"],
  itemType: GovernorWarning["itemType"],
  itemId: string,
  message: string,
  relatedIds: string[] = []
): GovernorWarning {
  return { severity: "block", kind, itemType, itemId, message, relatedIds };
}
