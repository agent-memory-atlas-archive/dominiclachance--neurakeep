import type { UmosDatabase } from "../db/client.js";
import type { MemorySpace } from "../memory/metadata.js";

export interface SearchOptions {
  query: string;
  limit: number;
  space?: MemorySpace;
  neighbors: number;
  includeSecret?: boolean;
  project?: string;
}

export interface SearchResult {
  id: string;
  sourceId: string;
  heading: string | null;
  body: string;
  snippet: string;
  score: number;
  ordinal: number;
  space: string;
  trustLevel: string;
  sourceOrigin: string;
  visibility: string;
  sensitivity: string;
  sourceTitle: string | null;
  sourceUri: string;
  rawPath: string;
  capturedAt: string;
  rank: SearchRankBreakdown;
  relatedFailures: RelatedFailure[];
  neighbors: SearchNeighbor[];
}

export interface RelatedFailure {
  id: string;
  project: string | null;
  attempted: string;
  failedBecause: string;
  doNotRepeat: string;
  confidence: number;
  sourceIds: string[];
  sectionIds: string[];
}

export interface SearchRankBreakdown {
  fts: number;
  trust: number;
  recency: number;
  sensitivity: number;
  project: number;
  failureMemory: number;
  decision: number;
  neighborContext: number;
  total: number;
}

export interface SearchNeighbor {
  id: string;
  heading: string | null;
  body: string;
  ordinal: number;
  direction: "previous" | "next";
}

export interface RetrievalGuidance {
  confidence: "none" | "low" | "medium" | "high";
  resultCount: number;
  citationCount: number;
  relatedFailureCount: number;
  doNotRepeat: string[];
  trustBreakdown: Record<string, number>;
  sensitivityBreakdown: Record<string, number>;
  recommendedNextStep: string;
}

interface SectionSearchRow {
  id: string;
  source_id: string;
  heading: string | null;
  body: string;
  ordinal: number;
  space: string;
  trust_level: string;
  source_origin: string;
  visibility: string;
  sensitivity: string;
  title: string | null;
  uri: string;
  raw_path: string;
  captured_at: string;
  metadata_json: string;
  score: number;
}

interface NeighborRow {
  id: string;
  heading: string | null;
  body: string;
  ordinal: number;
}

export function searchSections(db: UmosDatabase, options: SearchOptions): SearchResult[] {
  const ftsQuery = toFtsQuery(options.query);
  if (!ftsQuery) {
    return [];
  }

  const limit = Math.max(1, Math.min(options.limit, 50));
  const rows = db
    .prepare(
      `
      SELECT
        sections.id,
        sections.source_id,
        sections.heading,
        sections.body,
        sections.ordinal,
        sections.space,
        sections.trust_level,
        sections.source_origin,
        sections.visibility,
        sections.sensitivity,
        sources.title,
        sources.uri,
        sources.raw_path,
        sources.captured_at,
        sources.metadata_json,
        bm25(sections_fts) * -1 AS score
      FROM sections_fts
      JOIN sections ON sections_fts.rowid = sections.rowid
      JOIN sources ON sources.id = sections.source_id
      WHERE sections_fts MATCH ?
        AND (? IS NULL OR sections.space = ?)
        AND (? = 1 OR sections.sensitivity != 'secret')
      ORDER BY score DESC, sections.ordinal ASC
      LIMIT ?
      `
    )
    .all(
      ftsQuery,
      options.space ?? null,
      options.space ?? null,
      options.includeSecret ? 1 : 0,
      Math.min(limit * 4, 100)
    ) as SectionSearchRow[];

  return rows
    .map((row) => {
      const rank = rankRow(row, options);
      return {
        id: row.id,
        sourceId: row.source_id,
        heading: row.heading,
        body: row.body,
        snippet: makeSnippet(row.body, options.query),
        score: rank.total,
        ordinal: row.ordinal,
        space: row.space,
        trustLevel: row.trust_level,
        sourceOrigin: row.source_origin,
        visibility: row.visibility,
        sensitivity: row.sensitivity,
        sourceTitle: row.title,
        sourceUri: row.uri,
        rawPath: row.raw_path,
        capturedAt: row.captured_at,
        rank,
        relatedFailures: getRelatedFailures(db, options.query, row.space, options.project),
        neighbors:
          options.neighbors > 0 ? getNeighbors(db, row.source_id, row.ordinal, options.neighbors) : []
      };
    })
    .sort((a, b) => b.score - a.score || a.ordinal - b.ordinal)
    .slice(0, limit);
}

