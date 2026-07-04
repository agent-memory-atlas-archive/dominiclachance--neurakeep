import { existsSync } from "node:fs";
import { migrateDatabase, openDatabase } from "../../db/client.js";
import { runEvalCases, seedEvalCases } from "../../eval/harness.js";
import { activeMemorySpaces, parseEnumValue } from "../../memory/metadata.js";
import { getVaultPaths, resolveVaultRoot } from "../../core/paths.js";

export interface EvalCommandOptions {
  local?: boolean;
  root?: string;
  space?: string;
  limit?: string;
  neighbors?: string;
  seed?: boolean;
  json?: boolean;
}

export function evalCommand(options: EvalCommandOptions): void {
  const root = resolveVaultRoot({
    local: options.local,
    root: options.root
  });
  const paths = getVaultPaths(root);

  if (!existsSync(paths.configPath) || !existsSync(paths.dbPath)) {
    throw new Error(`No initialized NeuraKeep vault found at ${paths.root}`);
  }

  const space = parseEnumValue(activeMemorySpaces, options.space, "space", "personal");
  const limit = parseBoundedInteger(options.limit, 5, 1, 50, "limit");
  const neighbors = parseBoundedInteger(options.neighbors, 0, 0, 2, "neighbors");

  const db = openDatabase(paths.dbPath);
  try {
    migrateDatabase(db);

    if (options.seed) {
      const seeded = seedEvalCases(db, space);
      if (options.json) {
        console.log(JSON.stringify({ seeded }, null, 2));
        return;
      }
      console.log(seeded > 0 ? `Seeded ${seeded} eval cases.` : "Eval cases already exist.");
      return;
    }

    const result = runEvalCases(db, {
      limit,
      neighbors,
      space
    });

    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }

    console.log(`Eval cases: ${result.caseCount}`);
    console.log(`Hits: ${result.hitCount}`);
    console.log(`Recall@${limit}: ${result.recallAtLimit.toFixed(2)}`);
    for (const evalResult of result.results) {
      console.log(
        `  ${evalResult.hit ? "hit" : "miss"} ${evalResult.id}: ${evalResult.query} -> ${evalResult.topResultId ?? "none"}`
      );
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
