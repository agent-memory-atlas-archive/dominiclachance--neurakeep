import { createId } from "../core/ids.js";
import type { UmosDatabase } from "../db/client.js";
import type { SectionRecord, SourceRecord } from "./records.js";

export interface ExtractedMemory {
  events: ExtractedEvent[];
  facts: ExtractedFact[];
  failures: ExtractedFailure[];
}

export interface ExtractedEvent {
  id: string;
  type: "decision" | "event";
  summary: string;
  sourceIds: string[];
  sectionIds: string[];
  project: string | null;
  graphSubjects: string[];
  importance: number;
  confidence: number;
}

export interface ExtractedFact {
  id: string;
  subject: string;
  predicate: string;
  object: string;
  sourceIds: string[];
  sectionIds: string[];
  graphSubjects: string[];
  confidence: number;
}

export interface ExtractedFailure {
  id: string;
  project: string | null;
  attempted: string;
  failedBecause: string;
  doNotRepeat: string;
  revisitCondition: string | null;
  sourceIds: string[];
  sectionIds: string[];
  graphSubjects: string[];
  confidence: number;
}

export interface ExtractionInput {
  source: SourceRecord;
  sections: SectionRecord[];
  deterministicDraft: ExtractedMemory;
}

export function extractMemoriesFromSource(db: UmosDatabase, sourceId: string): ExtractedMemory {
  const input = loadExtractionInput(db, sourceId);
  return deterministicExtract(input.source, input.sections);
}

export function loadExtractionInput(db: UmosDatabase, sourceId: string): ExtractionInput {
  const source = db.prepare("SELECT * FROM sources WHERE id = ?").get(sourceId) as SourceRecord | undefined;
  if (!source) {
    throw new Error(`Source not found: ${sourceId}`);
  }

  const sections = db
    .prepare("SELECT * FROM sections WHERE source_id = ? ORDER BY ordinal ASC")
    .all(sourceId) as SectionRecord[];

  const deterministicDraft = deterministicExtract(source, sections);
  return { source, sections, deterministicDraft };
}

function deterministicExtract(source: SourceRecord, sections: SectionRecord[]): ExtractedMemory {
  const events: ExtractedEvent[] = [];
  const facts: ExtractedFact[] = [];
  const failures: ExtractedFailure[] = [];

  for (const section of sections) {
    const sentences = splitSentences(section.body);
    const sectionTitle = section.heading ?? source.title ?? source.uri;
    const subjects = graphSubjects(sectionTitle, section.body);
    const project = inferProject(source, section);

    if (isDecision(section.heading, section.body)) {
      events.push({
        id: createId("evt"),
        type: "decision",
        summary: summarize(section.body, section.heading ?? "Decision"),
        sourceIds: [source.id],
        sectionIds: [section.id],
        project,
        graphSubjects: subjects,
        importance: 0.8,
        confidence: confidenceForTrust(source.trust_level)
      });
    } else if (isEvent(section.body)) {
      events.push({
        id: createId("evt"),
        type: "event",
        summary: summarize(section.body, section.heading ?? "Event"),
        sourceIds: [source.id],
        sectionIds: [section.id],
        project,
        graphSubjects: subjects,
        importance: 0.55,
        confidence: confidenceForTrust(source.trust_level)
      });
    }

    const failureSentence = sentences.find((sentence) => isFailure(sentence));
    if (failureSentence) {
      failures.push({
        id: createId("fail"),
        project,
        attempted: section.heading ?? "Approach described in source",
        failedBecause: failureSentence,
        doNotRepeat: makeDoNotRepeat(failureSentence),
        revisitCondition: null,
        sourceIds: [source.id],
        sectionIds: [section.id],
        graphSubjects: subjects,
        confidence: confidenceForTrust(source.trust_level)
      });
    }

    for (const fact of extractFactCandidates(sentences, source, section, subjects)) {
      facts.push(fact);
    }
  }

  return {
    events: dedupeBySummary(events),
    facts: dedupeFacts(facts).filter((fact) => !isNoisyFact(fact)),
    failures: dedupeFailures(failures)
  };
}

function splitSentences(text: string): string[] {
  return text
    .replace(/\r\n/g, "\n")
    .split(/(?<=[.!?])\s+|\n+/)
    .map((sentence) => sentence.replace(/^[-*]\s+/, "").trim())
    .filter((sentence) => sentence.length >= 12)
    .slice(0, 80);
}

