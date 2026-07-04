import { existsSync } from "node:fs";
import { readConfig } from "../../core/config.js";
import { getVaultPaths, resolveVaultRoot } from "../../core/paths.js";
import { migrateDatabase, openDatabase, tableCounts } from "../../db/client.js";

export interface StatusOptions {
  local?: boolean;
  root?: string;
  json?: boolean;
}

export function statusCommand(options: StatusOptions): void {
  const root = resolveVaultRoot({
    local: options.local,
    root: options.root
  });
  const paths = getVaultPaths(root);

  const status = {
    root: paths.root,
    initialized: existsSync(paths.configPath) && existsSync(paths.dbPath),
    configExists: existsSync(paths.configPath),
    databaseExists: existsSync(paths.dbPath),
    directories: {
      raw: existsSync(paths.rawDir),
      events: existsSync(paths.eventsDir),
      wiki: existsSync(paths.wikiDir),
      inbox: existsSync(paths.inboxDir),
      logs: existsSync(paths.logsDir)
    },
    config: existsSync(paths.configPath) ? readConfig(paths) : null,
    counts: null as Record<string, number> | null
  };

  if (status.databaseExists) {
    const db = openDatabase(paths.dbPath);
    try {
      migrateDatabase(db);
      status.counts = tableCounts(db);
    } finally {
      db.close();
    }
  }

  if (options.json) {
    console.log(JSON.stringify(status, null, 2));
    return;
  }

  console.log(`NeuraKeep vault: ${status.root}`);
  console.log(`Initialized: ${status.initialized ? "yes" : "no"}`);
  console.log(`Config: ${status.configExists ? "yes" : "no"}`);
  console.log(`Database: ${status.databaseExists ? "yes" : "no"}`);
  console.log("Directories:");
  for (const [name, exists] of Object.entries(status.directories)) {
    console.log(`  ${name}: ${exists ? "yes" : "no"}`);
  }
  if (status.counts) {
    console.log("Records:");
    for (const [name, count] of Object.entries(status.counts)) {
      console.log(`  ${name}: ${count}`);
    }
  }
}
