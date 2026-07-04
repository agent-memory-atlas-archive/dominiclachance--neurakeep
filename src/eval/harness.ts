import { createId } from "../core/ids.js";
import type { UmosDatabase } from "../db/client.js";
import type { MemorySpace } from "../memory/metadata.js";
import { searchSections } from "../search/fts.js";

export interface EvalRunOptions {
  limit: number;
  neighbors: number;
  space?: MemorySpace;
}

export interface EvalCase {
  id: string;
  query: string;
  expectedSourceIds: string[];
  expectedSectionIds: string[];
  expectedAnswerContains: string[];
  space: string;
}

export interface EvalCaseResult {
  id: string;
  query: string;
  resultCount: number;
  hit: boolean;
  topResultId: string | null;
  topSourceId: string | null;
}

export interface EvalRunResult {
  caseCount: number;
  hitCount: number;
  recallAtLimit: number;
  results: EvalCaseResult[];
}

const starterQueries = [
  "What production gotcha should I avoid repeating?",
  "What should I not repeat from a previous failure?",
  "Which memory says do not repeat this mistake?",
  "What decision was made and why?",
  "What source-neighbor context explains the decision?",
  "Which source mentions a failed approach?",
  "What project-specific deployment warning exists?",
  "What command or configuration mattered?",
  "Which memory has the strongest citation?",
  "What security or poisoning risk was detected?",
  "What changed most recently?",
  "Which raw episode contains this context?",
  "What should another agent know before coding?"
];

export function seedEvalCases(db: UmosDatabase, space: MemorySpace): number {
  const now = new Date().toISOString();
  const insert = db.prepare(`
    INSERT INTO eval_cases (
      id, created_at, query, expected_source_ids_json, expected_section_ids_json,
      expected_answer_contains_json, space, metadata_json
    ) VALUES (?, ?, ?, '[]', '[]', '[]', ?, ?)
  `);

  const exists = db.prepare("SELECT COUNT(*) AS count FROM eval_cases WHERE space = ? AND query = ?");

  const transaction = db.transaction(() => {
    for (const query of starterQueries) {
      const found = exists.get(space, query) as { count: number };
      if (found.count > 0) {
        continue;
      }
      insert.run(
        createId("eval"),
        now,
        query,
        space,
        JSON.stringify({ starter: true, needs_expected_ids: true })
      );
    }
    for (const evalCase of failureEvalCases(db, space)) {
      const found = exists.get(space, evalCase.query) as { count: number };
      if (found.count > 0) {
        continue;
      }
      insert.run(
        createId("eval"),
        now,
        evalCase.query,
        space,
        JSON.stringify({ starter: false, failure_memory: true })
      );
      db.prepare(
        "UPDATE eval_cases SET expected_source_ids_json = ?, expected_section_ids_json = ?, expected_answer_contains_json = ? WHERE rowid = last_insert_rowid()"
      ).run(
        JSON.stringify(evalCase.expectedSourceIds),
        JSON.stringify(evalCase.expectedSectionIds),
        JSON.stringify(evalCase.expectedAnswerContains)
      );
    }
  });
  const before = (db.prepare("SELECT COUNT(*) AS count FROM eval_cases WHERE space = ?").get(space) as { count: number }).count;
  transaction();
  const after = (db.prepare("SELECT COUNT(*) AS count FROM eval_cases WHERE space = ?").get(space) as { count: number }).count;
  return after - before;
}

export function runEvalCases(db: UmosDatabase, options: EvalRunOptions): EvalRunResult {
  const cases = loadEvalCases(db, options.space);
  const results: EvalCaseResult[] = cases.map((evalCase) => {
    const searchResults = searchSections(db, {
      query: evalCase.query,
      limit: options.limit,
      neighbors: options.neighbors,
      space: options.space ?? (evalCase.space as MemorySpace)
    });

    const expectedSources = new Set(evalCase.expectedSourceIds);
    const expectedSections = new Set(evalCase.expectedSectionIds);
    const hit =
      expectedSources.size === 0 && expectedSections.size === 0
        ? searchResults.length > 0
        : searchResults.some(
            (result) => expectedSources.has(result.sourceId) || expectedSections.has(result.id)
          );

    return {
      id: evalCase.id,
      query: evalCase.query,
      resultCount: searchResults.length,
      hit,
      topResultId: searchResults[0]?.id ?? null,
      topSourceId: searchResults[0]?.sourceId ?? null
    };
  });

  const hitCount = results.filter((result) => result.hit).length;

  return {
    caseCount: results.length,
    hitCount,
    recallAtLimit: results.length > 0 ? hitCount / results.length : 0,
    results
  };
}

function loadEvalCases(db: UmosDatabase, space: MemorySpace | undefined): EvalCase[] {
  const rows = db
    .prepare(
      `
      SELECT id, query, expected_source_ids_json, expected_section_ids_json,
        expected_answer_contains_json, space
      FROM eval_cases
      WHERE (? IS NULL OR space = ?)
      ORDER BY created_at ASC
      `
    )
    .all(space ?? null, space ?? null) as Array<{
    id: string;
    query: string;
    expected_source_ids_json: string;
    expected_section_ids_json: string;
    expected_answer_contains_json: string;
    space: string;
  }>;

  return rows.map((row) => ({
    id: row.id,
    query: row.query,
    expectedSourceIds: JSON.parse(row.expected_source_ids_json) as string[],
    expectedSectionIds: JSON.parse(row.expected_section_ids_json) as string[],
    expectedAnswerContains: JSON.parse(row.expected_answer_contains_json) as string[],
    space: row.space
  }));
}

function failureEvalCases(db: UmosDatabase, space: MemorySpace): EvalCase[] {
  const rows = db
    .prepare(
      `
      SELECT attempted, do_not_repeat, source_ids_json, section_ids_json
      FROM failures
      WHERE space = ?
      ORDER BY created_at DESC
      LIMIT 5
      `
    )
    .all(space) as Array<{
    attempted: string;
    do_not_repeat: string;
    source_ids_json: string;
    section_ids_json: string;
  }>;
  return rows.map((row) => ({
    id: "",
    query: `What should I not repeat about ${row.attempted.slice(0, 80)}?`,
    expectedSourceIds: safeArray(row.source_ids_json),
    expectedSectionIds: safeArray(row.section_ids_json),
    expectedAnswerContains: [row.do_not_repeat.slice(0, 80)],
    space
  }));
}

function safeArray(value: string): string[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}
