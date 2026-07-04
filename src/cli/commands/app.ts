import { existsSync } from "node:fs";
import { exportStaticApp } from "../../app/export.js";
import { getVaultPaths, resolveVaultRoot } from "../../core/paths.js";
import { migrateDatabase, openDatabase } from "../../db/client.js";

export interface AppCommandOptions {
  local?: boolean;
  root?: string;
  json?: boolean;
}

export function appCommand(options: AppCommandOptions): void {
  const root = resolveVaultRoot({ local: options.local, root: options.root });
  const paths = getVaultPaths(root);
  if (!existsSync(paths.configPath) || !existsSync(paths.dbPath)) {
    throw new Error(`No initialized NeuraKeep vault found at ${paths.root}`);
  }

  const db = openDatabase(paths.dbPath);
  try {
    migrateDatabase(db);
    const result = exportStaticApp(db, paths);
    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }

    console.log(`Exported NeuraKeep app: ${result.indexPath}`);
    console.log(`Graph: ${result.nodeCount} nodes, ${result.edgeCount} edges`);
  } finally {
    db.close();
  }
}
