import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { VaultPaths } from "../core/paths.js";
import type { UmosDatabase } from "../db/client.js";
import { ingestFile } from "../ingest/ingest.js";
import { proposeSourceExtraction } from "./proposals.js";
import { selfMemoryPolicy } from "./self-policy.js";

export function queueSelfMemorySummary(
  db: UmosDatabase,
  paths: VaultPaths,
  reason: "heartbeat" | "session-close" | "manual" = "manual"
): Record<string, unknown> {
  const today = new Date().toISOString().slice(0, 10);
  const workspaceRoot = resolve(paths.root, "..", "..", "..");
  const dailyPath = join(workspaceRoot, "memory", `${today}.md`);
  const body = existsSync(dailyPath)
    ? readFileSync(dailyPath, "utf8").slice(0, 14000)
    : `# ${today}\n\nNo daily workspace memory file exists yet.`;
  mkdirSync(paths.inboxDir, { recursive: true });
  const summaryPath = join(paths.inboxDir, `self-memory-${reason}-${today}.md`);
  writeFileSync(
    summaryPath,
    [
      `# Self Memory ${reason} ${today}`,
      "",
      `Source: ${dailyPath}`,
      `Policy: queue-only proposal under NeuraKeep Self-Memory Policy v${selfMemoryPolicy.version}`,
      "",
      body
    ].join("\n"),
    "utf8"
  );
  const ingest = ingestFile(db, paths, {
    path: summaryPath,
    kind: "markdown",
    space: "system",
    trustLevel: "observed",
    sourceOrigin: "agent",
    visibility: "private",
    sensitivity: "internal"
  });
  const proposal = ingest.skipped ? null : proposeSourceExtraction(db, ingest.sourceId, { reportPaths: paths });
  return { reason, summaryPath, ingest, proposal, policy: selfMemoryPolicy };
}