function isDecision(heading: string | null, body: string): boolean {
  return /\b(decision|decided|chosen|locked in|go with|direction|recommendation)\b/i.test(
    `${heading ?? ""}\n${body}`
  );
}

function isEvent(body: string): boolean {
  return /\b(implemented|completed|deployed|updated|created|fixed|verified|shipped)\b/i.test(body);
}

function isFailure(sentence: string): boolean {
  return /\b(do not|don't|avoid|failed|broke|regression|gotcha|must not|never|rollback|outage)\b/i.test(
    sentence
  );
}

function extractFactCandidates(
  sentences: string[],
  source: SourceRecord,
  section: SectionRecord,
  subjects: string[]
): ExtractedFact[] {
  const facts: ExtractedFact[] = [];
  for (const sentence of sentences) {
    const colon = /^([^:]{3,80}):\s+(.{8,220})$/.exec(sentence);
    const isStatement = /^(.{3,80}?)\s+(?:is|are|uses|requires|must use|should use|points to)\s+(.{8,220})$/i.exec(
      sentence
    );
    const match = colon ?? isStatement;
    if (!match) {
      continue;
    }

    facts.push({
      id: createId("fact"),
      subject: cleanFactPart(match[1] ?? "Unknown"),
      predicate: colon ? "notes" : "states",
      object: cleanFactPart(match[2] ?? sentence),
      sourceIds: [source.id],
      sectionIds: [section.id],
      graphSubjects: subjects,
      confidence: Math.min(0.85, confidenceForTrust(source.trust_level))
    });
  }
  return facts.slice(0, 20);
}

function summarize(body: string, fallback: string): string {
  const firstSentence = splitSentences(body)[0];
  return (firstSentence ?? fallback).replace(/\s+/g, " ").slice(0, 280);
}

function makeDoNotRepeat(sentence: string): string {
  if (/do not|don't|never|must not/i.test(sentence)) {
    return sentence;
  }
  return `Do not repeat this path without checking the cited source: ${sentence}`;
}

function graphSubjects(title: string, body: string): string[] {
  const candidates = new Set<string>();
  for (const value of [title, ...Array.from(body.matchAll(/\b[A-Z][A-Za-z0-9]+(?:[- ][A-Z][A-Za-z0-9]+){0,3}\b/g)).map((match) => match[0])]) {
    const cleaned = value.replace(/^#+\s*/, "").trim().slice(0, 80);
    if (cleaned.length >= 3 && !/^(This|That|The|What|Which|When)$/i.test(cleaned)) {
      candidates.add(cleaned);
    }
    if (candidates.size >= 8) {
      break;
    }
  }
  return Array.from(candidates);
}

function inferProject(source: SourceRecord, section: SectionRecord): string | null {
  for (const json of [source.metadata_json, section.metadata_json]) {
    try {
      const parsed = JSON.parse(json) as { project?: unknown };
      if (typeof parsed.project === "string" && parsed.project.trim()) {
        return parsed.project.trim();
      }
    } catch {
      // Ignore malformed metadata.
    }
  }
  return null;
}

function confidenceForTrust(trustLevel: string): number {
  switch (trustLevel) {
    case "verified":
      return 0.95;
    case "trusted":
      return 0.85;
    case "observed":
      return 0.72;
    default:
      return 0.45;
  }
}

function cleanFactPart(value: string): string {
  return value.replace(/^#+\s*/, "").replace(/\s+/g, " ").trim().slice(0, 240);
}

function dedupeBySummary(events: ExtractedEvent[]): ExtractedEvent[] {
  const seen = new Set<string>();
  return events.filter((event) => {
    const key = event.summary.toLowerCase();
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function dedupeFacts(facts: ExtractedFact[]): ExtractedFact[] {
  const seen = new Set<string>();
  return facts.filter((fact) => {
    const key = `${fact.subject}|${fact.predicate}|${fact.object}`.toLowerCase();
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function dedupeFailures(failures: ExtractedFailure[]): ExtractedFailure[] {
  const seen = new Set<string>();
  return failures.filter((failure) => {
    const key = `${failure.attempted}|${failure.failedBecause}`.toLowerCase();
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function isNoisyFact(fact: ExtractedFact): boolean {
  if (/^source$/i.test(fact.subject) && /^https?:\/\//i.test(fact.object)) {
    return true;
  }
  if (fact.object.length < 4 || fact.subject.length < 3) {
    return true;
  }
  return false;
}
