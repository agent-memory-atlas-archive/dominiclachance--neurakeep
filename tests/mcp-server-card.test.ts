import { once } from "node:events";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { initCommand } from "../src/cli/commands/init.js";
import { getVaultPaths } from "../src/core/paths.js";
import { handleJsonRpcRequest } from "../src/mcp/server.js";
import { NEURAKEEP_VERSION, neurakeepServerCard, neurakeepTools } from "../src/mcp/manifest.js";
import { runHttpMcpServer } from "../src/mcp/http.js";
import { openDatabase } from "../src/db/client.js";

const tempRoots: string[] = [];

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("MCP static server card", () => {
  it("shares exact server and tool metadata with MCP initialize and tools/list", () => {
    const projectDir = mkdtempSync(join(tmpdir(), "neurakeep-card-parity-"));
    tempRoots.push(projectDir);
    const root = join(projectDir, ".umos");
    initCommand({ root });
    const paths = getVaultPaths(root);
    const db = openDatabase(paths.dbPath);

    try {
      const initialize = handleJsonRpcRequest(db, paths, { jsonrpc: "2.0", id: 1, method: "initialize" });
      const tools = handleJsonRpcRequest(db, paths, { jsonrpc: "2.0", id: 2, method: "tools/list" });
      const card = neurakeepServerCard() as {
        serverInfo: unknown;
        tools: unknown;
        authentication: unknown;
        resources: unknown[];
        prompts: unknown[];
      };

      expect(card.serverInfo).toEqual((initialize?.result as { serverInfo: unknown }).serverInfo);
      expect(card.tools).toEqual((tools?.result as { tools: unknown }).tools);
      expect(card.tools).toEqual(neurakeepTools());
      expect(card.authentication).toEqual({ required: true, schemes: ["oauth2"] });
      expect(card.resources).toEqual([]);
      expect(card.prompts).toEqual([]);
    } finally {
      db.close();
    }
  });

  it("uses the same version as the published package metadata", () => {
    const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as { version: string };
    expect(NEURAKEEP_VERSION).toBe("0.2.0");
    expect(packageJson.version).toBe(NEURAKEEP_VERSION);
  });

  it("serves metadata publicly without leaking vault content or credentials", async () => {
    const projectDir = mkdtempSync(join(tmpdir(), "neurakeep-card-http-"));
    tempRoots.push(projectDir);
    const root = join(projectDir, ".umos");
    initCommand({ root });
    const canary = "PRIVATE_MEMORY_CANARY_7f9d3a";
    writeFileSync(join(projectDir, "private-memory.md"), `${canary}\nBearer top-secret-token`, "utf8");
    const paths = getVaultPaths(root);
    const server = runHttpMcpServer(paths, {
      host: "127.0.0.1",
      port: 0,
      token: "top-secret-token",
      serviceTokens: ["another-secret-token"],
      readOnly: false,
      serveUi: false,
      hosted: { enabled: false }
    });

    try {
      await once(server, "listening");
      const address = server.address() as AddressInfo;
      const response = await fetch(`http://127.0.0.1:${address.port}/.well-known/mcp/server-card.json`);
      const text = await response.text();
      const protectedResponse = await fetch(`http://127.0.0.1:${address.port}/mcp`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" })
      });

      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain("application/json");
      expect(JSON.parse(text)).toEqual(neurakeepServerCard());
      expect(text).not.toContain(canary);
      expect(text).not.toContain("top-secret-token");
      expect(text).not.toContain("another-secret-token");
      expect(protectedResponse.status).toBe(401);
    } finally {
      server.close();
      await once(server, "close");
    }
  });
});
