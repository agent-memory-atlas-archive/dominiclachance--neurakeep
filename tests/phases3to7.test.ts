import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { exportStaticApp } from "../src/app/export.js";
import { initCommand } from "../src/cli/commands/init.js";
import { getVaultPaths } from "../src/core/paths.js";
import { openDatabase } from "../src/db/client.js";
import { ingestFile } from "../src/ingest/ingest.js";
import { handleJsonRpcRequest } from "../src/mcp/server.js";
import { applyProposal, proposeSourceExtraction } from "../src/memory/proposals.js";
import { selfMemoryPolicy } from "../src/memory/self-policy.js";
import { searchSections } from "../src/search/fts.js";

const tempRoots: string[] = [];

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("phases 3 to 7", () => {
  it("hides secret records by default and includes rank breakdowns", () => {
    const projectDir = mkdtempSync(join(tmpdir(), "neurakeep-p3-"));
    tempRoots.push(projectDir);
    const root = join(projectDir, ".umos");
    initCommand({ root });
    const paths = getVaultPaths(root);
    const db = openDatabase(paths.dbPath);

    try {
      const publicNote = join(projectDir, "public.md");
      const secretNote = join(projectDir, "secret.md");
      writeFileSync(publicNote, "# Public\n\nProduction rebuild uses production env.", "utf8");
      writeFileSync(secretNote, "# Secret\n\nProduction rebuild secret token note.", "utf8");

      ingestFile(db, paths, {
        path: publicNote,
        kind: "markdown",
        space: "project",
        trustLevel: "verified",
        sourceOrigin: "manual",
        visibility: "private",
        sensitivity: "normal"
      });
      ingestFile(db, paths, {
        path: secretNote,
        kind: "markdown",
        space: "project",
        trustLevel: "verified",
        sourceOrigin: "manual",
        visibility: "private",
        sensitivity: "secret"
      });

      const defaultResults = searchSections(db, {
        query: "production rebuild",
        limit: 10,
        space: "project",
        neighbors: 0
      });
      expect(defaultResults.every((result) => result.sensitivity !== "secret")).toBe(true);
      expect(defaultResults[0]?.rank.total).toBeGreaterThan(0);

      const secretResults = searchSections(db, {
        query: "production rebuild",
        limit: 10,
        space: "project",
        neighbors: 0,
        includeSecret: true
      });
      expect(secretResults.some((result) => result.sensitivity === "secret")).toBe(true);
    } finally {
      db.close();
    }
  });

  it("creates proposals, applies structured memory, compiles wiki, and exports graph app", () => {
    const projectDir = mkdtempSync(join(tmpdir(), "neurakeep-p7-"));
    tempRoots.push(projectDir);
    const root = join(projectDir, ".umos");
    initCommand({ root });
    const paths = getVaultPaths(root);
    const db = openDatabase(paths.dbPath);

    try {
      const notePath = join(projectDir, "decision.md");
      writeFileSync(
        notePath,
        `# Decision

We decided to use NeuraKeep as the product name.

## Failed Path

Do not rebuild production without sourced environment variables.
`,
        "utf8"
      );
      const ingest = ingestFile(db, paths, {
        path: notePath,
        kind: "markdown",
        space: "project",
        trustLevel: "trusted",
        sourceOrigin: "manual",
        visibility: "private",
        sensitivity: "internal"
      });

      const proposal = proposeSourceExtraction(db, ingest.sourceId);
      expect(proposal.diff.events.length).toBeGreaterThan(0);
      expect(proposal.diff.failures.length).toBeGreaterThan(0);

      const applied = applyProposal(db, paths, proposal.proposalId);
      expect(applied.inserted.events).toBeGreaterThan(0);
      expect(applied.inserted.failures).toBeGreaterThan(0);
      expect(readFileSync(join(paths.wikiDir, "decisions.md"), "utf8")).toContain("NeuraKeep");
      expect(readFileSync(join(paths.wikiDir, "failures.md"), "utf8")).toContain("Do not");

      const app = exportStaticApp(db, paths);
      expect(existsSync(app.indexPath)).toBe(true);
      expect(existsSync(app.graphPath)).toBe(true);
      const html = readFileSync(app.indexPath, "utf8");
      expect(html).toContain("<div id=\"root\"></div>");
      expect(html).toContain("/assets/");
      const assetDir = join(app.appDir, "assets");
      expect(existsSync(assetDir)).toBe(true);
      const assetText = readdirSync(assetDir)
        .filter((name) => name.endsWith(".js") || name.endsWith(".css"))
        .map((name) => readFileSync(join(assetDir, name), "utf8"))
        .join("\n");
      expect(assetText).toContain("memory_read");
      expect(assetText).toContain("Proposal Inbox");
      expect(assetText).toContain("Start Watcher");
      expect(assetText).toContain("Auth / User");
      expect(assetText).toContain("Diff preview");
      expect(assetText).toContain("Alt-drag");
      expect(assetText).toContain("overflow:hidden");
      expect(html).not.toContain("miniMap");
      expect(html).not.toContain("minimap");
      expect(app.nodeCount).toBeGreaterThan(0);
      expect(app.edgeCount).toBeGreaterThan(0);
    } finally {
      db.close();
    }
  });

  it("documents NeuraKeep self-memory as queue-first and never saves secrets", () => {
    expect(selfMemoryPolicy.queuedOnly.join(" ")).toContain("Raw OpenClaw");
    expect(selfMemoryPolicy.neverSave.join(" ")).toContain("Secrets");
    expect(selfMemoryPolicy.closeLoop.join(" ")).toContain("proposed for review");
  });

  it("returns retrieval guidance through MCP search", () => {
    const projectDir = mkdtempSync(join(tmpdir(), "neurakeep-mcp-guidance-"));
    tempRoots.push(projectDir);
    const root = join(projectDir, ".umos");
    initCommand({ root });
    const paths = getVaultPaths(root);
    const db = openDatabase(paths.dbPath);

    try {
      const notePath = join(projectDir, "lesson.md");
      writeFileSync(notePath, "# Lesson\n\nDo not repeat a production rebuild without sourced environment variables.", "utf8");
      ingestFile(db, paths, {
        path: notePath,
        kind: "markdown",
        space: "project",
        trustLevel: "trusted",
        sourceOrigin: "manual",
        visibility: "private",
        sensitivity: "internal"
      });

      const response = handleJsonRpcRequest(db, paths, {
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: {
          name: "memory_search",
          arguments: { query: "do not repeat production rebuild", limit: 5, neighbors: 1 }
        }
      }) as { result?: { structuredContent?: { guidance?: Record<string, unknown>; results?: unknown[] } } };
      const structured = response.result?.structuredContent;
      expect(structured?.results?.length).toBeGreaterThan(0);
      expect(structured?.guidance?.recommendedNextStep).toContain("source");
      expect(structured?.guidance?.citationCount).toBeGreaterThan(0);
    } finally {
      db.close();
    }
  });
});
