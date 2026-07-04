import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createDefaultConfig, writeConfig } from "../../core/config.js";
import { getVaultPaths, resolveVaultRoot } from "../../core/paths.js";
import { migrateDatabase, openDatabase } from "../../db/client.js";

export interface InitOptions {
  local?: boolean;
  root?: string;
}

export function initCommand(options: InitOptions): void {
  const root = resolveVaultRoot({
    local: options.local,
    root: options.root
  });
  const paths = getVaultPaths(root);

  mkdirSync(paths.root, { recursive: true });
  mkdirSync(join(paths.rawDir, "sessions"), { recursive: true });
  mkdirSync(join(paths.rawDir, "notes"), { recursive: true });
  mkdirSync(join(paths.rawDir, "docs"), { recursive: true });
  mkdirSync(join(paths.rawDir, "episodes"), { recursive: true });
  mkdirSync(paths.eventsDir, { recursive: true });
  mkdirSync(join(paths.wikiDir, "projects"), { recursive: true });
  mkdirSync(join(paths.wikiDir, "people"), { recursive: true });
  mkdirSync(join(paths.wikiDir, "systems"), { recursive: true });
  mkdirSync(paths.pendingUpdatesDir, { recursive: true });
  mkdirSync(paths.logsDir, { recursive: true });

  if (!existsSync(paths.configPath)) {
    writeConfig(paths, createDefaultConfig(paths));
  }

  const db = openDatabase(paths.dbPath);
  try {
    migrateDatabase(db);
  } finally {
    db.close();
  }

  writeTemplateIfMissing(join(paths.wikiDir, "index.md"), wikiIndexTemplate());
  writeTemplateIfMissing(join(paths.wikiDir, "decisions.md"), "# Decisions\n\n");
  writeTemplateIfMissing(join(paths.wikiDir, "failures.md"), "# Negative Memory\n\n");
  writeTemplateIfMissing(join(paths.wikiDir, "projects.md"), "# Projects\n\n");

  console.log(`Initialized NeuraKeep vault at ${paths.root}`);
}

function writeTemplateIfMissing(path: string, content: string): void {
  if (!existsSync(path)) {
    writeFileSync(path, content, "utf8");
  }
}

function wikiIndexTemplate(): string {
  return `# NeuraKeep

This wiki is a compiled, human-readable view over the local memory engine.

## Core Pages

- [Decisions](decisions.md)
- [Negative Memory](failures.md)
- [Projects](projects.md)

`;
}
