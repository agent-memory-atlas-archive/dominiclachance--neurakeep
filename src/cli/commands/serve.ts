import { existsSync } from "node:fs";
import { exportStaticApp } from "../../app/export.js";
import { getVaultPaths, resolveVaultRoot } from "../../core/paths.js";
import { migrateDatabase, openDatabase } from "../../db/client.js";
import { runHttpMcpServer } from "../../mcp/http.js";

export interface ServeCommandOptions {
  local?: boolean;
  root?: string;
  host?: string;
  port?: string;
  token?: string;
  readWrite?: boolean;
  ui?: boolean;
}

export function serveCommand(options: ServeCommandOptions): void {
  const root = resolveVaultRoot({ local: options.local, root: options.root });
  const paths = getVaultPaths(root);
  if (!existsSync(paths.configPath) || !existsSync(paths.dbPath)) {
    throw new Error(`No initialized NeuraKeep vault found at ${paths.root}`);
  }

  if (options.ui) {
    const db = openDatabase(paths.dbPath);
    try {
      migrateDatabase(db);
      exportStaticApp(db, paths);
    } finally {
      db.close();
    }
  }

  runHttpMcpServer(paths, {
    host: options.host ?? "127.0.0.1",
    port: parsePort(options.port),
    token: options.token ?? process.env.NEURAKEEP_MCP_TOKEN,
    readOnly: !options.readWrite,
    serveUi: Boolean(options.ui)
  });
}

function parsePort(value: string | undefined): number {
  if (!value) {
    return 8890;
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
    throw new Error("port must be an integer between 1 and 65535");
  }
  return parsed;
}
