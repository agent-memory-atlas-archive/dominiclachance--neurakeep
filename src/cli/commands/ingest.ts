import { existsSync } from "node:fs";
import { migrateDatabase, openDatabase } from "../../db/client.js";
import { ingestFile } from "../../ingest/ingest.js";
import {
  activeMemorySpaces,
  defaultMemoryMetadata,
  parseEnumValue,
  sensitivityLevels,
  sourceOrigins,
  trustLevels,
  visibilityLevels
} from "../../memory/metadata.js";
import { getVaultPaths, resolveVaultRoot } from "../../core/paths.js";

export interface IngestCommandOptions {
  kind?: string;
  local?: boolean;
  root?: string;
  space?: string;
  trustLevel?: string;
  origin?: string;
  visibility?: string;
  sensitivity?: string;
  json?: boolean;
}

export function ingestCommand(path: string, options: IngestCommandOptions): void {
  const root = resolveVaultRoot({
    local: options.local,
    root: options.root
  });
  const paths = getVaultPaths(root);

  if (!existsSync(paths.configPath) || !existsSync(paths.dbPath)) {
    throw new Error(`No initialized NeuraKeep vault found at ${paths.root}`);
  }

  const kind = parseEnumValue(
    ["session", "note", "markdown", "pdf"] as const,
    options.kind,
    "kind",
    inferKind(path)
  );
  const metadata = {
    space: parseEnumValue(activeMemorySpaces, options.space, "space", "personal"),
    trustLevel: parseEnumValue(
      trustLevels,
      options.trustLevel,
      "trust-level",
      defaultMemoryMetadata.trustLevel
    ),
    sourceOrigin: parseEnumValue(
      sourceOrigins,
      options.origin,
      "origin",
      kind === "session" ? "session" : defaultMemoryMetadata.sourceOrigin
    ),
    visibility: parseEnumValue(
      visibilityLevels,
      options.visibility,
      "visibility",
      defaultMemoryMetadata.visibility
    ),
    sensitivity: parseEnumValue(
      sensitivityLevels,
      options.sensitivity,
      "sensitivity",
      defaultMemoryMetadata.sensitivity
    )
  };

  const db = openDatabase(paths.dbPath);
  try {
    migrateDatabase(db);
    const result = ingestFile(db, paths, {
      path,
      kind,
      ...metadata
    });

    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }

    if (result.skipped) {
      console.log(`Already ingested: ${result.sourceId}`);
      return;
    }

    console.log(`Ingested ${path}`);
    console.log(`  episode: ${result.episodeId}`);
    console.log(`  source: ${result.sourceId}`);
    console.log(`  sections: ${result.sectionIds.length}`);
    console.log(`  raw: ${result.rawPath}`);
    if (result.riskFlags.length > 0) {
      console.log(`  risk flags: ${result.riskFlags.join(", ")}`);
    }
  } finally {
    db.close();
  }
}

function inferKind(path: string): "session" | "note" | "markdown" | "pdf" {
  const lower = path.toLowerCase();
  if (lower.endsWith(".pdf")) {
    return "pdf";
  }
  if (lower.endsWith(".jsonl") || lower.includes("session") || lower.includes("transcript")) {
    return "session";
  }
  if (lower.endsWith(".md") || lower.endsWith(".markdown")) {
    return "markdown";
  }
  return "note";
}
