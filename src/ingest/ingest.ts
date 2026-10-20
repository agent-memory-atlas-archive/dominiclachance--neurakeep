import type Database from "better-sqlite3";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { basename, dirname, extname, join, resolve } from "node:path";
import { createId, sha256 } from "../core/ids.js";
import type { VaultPaths } from "../core/paths.js";
import type { UmosDatabase } from "../db/client.js";
import type { MemoryMetadata } from "../memory/metadata.js";
import { downgradeTrustForSafety, scanContentForSafety } from "./security.js";
import { splitContentIntoSections } from "./split.js";
import { hostedArtifactStore } from "../security/artifact-store.js";

export interface IngestInput extends MemoryMetadata {
  path: string;
  kind: "session" | "note" | "markdown" | "pdf";
}

export interface IngestResult {
  skipped: boolean;
  episodeId: string;
  sourceId: string;
  sectionIds: string[];
  contentHash: string;
  rawPath: string;
  riskFlags: string[];
}

export function ingestFile(
  db: UmosDatabase,
  paths: VaultPaths,
  input: IngestInput
): IngestResult {
  const sourcePath = resolve(input.path);
  const content = readFileSync(sourcePath);
  const extracted = extractIndexText(input.kind, sourcePath, content);
  const contentText = extracted.text;
  const contentHash = sha256(content);
  const existing = db
    .prepare("SELECT id, episode_id, raw_path FROM sources WHERE content_hash = ?")
    .get(contentHash) as ExistingSource | undefined;

  if (existing) {
    return {
      skipped: true,
      episodeId: existing.episode_id ?? "",
      sourceId: existing.id,
      sectionIds: selectSectionIds(db, existing.id),
      contentHash,
      rawPath: existing.raw_path,
      riskFlags: []
    };
  }

  const scan = scanContentForSafety(contentText);
  const trustLevel = downgradeTrustForSafety(input.trustLevel, scan);
  const now = new Date().toISOString();
  const episodeId = createId("ep");
  const sourceId = createId("src");
  const rawPath = copyRawEpisode(paths, episodeId, sourcePath, content);
  const title = basename(sourcePath);
  const sections = splitContentIntoSections(input.kind, contentText);
  const sectionIds = sections.map(() => createId("sec"));

  const metadata = JSON.stringify({
    original_path: sourcePath,
    extracted_kind: input.kind,
    extracted_text_chars: contentText.length,
    risk_flags: scan.riskFlags,
    secret_hints: scan.secretHints,
    poisoning_hints: scan.poisoningHints,
    extraction_warnings: extracted.warnings
  });

  const insertEpisode = db.prepare(`
    INSERT INTO episodes (
      id, kind, title, uri, content_hash, captured_at, source_time, space,
      trust_level, source_origin, visibility, sensitivity, raw_path, metadata_json
    ) VALUES (
      @id, @kind, @title, @uri, @content_hash, @captured_at, @source_time, @space,
      @trust_level, @source_origin, @visibility, @sensitivity, @raw_path, @metadata_json
    )
  `);

  const insertSource = db.prepare(`
    INSERT INTO sources (
      id, episode_id, kind, uri, title, content_hash, captured_at, source_time,
      space, trust_level, source_origin, visibility, sensitivity, raw_path, metadata_json
    ) VALUES (
      @id, @episode_id, @kind, @uri, @title, @content_hash, @captured_at, @source_time,
      @space, @trust_level, @source_origin, @visibility, @sensitivity, @raw_path, @metadata_json
    )
  `);

  const insertSection = db.prepare(`
    INSERT INTO sections (
      id, source_id, heading, body, ordinal, previous_section_id, next_section_id,
      token_estimate, space, trust_level, source_origin, visibility, sensitivity, metadata_json
    ) VALUES (
      @id, @source_id, @heading, @body, @ordinal, @previous_section_id, @next_section_id,
      @token_estimate, @space, @trust_level, @source_origin, @visibility, @sensitivity,
      @metadata_json
    )
  `);

  const transaction = db.transaction(() => {
    insertEpisode.run({
      id: episodeId,
      kind: input.kind,
      title,
      uri: sourcePath,
      content_hash: contentHash,
      captured_at: now,
      source_time: null,
      space: input.space,
      trust_level: trustLevel,
      source_origin: input.sourceOrigin,
      visibility: input.visibility,
      sensitivity: input.sensitivity,
      raw_path: rawPath,
      metadata_json: metadata
    });

    insertSource.run({
      id: sourceId,
      episode_id: episodeId,
      kind: input.kind,
      uri: sourcePath,
      title,
      content_hash: contentHash,
      captured_at: now,
      source_time: null,
      space: input.space,
      trust_level: trustLevel,
      source_origin: input.sourceOrigin,
      visibility: input.visibility,
      sensitivity: input.sensitivity,
      raw_path: rawPath,
      metadata_json: metadata
    });

    for (const [index, section] of sections.entries()) {
      insertSection.run({
        id: sectionIds[index],
        source_id: sourceId,
        heading: section.heading,
        body: section.body,
        ordinal: section.ordinal,
        previous_section_id: index > 0 ? sectionIds[index - 1] : null,
        next_section_id: index < sectionIds.length - 1 ? sectionIds[index + 1] : null,
        token_estimate: section.tokenEstimate,
        space: input.space,
        trust_level: trustLevel,
        source_origin: input.sourceOrigin,
        visibility: input.visibility,
        sensitivity: input.sensitivity,
        metadata_json: JSON.stringify({
          episode_id: episodeId,
          risk_flags: scan.riskFlags
        })
      });
    }
  }) as Database.Transaction;

  transaction();

  return {
    skipped: false,
    episodeId,
    sourceId,
    sectionIds,
    contentHash,
    rawPath,
    riskFlags: scan.riskFlags
  };
}

