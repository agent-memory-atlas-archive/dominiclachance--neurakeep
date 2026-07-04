import { existsSync } from "node:fs";
import { getVaultPaths, resolveVaultRoot } from "../../core/paths.js";
import { runMcpServer } from "../../mcp/server.js";

export interface McpCommandOptions {
  local?: boolean;
  root?: string;
}

export function mcpCommand(options: McpCommandOptions): void {
  const root = resolveVaultRoot({ local: options.local, root: options.root });
  const paths = getVaultPaths(root);
  if (!existsSync(paths.configPath) || !existsSync(paths.dbPath)) {
    throw new Error(`No initialized NeuraKeep vault found at ${paths.root}`);
  }

  runMcpServer(paths);
}
