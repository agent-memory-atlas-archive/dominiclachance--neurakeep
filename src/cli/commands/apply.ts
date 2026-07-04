import { existsSync } from "node:fs";
import { getVaultPaths, resolveVaultRoot } from "../../core/paths.js";
import { migrateDatabase, openDatabase } from "../../db/client.js";
import { applyProposal } from "../../memory/proposals.js";

export interface ApplyCommandOptions {
  local?: boolean;
  root?: string;
  json?: boolean;
}

export function applyCommand(proposalId: string, options: ApplyCommandOptions): void {
  const root = resolveVaultRoot({ local: options.local, root: options.root });
  const paths = getVaultPaths(root);
  if (!existsSync(paths.configPath) || !existsSync(paths.dbPath)) {
    throw new Error(`No initialized NeuraKeep vault found at ${paths.root}`);
  }

  const db = openDatabase(paths.dbPath);
  try {
    migrateDatabase(db);
    const result = applyProposal(db, paths, proposalId);
    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }

    console.log(`Applied proposal: ${result.proposalId}`);
    console.log(
      `Inserted ${result.inserted.events} events, ${result.inserted.facts} facts, ${result.inserted.failures} failures.`
    );
    console.log(`Compiled wiki pages: ${result.wikiPaths.length}`);
  } finally {
    db.close();
  }
}
