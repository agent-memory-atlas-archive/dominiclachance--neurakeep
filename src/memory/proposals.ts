import type Database from "better-sqlite3";
import { createId } from "../core/ids.js";
import type { VaultPaths } from "../core/paths.js";
import type { UmosDatabase } from "../db/client.js";
import { compileWiki } from "../wiki/compiler.js";
import { loadExtractionInput, type ExtractedMemory } from "./extractor.js";
import { scoreExtraction, type ExtractionScore } from "./extraction-eval.js";
import { recordExtractionReport, type ExtractionReport } from "./extraction-reports.js";
import { governProposalDiff } from "./governor.js";
import { runCommandExtractor } from "./llm-extractor.js";
import { resolveSourceId, type SourceRecord } from "./records.js";

export interface ProposalResult {
  proposalId: string;
  sourceId: string;
  summary: string;
  diff: ExtractedMemory;
  governor: ReturnType<typeof governProposalDiff>;
  extractionScore: ExtractionScore;
  extractionReport?: ExtractionReport;
}

export interface ApplyResult {
  proposalId: string;
  inserted: {
    events: number;
    facts: number;
    failures: number;
  };
  wikiPaths: string[];
}

export interface ProposeOptions {
  extractor?: "deterministic" | "command";
  extractorCommand?: string;
  reportPaths?: VaultPaths;
}

export function proposeSourceExtraction(
  db: UmosDatabase,
  sourceOrSectionId: string,
  options: ProposeOptions = {}
): ProposalResult {
  const sourceId = resolveSourceId(db, sourceOrSectionId);
  if (!sourceId) {
    throw new Error(`Source or section not found: ${sourceOrSectionId}`);
  }

  const source = db.prepare("SELECT * FROM sources WHERE id = ?").get(sourceId) as
    | SourceRecord
    | undefined;
  if (!source) {
    throw new Error(`Source not found: ${sourceId}`);
  }

  const input = loadExtractionInput(db, sourceId);
  const diff =
    options.extractor === "command"
      ? runCommandExtractor(input, {
          command:
            options.extractorCommand ??
            process.env.NEURAKEEP_EXTRACTOR_CMD ??
            failMissingExtractorCommand()
        })
      : input.deterministicDraft;
  validateProposalDiff(diff);
  const governor = governProposalDiff(db, diff);
  const extractionScore = scoreExtraction(diff, input.deterministicDraft);

  const proposalId = createId("prop");
  const now = new Date().toISOString();
  const sectionIds = unique([
    ...diff.events.flatMap((event) => event.sectionIds),
    ...diff.facts.flatMap((fact) => fact.sectionIds),
    ...diff.failures.flatMap((failure) => failure.sectionIds)
  ]);
  const summary = `Extract ${diff.events.length} events, ${diff.facts.length} facts, and ${diff.failures.length} failures from ${source.title ?? source.id}.`;

  db.prepare(
    `
    INSERT INTO proposals (
      id, created_at, status, kind, summary, diff_json, source_ids_json, section_ids_json,
      space, trust_level, source_origin, visibility, sensitivity, applied_at
    ) VALUES (?, ?, 'pending', 'extraction', ?, ?, ?, ?, ?, ?, 'agent', ?, ?, NULL)
    `
  ).run(
    proposalId,
    now,
    summary,
    JSON.stringify(diff),
    JSON.stringify([sourceId]),
    JSON.stringify(sectionIds),
    source.space,
    source.trust_level,
    source.visibility,
    source.sensitivity
  );

  const extractionReport = options.reportPaths
    ? recordExtractionReport(options.reportPaths, {
        proposalId,
        sourceId,
        extractor: options.extractor === "command" ? "command" : "deterministic",
        score: extractionScore
      })
    : undefined;

  return {
    proposalId,
    sourceId,
    summary,
    diff,
    governor,
    extractionScore,
    extractionReport
  };
}

function failMissingExtractorCommand(): never {
  throw new Error(
    "Command extractor requires --extractor-command or NEURAKEEP_EXTRACTOR_CMD."
  );
}

