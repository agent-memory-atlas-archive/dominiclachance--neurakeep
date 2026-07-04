import { existsSync } from "node:fs";
import { getVaultPaths, resolveVaultRoot } from "../../core/paths.js";
import { migrateDatabase, openDatabase } from "../../db/client.js";
import { proposeSourceExtraction } from "../../memory/proposals.js";

export interface ProposeCommandOptions {
  local?: boolean;
  root?: string;
  extractor?: string;
  extractorCommand?: string;
  json?: boolean;
}

export function proposeCommand(source: string, options: ProposeCommandOptions): void {
  const root = resolveVaultRoot({ local: options.local, root: options.root });
  const paths = getVaultPaths(root);
  if (!existsSync(paths.configPath) || !existsSync(paths.dbPath)) {
    throw new Error(`No initialized NeuraKeep vault found at ${paths.root}`);
  }

  const db = openDatabase(paths.dbPath);
  try {
    migrateDatabase(db);
    const extractor = options.extractor === "command" ? "command" : "deterministic";
    const result = proposeSourceExtraction(db, source, {
      extractor,
      extractorCommand: options.extractorCommand,
      reportPaths: paths
    });
    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }

    console.log(`Created proposal: ${result.proposalId}`);
    console.log(`Source: ${result.sourceId}`);
    console.log(result.summary);
  } finally {
    db.close();
  }
}
