import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { VaultPaths } from "../core/paths.js";
import type { UmosDatabase } from "../db/client.js";
import { hostedArtifactStore } from "../security/artifact-store.js";

export interface WikiCompileResult {
  paths: string[];
}

export function compileWiki(db: UmosDatabase, paths: VaultPaths): WikiCompileResult {
  mkdirSync(paths.wikiDir, { recursive: true });
  mkdirSync(join(paths.wikiDir, "projects"), { recursive: true });

  const written = [
    writePage(paths.wikiDir, "index.md", compileIndex(db)),
    writePage(paths.wikiDir, "decisions.md", compileDecisions(db)),
    writePage(paths.wikiDir, "failures.md", compileFailures(db)),
    writePage(paths.wikiDir, "projects.md", compileProjects(db))
  ];

  for (const project of loadProjects(db)) {
    written.push(writePage(join(paths.wikiDir, "projects"), `${slugify(project)}.md`, compileProject(db, project)));
  }

  return {
    paths: written
  };
}

function compileIndex(db: UmosDatabase): string {
  const counts = {
    sources: count(db, "sources"),
    sections: count(db, "sections"),
    events: count(db, "events"),
    facts: count(db, "facts"),
    failures: count(db, "failures"),
    proposals: count(db, "proposals")
  };

  return `# NeuraKeep

Compiled memory view.

## Counts

- Sources: ${counts.sources}
- Sections: ${counts.sections}
- Events: ${counts.events}
- Facts: ${counts.facts}
- Failures: ${counts.failures}
- Proposals: ${counts.proposals}

## Core Pages

- [Decisions](decisions.md)
- [Negative Memory](failures.md)
- [Projects](projects.md)
`;
}

function compileDecisions(db: UmosDatabase): string {
  const rows = db
    .prepare(
      "SELECT * FROM events WHERE type = 'decision' ORDER BY timestamp DESC, importance DESC LIMIT 200"
    )
    .all() as EventRow[];

  return `# Decisions

${rows.map(formatEvent).join("\n\n") || "_No decisions applied yet._"}
`;
}

function compileFailures(db: UmosDatabase): string {
  const rows = db
    .prepare("SELECT * FROM failures ORDER BY created_at DESC LIMIT 200")
    .all() as FailureRow[];

  return `# Negative Memory

${rows.map(formatFailure).join("\n\n") || "_No negative memory applied yet._"}
`;
}

function compileProjects(db: UmosDatabase): string {
  const projects = loadProjects(db);
  return `# Projects

${projects.map((project) => `- [${project}](projects/${slugify(project)}.md)`).join("\n") || "_No project-tagged memory yet._"}
`;
}

function compileProject(db: UmosDatabase, project: string): string {
  const events = db
    .prepare("SELECT * FROM events WHERE project = ? ORDER BY timestamp DESC LIMIT 100")
    .all(project) as EventRow[];
  const failures = db
    .prepare("SELECT * FROM failures WHERE project = ? ORDER BY created_at DESC LIMIT 100")
    .all(project) as FailureRow[];

  return `# ${project}

## Events And Decisions

${events.map(formatEvent).join("\n\n") || "_No events yet._"}

## Negative Memory

${failures.map(formatFailure).join("\n\n") || "_No failures yet._"}
`;
}

function formatEvent(row: EventRow): string {
  return `## ${escapeMd(row.summary)}

- Type: \`${row.type}\`
- Captured: ${row.timestamp}
- Confidence: ${row.confidence.toFixed(2)}
- Citation: ${formatCitations(row.source_ids_json, row.section_ids_json)}
`;
}

function formatFailure(row: FailureRow): string {
  return `## ${escapeMd(row.attempted)}

- Failed because: ${escapeMd(row.failed_because)}
- Do not repeat: ${escapeMd(row.do_not_repeat)}
- Confidence: ${row.confidence.toFixed(2)}
- Citation: ${formatCitations(row.source_ids_json, row.section_ids_json)}
`;
}

function formatCitations(sourceIdsJson: string, sectionIdsJson: string): string {
  const sourceIds = parseArray(sourceIdsJson);
  const sectionIds = parseArray(sectionIdsJson);
  return `sources ${sourceIds.map((id) => `\`${id}\``).join(", ") || "none"}; sections ${sectionIds.map((id) => `\`${id}\``).join(", ") || "none"}`;
}

function loadProjects(db: UmosDatabase): string[] {
  const rows = db
    .prepare(
      `
      SELECT DISTINCT project FROM events WHERE project IS NOT NULL AND project != ''
      UNION
      SELECT DISTINCT project FROM failures WHERE project IS NOT NULL AND project != ''
      ORDER BY project ASC
      `
    )
    .all() as Array<{ project: string }>;
  return rows.map((row) => row.project);
}

function count(db: UmosDatabase, table: string): number {
  return (db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as { count: number }).count;
}

function writePage(dir: string, name: string, content: string): string {
  const path = join(dir, name);
  const store = hostedArtifactStore(findVaultRoot(dir));
  if (store) return store.write(path, content, "wiki");
  writeFileSync(path, content, "utf8");
  return path;
}

function findVaultRoot(path: string): string {
  const normalized = path.replaceAll("\\", "/");
  const marker = "/wiki";
  const index = normalized.lastIndexOf(marker);
  return index >= 0 ? normalized.slice(0, index) : path;
}

function parseArray(value: string): string[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function escapeMd(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

interface EventRow {
  type: string;
  summary: string;
  timestamp: string;
  confidence: number;
  source_ids_json: string;
  section_ids_json: string;
}

interface FailureRow {
  attempted: string;
  failed_because: string;
  do_not_repeat: string;
  confidence: number;
  source_ids_json: string;
  section_ids_json: string;
}
