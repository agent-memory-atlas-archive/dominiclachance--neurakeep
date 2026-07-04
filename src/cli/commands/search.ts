import { existsSync } from "node:fs";
import { migrateDatabase, openDatabase } from "../../db/client.js";
import { activeMemorySpaces, parseEnumValue } from "../../memory/metadata.js";
import { searchSections } from "../../search/fts.js";
import { getVaultPaths, resolveVaultRoot } from "../../core/paths.js";

export interface SearchCommandOptions {
  local?: boolean;
  root?: string;
  space?: string;
  limit?: string;
  neighbors?: string;
  project?: string;
  includeSecret?: boolean;
  json?: boolean;
}

export function searchCommand(query: string, options: SearchCommandOptions): void {
  const root = resolveVaultRoot({
    local: options.local,
    root: options.root
  });
  const paths = getVaultPaths(root);

  if (!existsSync(paths.configPath) || !existsSync(paths.dbPath)) {
    throw new Error(`No initialized NeuraKeep vault found at ${paths.root}`);
  }

  const space = options.space
    ? parseEnumValue(activeMemorySpaces, options.space, "space", "personal")
    : undefined;
  const limit = parseBoundedInteger(options.limit, 10, 1, 50, "limit");
  const neighbors = parseBoundedInteger(options.neighbors, 0, 0, 2, "neighbors");

  const db = openDatabase(paths.dbPath);
  try {
    migrateDatabase(db);
    const results = searchSections(db, {
      query,
      limit,
      space,
      neighbors,
      project: options.project,
      includeSecret: options.includeSecret
    });

    if (options.json) {
      console.log(JSON.stringify({ query, results }, null, 2));
      return;
    }

    if (results.length === 0) {
      console.log("No results.");
      return;
    }

    for (const [index, result] of results.entries()) {
      console.log(`${index + 1}. ${result.heading ?? result.sourceTitle ?? result.id}`);
      console.log(`   id: ${result.id}`);
      console.log(`   source: ${result.sourceTitle ?? result.sourceId} (${result.sourceId})`);
      console.log(
        `   meta: space=${result.space}, trust=${result.trustLevel}, origin=${result.sourceOrigin}, sensitivity=${result.sensitivity}`
      );
      console.log(`   score: ${result.score.toFixed(2)}`);
      console.log(`   snippet: ${result.snippet}`);
      if (result.relatedFailures.length > 0) {
        console.log("   known failed paths:");
        for (const failure of result.relatedFailures) {
          console.log(`     - ${failure.doNotRepeat} (${failure.id})`);
        }
      }
      if (result.neighbors.length > 0) {
        console.log(`   neighbors: ${result.neighbors.map((neighbor) => neighbor.id).join(", ")}`);
      }
    }
  } finally {
    db.close();
  }
}

function parseBoundedInteger(
  value: string | undefined,
  fallback: number,
  min: number,
  max: number,
  name: string
): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`${name} must be an integer between ${min} and ${max}`);
  }
  return parsed;
}
