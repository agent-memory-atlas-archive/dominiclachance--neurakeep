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
  serviceToken?: string | string[];
  readWrite?: boolean;
  ui?: boolean;
  hosted?: boolean;
  firebaseProject?: string;
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
    serviceTokens: serviceTokens(options.serviceToken),
    readOnly: !options.readWrite,
    serveUi: Boolean(options.ui),
    hosted: {
      enabled: Boolean(options.hosted) || process.env.NEURAKEEP_HOSTED === "1",
      firebaseProjectId: options.firebaseProject ?? process.env.FIREBASE_PROJECT_ID
    }
  });
}

function serviceTokens(value: string | string[] | undefined): string[] {
  const cliTokens = Array.isArray(value) ? value : value ? [value] : [];
  const envTokens = (process.env.NEURAKEEP_SERVICE_TOKENS ?? "")
    .split(",")
    .map((token) => token.trim())
    .filter(Boolean);
  return Array.from(new Set([...cliTokens, ...envTokens]));
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