function getRelatedFailures(
  db: UmosDatabase,
  query: string,
  space: string,
  project: string | undefined
): RelatedFailure[] {
  const tokens = Array.from(query.matchAll(/[\p{L}\p{N}_-]+/gu))
    .map((match) => match[0].toLowerCase())
    .filter((token) => token.length > 3)
    .slice(0, 8);
  if (tokens.length === 0) {
    return [];
  }

  const rows = db
    .prepare(
      `
      SELECT id, project, attempted, failed_because, do_not_repeat, confidence,
        source_ids_json, section_ids_json
      FROM failures
      WHERE space = ?
        AND (? IS NULL OR project IS NULL OR project = ?)
      ORDER BY created_at DESC
      LIMIT 100
      `
    )
    .all(space, project ?? null, project ?? null) as Array<{
    id: string;
    project: string | null;
    attempted: string;
    failed_because: string;
    do_not_repeat: string;
    confidence: number;
    source_ids_json: string;
    section_ids_json: string;
  }>;

  return rows
    .map((row) => {
      const haystack = `${row.attempted} ${row.failed_because} ${row.do_not_repeat}`.toLowerCase();
      const matches = tokens.filter((token) => haystack.includes(token)).length;
      return { row, matches };
    })
    .filter(({ matches }) => matches > 0)
    .sort((a, b) => b.matches - a.matches || b.row.confidence - a.row.confidence)
    .slice(0, 3)
    .map(({ row }) => ({
      id: row.id,
      project: row.project,
      attempted: row.attempted,
      failedBecause: row.failed_because,
      doNotRepeat: row.do_not_repeat,
      confidence: row.confidence,
      sourceIds: parseJsonArray(row.source_ids_json),
      sectionIds: parseJsonArray(row.section_ids_json)
    }));
}

