import { readFileSync, writeFileSync } from "node:fs";
import type { VaultPaths } from "./paths.js";

export interface UmosConfig {
  version: 1;
  createdAt: string;
  root: string;
  storage: {
    database: "memory.sqlite";
  };
  wiki: {
    directory: "wiki";
    format: "markdown";
  };
  raw: {
    directory: "raw";
  };
}

export function createDefaultConfig(paths: VaultPaths): UmosConfig {
  return {
    version: 1,
    createdAt: new Date().toISOString(),
    root: paths.root,
    storage: {
      database: "memory.sqlite"
    },
    wiki: {
      directory: "wiki",
      format: "markdown"
    },
    raw: {
      directory: "raw"
    }
  };
}

export function writeConfig(paths: VaultPaths, config: UmosConfig): void {
  writeFileSync(paths.configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
}

export function readConfig(paths: VaultPaths): UmosConfig {
  return JSON.parse(readFileSync(paths.configPath, "utf8")) as UmosConfig;
}

