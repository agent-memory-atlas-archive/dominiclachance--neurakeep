import type { UmosDatabase } from "../db/client.js";

export interface SourceRecord {
  id: string;
  episode_id: string | null;
  kind: string;
  uri: string;
  title: string | null;
  content_hash: string;
  captured_at: string;
  source_time: string | null;
  space: string;
  trust_level: string;
  source_origin: string;
  visibility: string;
  sensitivity: string;
  raw_path: string;
  metadata_json: string;
}

export interface SectionRecord {
  id: string;
  source_id: string;
  heading: string | null;
  body: string;
  ordinal: number;
  previous_section_id: string | null;
  next_section_id: string | null;
  token_estimate: number | null;
  space: string;
  trust_level: string;
  source_origin: string;
  visibility: string;
  sensitivity: string;
  metadata_json: string;
}

export function readMemoryRecord(db: UmosDatabase, id: string): Record<string, unknown> | null {
  const source = db.prepare("SELECT * FROM sources WHERE id = ?").get(id) as SourceRecord | undefined;
  if (source) {
    const sections = db
      .prepare("SELECT * FROM sections WHERE source_id = ? ORDER BY ordinal ASC")
      .all(source.id) as SectionRecord[];
    return {
      ...source,
      recordType: "source",
      metadata: parseJson(source.metadata_json),
      sections: sections.map((section) => ({
        ...section,
        metadata: parseJson(section.metadata_json)
      }))
    };
  }

  const section = db.prepare("SELECT * FROM sections WHERE id = ?").get(id) as SectionRecord | undefined;
  if (section) {
    return {
      ...section,
      recordType: "section",
      metadata: parseJson(section.metadata_json),
      source: db.prepare("SELECT * FROM sources WHERE id = ?").get(section.source_id) ?? null
    };
  }

  for (const table of ["events", "facts", "failures", "proposals"]) {
    const record = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id) as
      | Record<string, unknown>
      | undefined;
    if (record) {
      return {
        ...record,
        recordType: table.slice(0, -1),
        metadata: parseJson(String(record.metadata_json ?? "{}"))
      };
    }
  }

  return null;
}

export function explainSources(
  db: UmosDatabase,
  sourceIds: string[]
): Array<Record<string, unknown>> {
  if (sourceIds.length === 0) {
    return [];
  }

  const readSource = db.prepare("SELECT * FROM sources WHERE id = ?");
  return sourceIds.flatMap((sourceId) => {
    const source = readSource.get(sourceId) as SourceRecord | undefined;
    if (!source) {
      return [];
    }
    const firstSection = db
      .prepare("SELECT id, heading, body FROM sections WHERE source_id = ? ORDER BY ordinal ASC LIMIT 1")
      .get(sourceId) as { id: string; heading: string | null; body: string } | undefined;

    return [
      {
        id: source.id,
        title: source.title,
        uri: source.uri,
        rawPath: source.raw_path,
        contentHash: source.content_hash,
        capturedAt: source.captured_at,
        space: source.space,
        trustLevel: source.trust_level,
        sourceOrigin: source.source_origin,
        visibility: source.visibility,
        sensitivity: source.sensitivity,
        firstSectionId: firstSection?.id ?? null,
        snippet: firstSection ? makeSnippet(firstSection.body) : ""
      }
    ];
  });
}

export function resolveSourceId(db: UmosDatabase, sourceOrSectionId: string): string | null {
  if (sourceOrSectionId === "latest") {
    const latest = db
      .prepare("SELECT id FROM sources ORDER BY captured_at DESC LIMIT 1")
      .get() as { id: string } | undefined;
    return latest?.id ?? null;
  }

  const source = db
    .prepare("SELECT id FROM sources WHERE id = ?")
    .get(sourceOrSectionId) as { id: string } | undefined;
  if (source) {
    return source.id;
  }

  const section = db
    .prepare("SELECT source_id FROM sections WHERE id = ?")
    .get(sourceOrSectionId) as { source_id: string } | undefined;
  return section?.source_id ?? null;
}

function makeSnippet(body: string): string {
  return body.replace(/\s+/g, " ").trim().slice(0, 320);
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}
