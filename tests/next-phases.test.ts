import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildGraphView } from "../src/app/export.js";
import { initCommand } from "../src/cli/commands/init.js";
import { getVaultPaths } from "../src/core/paths.js";
import { seedEvalCases } from "../src/eval/harness.js";
import { openDatabase } from "../src/db/client.js";
import { ingestFile } from "../src/ingest/ingest.js";
import { redactSensitiveContent } from "../src/ingest/security.js";
import { listExtractionReports } from "../src/memory/extraction-reports.js";
import { applyProposal, proposeSourceExtraction } from "../src/memory/proposals.js";
import { selfMemoryPolicy } from "../src/memory/self-policy.js";
import { searchSections } from "../src/search/fts.js";

const tempRoots: string[] = [];

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("next phases", () => {
  it("runs a command extractor through validation, comparison scoring, and report storage", () => {
    const projectDir = mkdtempSync(join(tmpdir(), "neurakeep-llm-"));
    tempRoots.push(projectDir);
    const root = join(projectDir, ".umos");
    initCommand({ root });
    const paths = getVaultPaths(root);
    const db = openDatabase(paths.dbPath);

    try {
      const notePath = join(projectDir, "llm-source.md");
      writeFileSync(notePath, "# Decision\n\nWe decided to keep queue-first memory writes.", "utf8");
      const ingest = ingestFile(db, paths, {
        path: notePath,
        kind: "markdown",
        space: "project",
        trustLevel: "trusted",
        sourceOrigin: "manual",
        visibility: "private",
        sensitivity: "internal"
      });
      const commandPath = join(projectDir, "extractor.cjs");
      writeFileSync(
        commandPath,
        `
let input = "";
process.stdin.on("data", chunk => input += chunk);
process.stdin.on("end", () => {
  const payload = JSON.parse(input);
  const section = payload.sections[0];
  process.stdout.write(JSON.stringify({
    events: [{ type: "decision", summary: "Keep queue-first memory writes.", sourceIds: [payload.source.id], sectionIds: [section.id], confidence: 0.91 }],
    facts: [{ subject: "NeuraKeep", predicate: "uses", object: "queue-first memory writes", sourceIds: [payload.source.id], sectionIds: [section.id], confidence: 0.9 }],
    failures: []
  }));
});
`,
        "utf8"
      );

      const proposal = proposeSourceExtraction(db, ingest.sourceId, {
        extractor: "command",
        extractorCommand: `node "${commandPath}"`,
        reportPaths: paths
      });
      expect(proposal.extractionScore.citationCoverage).toBe(1);
      expect(proposal.extractionScore.gate.passed).toBe(true);
      expect(proposal.extractionReport?.proposalId).toBe(proposal.proposalId);
      expect(listExtractionReports(paths).some((row) => row.proposalId === proposal.proposalId)).toBe(true);
    } finally {
      db.close();
    }
  });

  it("boosts failure-memory retrieval and seeds do-not-repeat eval cases", () => {
    const projectDir = mkdtempSync(join(tmpdir(), "neurakeep-rank-"));
    tempRoots.push(projectDir);
    const root = join(projectDir, ".umos");
    initCommand({ root });
    const paths = getVaultPaths(root);
    const db = openDatabase(paths.dbPath);

    try {
      const notePath = join(projectDir, "failure.md");
      writeFileSync(
        notePath,
        "# Failed Path\n\nDo not repeat the stale production rebuild without sourced environment variables.",
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
      const proposal = proposeSourceExtraction(db, ingest.sourceId, { reportPaths: paths });
      applyProposal(db, paths, proposal.proposalId);

      const results = searchSections(db, {
        query: "what should I not repeat from the production rebuild mistake",
        limit: 5,
        space: "project",
        neighbors: 1
      });
      expect(results[0]?.rank.failureMemory).toBeGreaterThan(0);
      expect(results[0]?.relatedFailures[0]?.doNotRepeat).toContain("Do not repeat");
      expect(seedEvalCases(db, "project")).toBeGreaterThan(0);
    } finally {
      db.close();
    }
  });

  it("redacts watcher-import secrets before session/profile persistence", () => {
    const fakeKey = `sk-${"abcdefghijklmnopqrstuvwxyz"}`;
    const redacted = redactSensitiveContent(`MODEL_KEY="${fakeKey}"`);
    expect(redacted.redactions).toContain("openai_key_like");
    expect(redacted.redacted).not.toContain(fakeKey);
  });

  it("keeps graph rendering progressive and expands a clicked neighborhood", () => {
    const projectDir = mkdtempSync(join(tmpdir(), "neurakeep-graph-"));
    tempRoots.push(projectDir);
    const root = join(projectDir, ".umos");
    initCommand({ root });
    const paths = getVaultPaths(root);
    const db = openDatabase(paths.dbPath);

    try {
      for (let index = 0; index < 24; index += 1) {
        const notePath = join(projectDir, `note-${index}.md`);
        writeFileSync(notePath, `# Note ${index}\n\nDecision ${index}: keep graph neighborhoods bounded.`, "utf8");
        ingestFile(db, paths, {
          path: notePath,
          kind: "markdown",
          space: "project",
          trustLevel: "observed",
          sourceOrigin: "manual",
          visibility: "private",
          sensitivity: "internal"
        });
      }
      const overview = buildGraphView(db, { limit: 20 });
      expect(overview.meta.totalNodes).toBeGreaterThan(20);
      expect(overview.nodes.length).toBeLessThanOrEqual(25);
      expect(overview.meta.truncated).toBe(true);
      const focusId = overview.nodes[0]?.id;
      expect(focusId).toBeTruthy();
      const focused = buildGraphView(db, { focusId, depth: 1, limit: 50 });
      expect(focused.meta.focusId).toBe(focusId);
      expect(focused.nodes.some((node) => node.id === focusId)).toBe(true);
    } finally {
      db.close();
    }
  });

  it("keeps durable memory auto-apply disabled by policy", () => {
    expect(selfMemoryPolicy.durableAutoApply).toEqual([
      expect.stringContaining("None.")
    ]);
    expect(selfMemoryPolicy.autoIndexOnly.length).toBeGreaterThan(0);
  });

  it("documents local MCP clients and manual imports", () => {
    const mcp = readFileSync("docs/MCP_INTEGRATIONS.md", "utf8");
    const manual = readFileSync("docs/MANUAL_IMPORTS.md", "utf8");
    expect(mcp).toContain("OpenClaw");
    expect(mcp).toContain("Claude Code");
    expect(mcp).toContain("Claude Desktop");
    expect(mcp).toContain("Codex");
    expect(mcp).toContain("memory_search");
    expect(mcp).toContain("/api/integrations/status");
    expect(mcp).toContain("/api/workflow/daily-loop");
    expect(mcp).toContain("guidance.recommendedNextStep");
    expect(manual).toContain("PDFs");
    expect(manual).toContain("--kind pdf");
    expect(manual).toContain("/api/import/supported");
    expect(manual).toContain("proposal-reviewed");
    expect(existsSync("docs/MCP_INTEGRATIONS.md")).toBe(true);
  });
});