function extractIndexText(
  kind: IngestInput["kind"],
  sourcePath: string,
  content: Buffer
): { text: string; warnings: string[] } {
  if (kind !== "pdf") {
    return { text: content.toString("utf8"), warnings: [] };
  }

  const cliPath = pdfParseCliPath();
  const child = spawnSync(process.execPath, [cliPath, "text", sourcePath, "--format", "text"], {
    encoding: "utf8",
    maxBuffer: 50 * 1024 * 1024
  });
  if (child.error || child.status !== 0) {
    const ocr = tryOcrPdf(sourcePath);
    if (ocr.text) return ocr;
    if (child.error) throw child.error;
    throw new Error(child.stderr || `PDF extraction failed with status ${child.status}`);
  }
  const text = child.stdout.replace(/\r\n/g, "\n").trim();
  if (!text) {
    const ocr = tryOcrPdf(sourcePath);
    if (ocr.text) return ocr;
    throw new Error(`PDF appears scanned and OCR tools were unavailable. Install Poppler pdftoppm and Tesseract, then import again: ${sourcePath}`);
  }
  return {
    text: `# ${basename(sourcePath)}\n\n${text}`,
    warnings: child.stderr.trim() ? [child.stderr.trim().slice(0, 500)] : []
  };
}

function tryOcrPdf(sourcePath: string): { text: string; warnings: string[] } {
  const pdftoppm = findBinary("pdftoppm");
  const tesseract = findBinary("tesseract");
  if (!pdftoppm || !tesseract) {
    return { text: "", warnings: ["PDF has no embedded text; OCR requires local Poppler pdftoppm and Tesseract binaries."] };
  }
  const workDir = mkdtempSync(join(tmpdir(), "umos-ocr-"));
  try {
    const prefix = join(workDir, "page");
    const render = spawnSync(pdftoppm, ["-png", "-r", "180", "-f", "1", "-l", "12", sourcePath, prefix], {
      encoding: "utf8",
      maxBuffer: 10 * 1024 * 1024
    });
    if (render.error || render.status !== 0) {
      return { text: "", warnings: [`OCR render failed: ${render.error?.message ?? render.stderr}`.slice(0, 500)] };
    }
    const pages = readdirSync(workDir)
      .filter((name) => name.endsWith(".png"))
      .sort()
      .slice(0, 12);
    const chunks: string[] = [];
    const warnings: string[] = ["PDF had no embedded text; indexed local OCR output from the first 12 pages."];
    for (const page of pages) {
      const imagePath = join(workDir, page);
      const ocr = spawnSync(tesseract, [imagePath, "stdout", "--psm", "1"], {
        encoding: "utf8",
        maxBuffer: 25 * 1024 * 1024
      });
      if (ocr.status === 0 && ocr.stdout.trim()) {
        chunks.push(`## ${page}\n\n${ocr.stdout.trim()}`);
      } else if (ocr.stderr.trim()) {
        warnings.push(ocr.stderr.trim().slice(0, 300));
      }
    }
    const text = chunks.join("\n\n").trim();
    return text ? { text: `# ${basename(sourcePath)}\n\n${text}`, warnings } : { text: "", warnings };
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
}

function findBinary(name: string): string | null {
  const command = process.platform === "win32" ? "where.exe" : "which";
  const found = spawnSync(command, [name], { encoding: "utf8" });
  if (found.status !== 0) return null;
  return found.stdout.split(/\r?\n/).map((line) => line.trim()).find(Boolean) ?? null;
}

function pdfParseCliPath(): string {
  const require = createRequire(import.meta.url);
  const entry = require.resolve("pdf-parse");
  return resolve(dirname(entry), "..", "..", "..", "bin", "cli.mjs");
}

interface ExistingSource {
  id: string;
  episode_id: string | null;
  raw_path: string;
}

function copyRawEpisode(paths: VaultPaths, episodeId: string, sourcePath: string, content: Buffer): string {
  const rawDir = join(paths.rawDir, "episodes");
  mkdirSync(rawDir, { recursive: true });
  const extension = extname(sourcePath) || ".txt";
  const rawPath = join(rawDir, `${episodeId}${extension}`);
  const store = hostedArtifactStore(paths.root);
  if (store) return store.write(rawPath, content, "raw");
  const { copyFileSync } = requireFs();
  copyFileSync(sourcePath, rawPath);
  return rawPath;
}

function requireFs(): typeof import("node:fs") {
  return createRequire(import.meta.url)("node:fs") as typeof import("node:fs");
}

function selectSectionIds(db: UmosDatabase, sourceId: string): string[] {
  const rows = db
    .prepare("SELECT id FROM sections WHERE source_id = ? ORDER BY ordinal ASC")
    .all(sourceId) as Array<{ id: string }>;
  return rows.map((row) => row.id);
}
