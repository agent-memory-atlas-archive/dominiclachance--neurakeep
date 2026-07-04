import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";

export interface ResolveVaultOptions {
  cwd?: string;
  local?: boolean;
  root?: string;
}

export interface VaultPaths {
  root: string;
  configPath: string;
  dbPath: string;
  rawDir: string;
  eventsDir: string;
  wikiDir: string;
  inboxDir: string;
  pendingUpdatesDir: string;
  logsDir: string;
}

export function resolveVaultRoot(options: ResolveVaultOptions = {}): string {
  const cwd = resolve(options.cwd ?? process.cwd());

  if (options.root) {
    return resolvePath(options.root, cwd);
  }

  if (options.local) {
    return join(cwd, ".umos");
  }

  const projectVault = findNearestProjectVault(cwd);
  if (projectVault) {
    return projectVault;
  }

  return join(homedir(), ".umos");
}

export function getVaultPaths(root: string): VaultPaths {
  return {
    root,
    configPath: join(root, "config.json"),
    dbPath: join(root, "memory.sqlite"),
    rawDir: join(root, "raw"),
    eventsDir: join(root, "events"),
    wikiDir: join(root, "wiki"),
    inboxDir: join(root, "inbox"),
    pendingUpdatesDir: join(root, "inbox", "pending-updates"),
    logsDir: join(root, "logs")
  };
}

function resolvePath(pathValue: string, cwd: string): string {
  return isAbsolute(pathValue) ? pathValue : resolve(cwd, pathValue);
}

function findNearestProjectVault(start: string): string | null {
  let current = start;

  while (true) {
    const candidate = join(current, ".umos");
    if (
      existsSync(join(candidate, "config.json")) ||
      existsSync(join(candidate, "memory.sqlite"))
    ) {
      return candidate;
    }

    const parent = dirname(current);
    if (parent === current) {
      return null;
    }
    current = parent;
  }
}