export function applyProposal(
  db: UmosDatabase,
  paths: VaultPaths,
  proposalId: string
): ApplyResult {
  const proposal = db.prepare("SELECT * FROM proposals WHERE id = ?").get(proposalId) as
    | ProposalRow
    | undefined;
  if (!proposal) {
    throw new Error(`Proposal not found: ${proposalId}`);
  }
  if (proposal.status !== "pending") {
    throw new Error(`Proposal is ${proposal.status}, not pending: ${proposalId}`);
  }

  const diff = JSON.parse(proposal.diff_json) as ExtractedMemory;
  validateProposalDiff(diff);
  const governor = governProposalDiff(db, diff);
  if (!governor.ok) {
    throw new Error(`Proposal blocked by Memory Governor: ${governor.blocked.map((item) => item.message).join("; ")}`);
  }
  const now = new Date().toISOString();
  const inserted = {
    events: 0,
    facts: 0,
    failures: 0
  };

  const insertEvent = db.prepare(`
    INSERT OR IGNORE INTO events (
      id, timestamp, type, summary, source_ids_json, section_ids_json, project, space,
      trust_level, source_origin, visibility, sensitivity, graph_subjects_json,
      importance, confidence, metadata_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '{}')
  `);
  const insertFact = db.prepare(`
    INSERT OR IGNORE INTO facts (
      id, subject, predicate, object, confidence, source_ids_json, section_ids_json,
      created_at, valid_from, valid_until, supersedes_json, space, trust_level, source_origin,
      visibility, sensitivity, graph_subjects_json, review_after, metadata_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, '[]', ?, ?, ?, ?, ?, ?, NULL, '{}')
  `);
  const insertFailure = db.prepare(`
    INSERT OR IGNORE INTO failures (
      id, project, attempted, failed_because, do_not_repeat, revisit_condition,
      source_ids_json, section_ids_json, created_at, space, trust_level, source_origin,
      visibility, sensitivity, graph_subjects_json, confidence, metadata_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '{}')
  `);
  const updateProposal = db.prepare(
    "UPDATE proposals SET status = 'applied', applied_at = ? WHERE id = ?"
  );

  const transaction = db.transaction(() => {
    for (const event of diff.events) {
      const result = insertEvent.run(
        event.id,
        now,
        event.type,
        event.summary,
        JSON.stringify(event.sourceIds),
        JSON.stringify(event.sectionIds),
        event.project,
        proposal.space,
        proposal.trust_level,
        "agent",
        proposal.visibility,
        proposal.sensitivity,
        JSON.stringify(event.graphSubjects),
        event.importance,
        event.confidence
      );
      inserted.events += result.changes;
    }

    for (const fact of diff.facts) {
      const result = insertFact.run(
        fact.id,
        fact.subject,
        fact.predicate,
        fact.object,
        fact.confidence,
        JSON.stringify(fact.sourceIds),
        JSON.stringify(fact.sectionIds),
        now,
        proposal.space,
        proposal.trust_level,
        "agent",
        proposal.visibility,
        proposal.sensitivity,
        JSON.stringify(fact.graphSubjects)
      );
      inserted.facts += result.changes;
    }

    for (const failure of diff.failures) {
      const result = insertFailure.run(
        failure.id,
        failure.project,
        failure.attempted,
        failure.failedBecause,
        failure.doNotRepeat,
        failure.revisitCondition,
        JSON.stringify(failure.sourceIds),
        JSON.stringify(failure.sectionIds),
        now,
        proposal.space,
        proposal.trust_level,
        "agent",
        proposal.visibility,
        proposal.sensitivity,
        JSON.stringify(failure.graphSubjects),
        failure.confidence
      );
      inserted.failures += result.changes;
    }

    updateProposal.run(now, proposalId);
  }) as Database.Transaction;

  transaction();
  const wiki = compileWiki(db, paths);

  return {
    proposalId,
    inserted,
    wikiPaths: wiki.paths
  };
}

interface ProposalRow {
  id: string;
  status: string;
  diff_json: string;
  space: string;
  trust_level: string;
  visibility: string;
  sensitivity: string;
}

function validateProposalDiff(diff: ExtractedMemory): void {
  for (const event of diff.events) {
    assertCited(event.sourceIds, event.sectionIds, event.summary);
  }
  for (const fact of diff.facts) {
    assertCited(fact.sourceIds, fact.sectionIds, `${fact.subject} ${fact.predicate}`);
    if (!fact.subject || !fact.predicate || !fact.object) {
      throw new Error("Fact proposals require subject, predicate, and object.");
    }
  }
  for (const failure of diff.failures) {
    assertCited(failure.sourceIds, failure.sectionIds, failure.attempted);
    if (!failure.doNotRepeat) {
      throw new Error("Failure proposals require do_not_repeat guidance.");
    }
  }
}

function assertCited(sourceIds: string[], sectionIds: string[], label: string): void {
  if (sourceIds.length === 0 || sectionIds.length === 0) {
    throw new Error(`Proposal item lacks source/section citation: ${label}`);
  }
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}