function parseJsonArray(value: string): string[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function rankRow(row: SectionSearchRow, options: SearchOptions): SearchRankBreakdown {
  const fts = normalizeFts(row.score);
  const trust = trustBoost(row.trust_level);
  const recency = recencyBoost(row.captured_at);
  const sensitivity = sensitivityBoost(row.sensitivity);
  const project = projectBoost(row.metadata_json, options.project);
  const failureMemory = failureMemoryBoost(row, options.query);
  const decision = decisionBoost(row, options.query);
  const neighborContext = neighborContextBoost(row, options.query);
  const total = fts + trust + recency + sensitivity + project + failureMemory + decision + neighborContext;

  return {
    fts,
    trust,
    recency,
    sensitivity,
    project,
    failureMemory,
    decision,
    neighborContext,
    total
  };
}

function normalizeFts(score: number): number {
  if (!Number.isFinite(score)) {
    return 0;
  }
  return Math.max(0, Math.min(score, 25));
}

function trustBoost(trustLevel: string): number {
  switch (trustLevel) {
    case "verified":
      return 4;
    case "trusted":
      return 2.5;
    case "observed":
      return 1;
    case "untrusted":
      return -4;
    default:
      return 0;
  }
}

function sensitivityBoost(sensitivity: string): number {
  switch (sensitivity) {
    case "secret":
      return -8;
    case "confidential":
      return -2;
    case "internal":
      return -0.5;
    default:
      return 0;
  }
}

function recencyBoost(capturedAt: string): number {
  const captured = Date.parse(capturedAt);
  if (!Number.isFinite(captured)) {
    return 0;
  }
  const ageDays = Math.max(0, (Date.now() - captured) / 86_400_000);
  if (ageDays <= 1) {
    return 2;
  }
  if (ageDays <= 7) {
    return 1.5;
  }
  if (ageDays <= 30) {
    return 0.75;
  }
  return 0;
}

function projectBoost(metadataJson: string, project: string | undefined): number {
  if (!project) {
    return 0;
  }

  try {
    const metadata = JSON.parse(metadataJson) as Record<string, unknown>;
    const value = typeof metadata.project === "string" ? metadata.project : "";
    return value.toLowerCase() === project.toLowerCase() ? 3 : 0;
  } catch {
    return 0;
  }
}

function failureMemoryBoost(row: SectionSearchRow, query: string): number {
  if (!/\b(do not repeat|don't repeat|avoid|failed|failure|mistake|gotcha|regression|broke|outage)\b/i.test(query)) {
    return 0;
  }
  const text = `${row.heading ?? ""}\n${row.body}`;
  if (/\b(do not|don't|avoid|failed|failure|regression|broke|outage|rollback|gotcha|must not|never)\b/i.test(text)) {
    return 5;
  }
  return 0;
}

function decisionBoost(row: SectionSearchRow, query: string): number {
  if (!/\b(decision|decided|why|chosen|direction|recommendation)\b/i.test(query)) {
    return 0;
  }
  const text = `${row.heading ?? ""}\n${row.body}`;
  return /\b(decision|decided|chosen|locked in|direction|recommendation|because|why)\b/i.test(text) ? 3 : 0;
}

function neighborContextBoost(row: SectionSearchRow, query: string): number {
  if (!/\b(context|neighbor|before|after|source|surrounding|raw episode)\b/i.test(query)) {
    return 0;
  }
  return row.ordinal > 0 ? 1.25 : 0.5;
}

function getNeighbors(
  db: UmosDatabase,
  sourceId: string,
  ordinal: number,
  depth: number
): SearchNeighbor[] {
  const boundedDepth = Math.max(0, Math.min(depth, 2));
  if (boundedDepth === 0) {
    return [];
  }

  const rows = db
    .prepare(
      `
      SELECT id, heading, body, ordinal
      FROM sections
      WHERE source_id = ?
        AND ordinal BETWEEN ? AND ?
        AND ordinal != ?
      ORDER BY ordinal ASC
      `
    )
    .all(sourceId, ordinal - boundedDepth, ordinal + boundedDepth, ordinal) as NeighborRow[];

  return rows.map((row) => ({
    id: row.id,
    heading: row.heading,
    body: row.body,
    ordinal: row.ordinal,
    direction: row.ordinal < ordinal ? "previous" : "next"
  }));
}

function toFtsQuery(query: string): string {
  const tokens = Array.from(query.matchAll(/[\p{L}\p{N}_-]+/gu))
    .map((match) => match[0])
    .filter((token) => token.length > 1)
    .slice(0, 12);

  return tokens.map((token) => `"${token.replaceAll('"', '""')}"`).join(" OR ");
}

function makeSnippet(body: string, query: string): string {
  const firstToken = query.match(/[\p{L}\p{N}_-]+/u)?.[0]?.toLowerCase();
  const lower = body.toLowerCase();
  const index = firstToken ? lower.indexOf(firstToken) : -1;
  const start = index >= 0 ? Math.max(0, index - 120) : 0;
  const snippet = body.slice(start, start + 320).replace(/\s+/g, " ").trim();
  return start > 0 ? `...${snippet}` : snippet;
}

export function retrievalGuidance(results: SearchResult[]): RetrievalGuidance {
  const citationIds = new Set<string>();
  const doNotRepeat = new Set<string>();
  const trustBreakdown: Record<string, number> = {};
  const sensitivityBreakdown: Record<string, number> = {};
  for (const result of results) {
    citationIds.add(result.sourceId);
    trustBreakdown[result.trustLevel] = (trustBreakdown[result.trustLevel] ?? 0) + 1;
    sensitivityBreakdown[result.sensitivity] = (sensitivityBreakdown[result.sensitivity] ?? 0) + 1;
    for (const failure of result.relatedFailures) {
      citationIds.add(failure.id);
      doNotRepeat.add(failure.doNotRepeat);
      for (const id of failure.sourceIds) citationIds.add(id);
      for (const id of failure.sectionIds) citationIds.add(id);
    }
    for (const neighbor of result.neighbors) {
      citationIds.add(neighbor.id);
    }
  }

  const topScore = results[0]?.score ?? 0;
  const relatedFailureCount = Array.from(doNotRepeat).length;
  const confidence =
    results.length === 0 ? "none" : topScore >= 8 && citationIds.size >= 2 ? "high" : topScore >= 4 ? "medium" : "low";
  const recommendedNextStep =
    results.length === 0
      ? "No memory matched. Try a narrower project name, failure phrase, or source keyword before relying on memory."
      : relatedFailureCount > 0
        ? "Read the cited source and related failure memory before taking action."
        : confidence === "high"
          ? "Use this memory with citations; read the top source if the action is high impact."
          : "Treat this as a lead. Open the cited source before making a durable decision.";

  return {
    confidence,
    resultCount: results.length,
    citationCount: citationIds.size,
    relatedFailureCount,
    doNotRepeat: Array.from(doNotRepeat).slice(0, 5),
    trustBreakdown,
    sensitivityBreakdown,
    recommendedNextStep
  };
}
