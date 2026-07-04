import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { homedir } from "node:os";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  watch,
  writeFileSync,
  type FSWatcher
} from "node:fs";
import { basename, dirname, extname, join, normalize, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readGraphState, writeGraphState } from "../app/state.js";
import type { VaultPaths } from "../core/paths.js";
import { migrateDatabase, openDatabase, type UmosDatabase } from "../db/client.js";
import { exportStaticApp, buildGraphView } from "../app/export.js";
import { ingestFile } from "../ingest/ingest.js";
import { redactSensitiveContent, scanContentForSafety } from "../ingest/security.js";
import {
  appendWatcherHistory,
  readPersistedWatcherState,
  writePersistedWatcherState
} from "../ingest/watcher-state.js";
import { listProfileFiles, resolveWatcherProfile, watcherProfiles } from "../ingest/watcher-profiles.js";
import { scoreExtraction } from "../memory/extraction-eval.js";
import { listExtractionReports, recordExtractionReport } from "../memory/extraction-reports.js";
import { loadExtractionInput, type ExtractedMemory } from "../memory/extractor.js";
import {
  factsSnapshot,
  listGovernorAudit,
  recordGovernorAudit,
  supersedeTimeline,
  undoGovernorAudit
} from "../memory/governor-audit.js";
import { governProposalDiff } from "../memory/governor.js";
import { applyProposal, proposeSourceExtraction } from "../memory/proposals.js";
import { inspectMemoryQuality } from "../memory/quality.js";
import { queueSelfMemorySummary } from "../memory/self-loop.js";
import { selfMemoryPolicy } from "../memory/self-policy.js";
import { retrievalGuidance, searchSections, type SearchResult } from "../search/fts.js";
import { handleJsonRpcRequest } from "./server.js";

export interface HttpMcpServerOptions {
  host: string;
  port: number;
  token?: string;
  readOnly: boolean;
  serveUi: boolean;
}

interface WatchState {
  watchers: FSWatcher[];
  folders: string[];
  debounceMs: number;
  running: boolean;
  startedAt: string;
  queuedAt?: string;
  lastRunAt?: string;
  lastResult?: Record<string, unknown>;
  lastError?: string;
  runCount: number;
  recursive: boolean;
  profileId?: string;
  policy?: IngestPolicy;
  timer?: ReturnType<typeof setTimeout>;
}

const watchStates = new Map<string, WatchState>();

interface IngestPolicy {
  space: "personal" | "project" | "system";
  trustLevel: "untrusted" | "observed" | "trusted" | "verified";
  sourceOrigin: "manual" | "local_file" | "session" | "agent" | "connector" | "import" | "system";
  visibility: "private" | "space" | "team" | "client" | "public";
  sensitivity: "normal" | "internal" | "confidential" | "secret";
}

interface AuthSettingsFile {
  mode: "local" | "remote";
  user: {
    displayName: string;
    role: "owner" | "operator" | "viewer";
    allowWrites: boolean;
  };
}

export function runHttpMcpServer(paths: VaultPaths, options: HttpMcpServerOptions): void {
  const db = openDatabase(paths.dbPath);
  migrateDatabase(db);
  restorePersistedWatcher(db, paths);

  const server = createServer(async (req, res) => {
    try {
      setCors(res);

      if (req.method === "OPTIONS") {
        res.writeHead(204);
        res.end();
        return;
      }

      if (req.url === "/health" && req.method === "GET") {
        sendJson(res, 200, {
          ok: true,
          name: "neurakeep",
          transport: "http",
          mode: options.readOnly ? "read-only" : "read-write"
        });
        return;
      }

      if (req.url === "/mcp" && req.method === "GET") {
        sendJson(res, 200, {
          name: "neurakeep",
          endpoint: "/mcp",
          protocol: "json-rpc-over-http"
        });
        return;
      }

      if (req.url === "/mcp" && req.method === "POST") {
        if (!authorizeRequest(req, options)) {
          sendJson(res, 401, { error: "unauthorized" });
          return;
        }
        const body = await readBody(req);
        const payload = JSON.parse(body) as unknown;
        const response = Array.isArray(payload)
          ? payload.map((item) => handleHttpRequest(db, paths, item, options.readOnly)).filter(Boolean)
          : handleHttpRequest(db, paths, payload, options.readOnly);
        sendJson(res, 200, response);
        return;
      }

      if (req.url?.startsWith("/api/")) {
        if (!authorizeRequest(req, options)) {
          sendJson(res, 401, { error: "unauthorized" });
          return;
        }
        await handleApiRequest(db, paths, req, res, options);
        return;
      }

      if (options.serveUi && req.method === "GET") {
        const served = tryServeUi(paths, req, res);
        if (served) {
          return;
        }
      }

      sendJson(res, 404, { error: "not_found" });
    } catch (error) {
      sendJson(res, 500, {
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  server.listen(options.port, options.host, () => {
    process.stderr.write(
      `NeuraKeep HTTP MCP listening on http://${options.host}:${options.port}/mcp\n`
    );
  });

  const close = (): void => {
    stopAutoIngestWatcher(paths);
    server.close();
    db.close();
  };
  process.once("SIGINT", close);
  process.once("SIGTERM", close);
}

async function handleApiRequest(
  db: UmosDatabase,
  paths: VaultPaths,
  req: IncomingMessage,
  res: ServerResponse,
  options: HttpMcpServerOptions
): Promise<void> {
  const url = new URL(req.url ?? "/", "http://127.0.0.1");
  const readOnly = options.readOnly;

  if (url.pathname === "/api/auth/settings" && req.method === "GET") {
    sendJson(res, 200, authSettings(paths, options));
    return;
  }

  if (url.pathname === "/api/auth/settings" && req.method === "POST") {
    assertWritable(readOnly, "auth settings");
    const body = JSON.parse((await readBody(req)) || "{}") as Partial<AuthSettingsFile>;
    const result = writeAuthSettings(paths, body, options);
    sendJson(res, 200, result);
    return;
  }

  if (url.pathname === "/api/graph" && req.method === "GET") {
    const graph = buildGraphView(db, {
      focusId: url.searchParams.get("focus"),
      depth: Number(url.searchParams.get("depth") ?? 1),
      limit: Number(url.searchParams.get("limit") ?? 180)
    });
    exportStaticApp(db, paths);
    sendJson(res, 200, { ...graph, state: readGraphState(paths) });
    return;
  }

  if (url.pathname === "/api/search" && req.method === "GET") {
    sendJson(res, 200, searchMemory(db, url.searchParams));
    return;
  }

  if (url.pathname === "/api/integrations/status" && req.method === "GET") {
    sendJson(res, 200, integrationStatus(db, paths, options));
    return;
  }

  if (url.pathname === "/api/workflow/daily-loop" && req.method === "GET") {
    sendJson(res, 200, dailyWorkflowStatus(db, paths, options));
    return;
  }

  if (url.pathname === "/api/workflow/daily-loop" && req.method === "POST") {
    assertWritable(readOnly, "daily workflow loop");
    const body = JSON.parse((await readBody(req)) || "{}") as { queueSummary?: boolean; reason?: string };
    const result = body.queueSummary === false ? null : queueSelfMemorySummary(db, paths, "session-close");
    const sync = syncWorkspaceMemoryFiles(db, paths);
    exportStaticApp(db, paths);
    sendJson(res, 200, {
      ok: true,
      queued: result,
      sync,
      status: dailyWorkflowStatus(db, paths, options),
      queueOnly: true
    });
    return;
  }

  if (url.pathname === "/api/search/presets" && req.method === "GET") {
    sendJson(res, 200, { presets: readSearchPresets(paths) });
    return;
  }

  if (url.pathname === "/api/search/presets" && req.method === "POST") {
    assertWritable(readOnly, "search presets");
    const body = JSON.parse((await readBody(req)) || "{}") as { name?: string; query?: string; filters?: Record<string, unknown> };
    sendJson(res, 200, { presets: saveSearchPreset(paths, body) });
    return;
  }

  if (url.pathname === "/api/search/presets/delete" && req.method === "POST") {
    assertWritable(readOnly, "search presets");
    const body = JSON.parse((await readBody(req)) || "{}") as { name?: string };
    sendJson(res, 200, { presets: deleteSearchPreset(paths, String(body.name ?? "")) });
    return;
  }

  if (url.pathname === "/api/graph/state" && req.method === "GET") {
    sendJson(res, 200, readGraphState(paths));
    return;
  }

  if (url.pathname === "/api/graph/state" && req.method === "POST") {
    assertWritable(readOnly, "save graph state");
    const body = JSON.parse((await readBody(req)) || "{}") as Record<string, unknown>;
    sendJson(res, 200, writeGraphState(paths, body));
    return;
  }

  if (url.pathname === "/api/inbox" && req.method === "GET") {
    sendJson(res, 200, { files: listInboxFiles(paths) });
    return;
  }

  if (url.pathname === "/api/ingest" && req.method === "POST") {
    assertWritable(readOnly, "ingest");
    const body = JSON.parse(await readBody(req)) as { path?: string; kind?: string };
    const sourcePath = requireInboxPath(paths, String(body.path ?? ""));
    const result = ingestFile(db, paths, {
      path: sourcePath,
      kind: normalizeIngestKind(body.kind),
      space: "project",
      trustLevel: "observed",
      sourceOrigin: "manual",
      visibility: "private",
      sensitivity: "normal"
    });
    exportStaticApp(db, paths);
    sendJson(res, 200, result);
    return;
  }

  if (url.pathname === "/api/import" && req.method === "POST") {
    assertWritable(readOnly, "manual import");
    const body = JSON.parse((await readBody(req)) || "{}") as { path?: string; kind?: string };
    const sourcePath = requireManualImportPath(paths, String(body.path ?? ""));
    const kind = body.kind && body.kind !== "auto" ? normalizeIngestKind(body.kind) : kindFromExtension(sourcePath);
    const ingest = ingestFile(db, paths, {
      path: sourcePath,
      kind,
      space: "project",
      trustLevel: "observed",
      sourceOrigin: "manual",
      visibility: "private",
      sensitivity: "internal"
    });
    const proposal = ingest.skipped ? null : proposeSourceExtraction(db, ingest.sourceId, { reportPaths: paths });
    exportStaticApp(db, paths);
    sendJson(res, 200, { ingest, proposal, queueOnly: true });
    return;
  }

  if (url.pathname === "/api/import/upload" && req.method === "POST") {
    assertWritable(readOnly, "manual upload");
    const body = JSON.parse((await readBody(req, 35_000_000)) || "{}") as {
      fileName?: string;
      kind?: string;
      contentBase64?: string;
    };
    const fileName = safeUploadName(String(body.fileName ?? "memory-upload.txt"));
    const uploadDir = join(paths.inboxDir, "manual-uploads");
    mkdirSync(uploadDir, { recursive: true });
    const uploadPath = join(uploadDir, `${Date.now()}-${fileName}`);
    writeFileSync(uploadPath, Buffer.from(String(body.contentBase64 ?? ""), "base64"));
    const kind = body.kind && body.kind !== "auto" ? normalizeIngestKind(body.kind) : kindFromExtension(uploadPath);
    const ingest = ingestFile(db, paths, {
      path: uploadPath,
      kind,
      space: "project",
      trustLevel: "observed",
      sourceOrigin: "manual",
      visibility: "private",
      sensitivity: "internal"
    });
    const proposal = ingest.skipped ? null : proposeSourceExtraction(db, ingest.sourceId, { reportPaths: paths });
    exportStaticApp(db, paths);
    sendJson(res, 200, { uploadPath, ingest, proposal, queueOnly: true });
    return;
  }

  if (url.pathname === "/api/import/ocr-health" && req.method === "GET") {
    sendJson(res, 200, ocrHealth());
    return;
  }

  if (url.pathname === "/api/import/supported" && req.method === "GET") {
    sendJson(res, 200, importSupport(paths));
    return;
  }

  if (url.pathname === "/api/auto-ingest" && req.method === "POST") {
    assertWritable(readOnly, "auto-ingest");
    const body = JSON.parse((await readBody(req)) || "{}") as { profileId?: string };
    const profile = resolveWatcherProfile(paths, body.profileId);
    const result = autoIngestQueue(db, paths, {
      extraFolders: profile?.folders,
      recursive: profile?.recursive,
      policy: profile?.policy,
      profileId: profile?.id
    });
    appendWatcherHistory(paths, {
      at: new Date().toISOString(),
      profileId: profile?.id,
      folders: profile?.folders ?? [paths.inboxDir],
      recursive: Boolean(profile?.recursive),
      ok: true,
      ingested: Array.isArray(result.ingested) ? result.ingested.length : 0,
      proposals: Array.isArray(result.proposals) ? result.proposals.length : 0
    });
    exportStaticApp(db, paths);
    sendJson(res, 200, result);
    return;
  }

  if (url.pathname === "/api/watch/profiles" && req.method === "GET") {
    sendJson(res, 200, { profiles: watcherProfiles(paths) });
    return;
  }

  if (url.pathname === "/api/watch/status" && req.method === "GET") {
    sendJson(res, 200, watchStatus(paths));
    return;
  }

  if (url.pathname === "/api/watch/start" && req.method === "POST") {
    assertWritable(readOnly, "watch start");
    const body = JSON.parse((await readBody(req)) || "{}") as {
      folders?: string[];
      debounceMs?: number;
      profileId?: string;
      recursive?: boolean;
    };
    sendJson(res, 200, startAutoIngestWatcher(db, paths, body));
    return;
  }

  if (url.pathname === "/api/watch/stop" && req.method === "POST") {
    assertWritable(readOnly, "watch stop");
    sendJson(res, 200, stopAutoIngestWatcher(paths));
    return;
  }

  if (url.pathname === "/api/self-policy" && req.method === "GET") {
    sendJson(res, 200, { policy: selfMemoryPolicy });
    return;
  }

  if (url.pathname === "/api/write-summary" && req.method === "POST") {
    assertWritable(readOnly, "write summary");
    const result = writeWorkspaceSummary(db, paths);
    exportStaticApp(db, paths);
    sendJson(res, 200, result);
    return;
  }

  if (url.pathname === "/api/self-memory/queue" && req.method === "POST") {
    assertWritable(readOnly, "self memory queue");
    const body = JSON.parse((await readBody(req)) || "{}") as { reason?: string };
    const reason = body.reason === "heartbeat" || body.reason === "session-close" ? body.reason : "manual";
    const result = queueSelfMemorySummary(db, paths, reason);
    const sync = reason === "heartbeat" || reason === "session-close" ? syncWorkspaceMemoryFiles(db, paths) : null;
    exportStaticApp(db, paths);
    sendJson(res, 200, { ...result, sync });
    return;
  }

  if (url.pathname === "/api/self-memory/session-close" && req.method === "POST") {
    assertWritable(readOnly, "session close memory queue");
    const result = queueSelfMemorySummary(db, paths, "session-close");
    const sync = syncWorkspaceMemoryFiles(db, paths);
    exportStaticApp(db, paths);
    sendJson(res, 200, { ...result, sync });
    return;
  }

  if (url.pathname === "/api/memory/sync" && req.method === "POST") {
    assertWritable(readOnly, "workspace memory sync");
    const result = syncWorkspaceMemoryFiles(db, paths);
    exportStaticApp(db, paths);
    sendJson(res, 200, result);
    return;
  }

  if (url.pathname === "/api/memory/dedupe" && req.method === "POST") {
    assertWritable(readOnly, "memory dedupe");
    const result = collapseDuplicateFacts(db, paths);
    exportStaticApp(db, paths);
    sendJson(res, 200, result);
    return;
  }

  if (url.pathname === "/api/memory/dedupe/fuzzy" && req.method === "POST") {
    assertWritable(readOnly, "fuzzy memory dedupe");
    const body = JSON.parse((await readBody(req)) || "{}") as { groupIds?: string[] };
    const result = collapseFuzzyDuplicateFacts(db, paths, body.groupIds);
    exportStaticApp(db, paths);
    sendJson(res, 200, result);
    return;
  }

  if (url.pathname === "/api/memory/dedupe/fuzzy-preview" && req.method === "GET") {
    sendJson(res, 200, { groups: fuzzyDuplicateFactPreview(db) });
    return;
  }

  const proposalMatch = /^\/api\/proposals\/([^/]+)$/.exec(url.pathname);
  if (url.pathname === "/api/proposals" && req.method === "GET") {
    sendJson(res, 200, {
      proposals: listProposalSummaries(db, paths, url.searchParams.get("status") ?? "pending", url.searchParams.get("filter") ?? "all")
    });
    return;
  }

  if (url.pathname === "/api/proposals/groups" && req.method === "GET") {
    sendJson(res, 200, { groups: proposalGroups(db, paths) });
    return;
  }

  if (url.pathname === "/api/proposals/bulk-status" && req.method === "POST") {
    assertWritable(readOnly, "bulk proposal status");
    const body = JSON.parse((await readBody(req)) || "{}") as { ids?: string[]; status?: string };
    const status = String(body.status ?? "");
    if (!["archived", "rejected"].includes(status)) {
      throw new Error("Bulk status supports archived or rejected only.");
    }
    const ids = Array.from(new Set((body.ids ?? []).map(String).filter(Boolean))).slice(0, 250);
    const update = db.prepare("UPDATE proposals SET status = ? WHERE id = ? AND status = 'pending'");
    let changed = 0;
    const tx = db.transaction(() => {
      for (const id of ids) {
        changed += update.run(status, id).changes;
      }
    });
    tx();
    sendJson(res, 200, { ok: true, status, requested: ids.length, changed });
    return;
  }

  if (url.pathname === "/api/proposals/archive-duplicates" && req.method === "POST") {
    assertWritable(readOnly, "archive duplicate proposals");
    sendJson(res, 200, archiveDuplicateProposals(db, paths));
    return;
  }

  if (url.pathname === "/api/proposals/apply-high-value-clean" && req.method === "POST") {
    assertWritable(readOnly, "apply high-value proposals");
    const body = JSON.parse((await readBody(req)) || "{}") as { limit?: number };
    const result = applyHighValueCleanProposals(db, paths, Math.max(1, Math.min(Number(body.limit ?? 25), 50)));
    exportStaticApp(db, paths);
    sendJson(res, 200, result);
    return;
  }

  if (url.pathname === "/api/proposals/triage-noisy" && req.method === "POST") {
    assertWritable(readOnly, "triage noisy proposals");
    const body = JSON.parse((await readBody(req)) || "{}") as { archive?: boolean; limit?: number };
    const result = triageNoisyWarningProposals(db, paths, {
      archive: body.archive === true,
      limit: Math.max(1, Math.min(Number(body.limit ?? 50), 100))
    });
    sendJson(res, 200, result);
    return;
  }

  if (proposalMatch && req.method === "GET") {
    const proposal = db.prepare("SELECT * FROM proposals WHERE id = ?").get(proposalMatch[1]);
    sendJson(res, proposal ? 200 : 404, proposal ? { proposal } : { error: "not_found" });
    return;
  }

  const proposalStatusMatch = /^\/api\/proposals\/([^/]+)\/status$/.exec(url.pathname);
  if (proposalStatusMatch && req.method === "POST") {
    assertWritable(readOnly, "proposal status");
    const body = JSON.parse((await readBody(req)) || "{}") as { status?: string };
    const status = String(body.status ?? "");
    if (!["pending", "archived", "rejected"].includes(status)) {
      throw new Error("Unsupported proposal status.");
    }
    db.prepare("UPDATE proposals SET status = ? WHERE id = ? AND status != 'applied'").run(status, proposalStatusMatch[1]);
    sendJson(res, 200, { ok: true, proposalId: proposalStatusMatch[1], status });
    return;
  }

  const saveProposalMatch = /^\/api\/proposals\/([^/]+)\/save$/.exec(url.pathname);
  if (saveProposalMatch && req.method === "POST") {
    assertWritable(readOnly, "save proposal");
    const body = JSON.parse(await readBody(req)) as { diff?: unknown };
    db.prepare("UPDATE proposals SET diff_json = ? WHERE id = ? AND status = 'pending'").run(
      JSON.stringify(body.diff ?? {}),
      saveProposalMatch[1]
    );
    sendJson(res, 200, { ok: true, proposalId: saveProposalMatch[1] });
    return;
  }

  const governorProposalMatch = /^\/api\/proposals\/([^/]+)\/governor$/.exec(url.pathname);
  if (governorProposalMatch && req.method === "GET") {
    const proposal = db.prepare("SELECT diff_json FROM proposals WHERE id = ?").get(governorProposalMatch[1]) as
      | { diff_json: string }
      | undefined;
    if (!proposal) {
      sendJson(res, 404, { error: "not_found" });
      return;
    }
    sendJson(res, 200, governProposalDiff(db, JSON.parse(proposal.diff_json)));
    return;
  }

  const extractionScoreMatch = /^\/api\/proposals\/([^/]+)\/extraction-score$/.exec(url.pathname);
  if (extractionScoreMatch && req.method === "GET") {
    const proposal = db
      .prepare("SELECT diff_json, source_ids_json FROM proposals WHERE id = ?")
      .get(extractionScoreMatch[1]) as { diff_json: string; source_ids_json: string } | undefined;
    if (!proposal) {
      sendJson(res, 404, { error: "not_found" });
      return;
    }
    const sourceIds = safeJsonArray(proposal.source_ids_json);
    const sourceId = sourceIds[0];
    if (!sourceId) {
      sendJson(res, 200, { score: null, warnings: ["Proposal has no source id."] });
      return;
    }
    const input = loadExtractionInput(db, sourceId);
    const score = scoreExtraction(JSON.parse(proposal.diff_json) as ExtractedMemory, input.deterministicDraft);
    const report = recordExtractionReport(paths, {
      proposalId: extractionScoreMatch[1],
      sourceId,
      extractor: "unknown",
      score
    });
    sendJson(res, 200, { score, report });
    return;
  }

  const applyProposalMatch = /^\/api\/proposals\/([^/]+)\/apply$/.exec(url.pathname);
  if (applyProposalMatch && req.method === "POST") {
    assertWritable(readOnly, "apply proposal");
    const bodyText = await readBody(req);
    if (bodyText.trim()) {
      const body = JSON.parse(bodyText) as { diff?: unknown };
      if (body.diff) {
        db.prepare("UPDATE proposals SET diff_json = ? WHERE id = ? AND status = 'pending'").run(
          JSON.stringify(body.diff),
          applyProposalMatch[1]
        );
      }
    }
    const result = applyProposal(db, paths, applyProposalMatch[1]);
    exportStaticApp(db, paths);
    sendJson(res, 200, result);
    return;
  }

  if (url.pathname === "/api/quality" && req.method === "GET") {
    sendJson(res, 200, inspectMemoryQuality(db));
    return;
  }

  if (url.pathname === "/api/quality/dashboard" && req.method === "GET") {
    sendJson(res, 200, qualityDashboard(db, paths));
    return;
  }

  if (url.pathname === "/api/extraction/reports" && req.method === "GET") {
    sendJson(res, 200, { reports: listExtractionReports(paths).slice(-100).reverse() });
    return;
  }

  const citationPreviewMatch = /^\/api\/citations\/([^/]+)\/preview$/.exec(url.pathname);
  if (citationPreviewMatch && req.method === "GET") {
    const preview = citationPreview(db, decodeURIComponent(citationPreviewMatch[1]));
    sendJson(res, preview ? 200 : 404, preview ? { preview } : { error: "not_found" });
    return;
  }

  if (url.pathname === "/api/governor/resolve" && req.method === "POST") {
    assertWritable(readOnly, "governor resolve");
    const body = JSON.parse(await readBody(req)) as {
      action?: string;
      winnerId?: string;
      loserIds?: string[];
      factIds?: string[];
    };
    sendJson(res, 200, resolveGovernorAction(db, paths, body));
    return;
  }

  if (url.pathname === "/api/governor/audit" && req.method === "GET") {
    sendJson(res, 200, { entries: listGovernorAudit(paths) });
    return;
  }

  if (url.pathname === "/api/governor/timeline" && req.method === "GET") {
    sendJson(res, 200, { timeline: supersedeTimeline(db) });
    return;
  }

  if (url.pathname === "/api/governor/undo" && req.method === "POST") {
    assertWritable(readOnly, "governor undo");
    const body = JSON.parse((await readBody(req)) || "{}") as { auditId?: string };
    sendJson(res, 200, undoGovernorAudit(db, paths, String(body.auditId ?? "")));
    return;
  }

  if (url.pathname === "/api/governor/preview" && req.method === "POST") {
    const body = JSON.parse((await readBody(req)) || "{}") as { factIds?: string[] };
    sendJson(res, 200, { facts: factsSnapshot(db, body.factIds ?? []) });
    return;
  }

  sendJson(res, 404, { error: "not_found" });
}

function searchMemory(db: UmosDatabase, params: URLSearchParams): Record<string, unknown> {
  const query = params.get("query") ?? "";
  const limit = Math.max(1, Math.min(Number(params.get("limit") ?? 20), 50));
  const memoryType = params.get("memoryType") ?? "all";
  const failuresOnly = params.get("failuresOnly") === "true" || memoryType === "failure";

  if (failuresOnly) {
    const results = searchFailures(db, query, limit);
    return {
      results,
      guidance: failureSearchGuidance(results),
      filters: Object.fromEntries(params.entries())
    };
  }

  let results = searchSections(db, {
    query,
    limit: Math.min(limit * 4, 50),
    neighbors: Number(params.get("neighbors") ?? 1),
    includeSecret: params.get("includeSecret") === "true",
    project: params.get("project") || undefined
  });

  const dateFrom = params.get("dateFrom");
  const dateTo = params.get("dateTo");
  const sensitivity = params.get("sensitivity") ?? "all";
  const sourceOrigin = params.get("sourceOrigin") ?? "all";

  results = results.filter((row) => {
    if (dateFrom && Date.parse(row.capturedAt) < Date.parse(dateFrom)) return false;
    if (dateTo && Date.parse(row.capturedAt) > Date.parse(`${dateTo}T23:59:59.999Z`)) return false;
    if (sensitivity !== "all" && row.sensitivity !== sensitivity) return false;
    if (sourceOrigin !== "all" && row.sourceOrigin !== sourceOrigin) return false;
    if (memoryType === "decision" && !/\b(decision|decided|chosen|direction|recommendation)\b/i.test(`${row.heading ?? ""} ${row.body}`)) return false;
    return true;
  });

  if (memoryType === "source") {
    const seen = new Set<string>();
    results = results.filter((row) => {
      if (seen.has(row.sourceId)) return false;
      seen.add(row.sourceId);
      row.id = row.sourceId;
      return true;
    });
  }

  return {
    results: results.slice(0, limit),
    guidance: retrievalGuidance(results.slice(0, limit)),
    filters: Object.fromEntries(params.entries())
  };
}

function searchFailures(db: UmosDatabase, query: string, limit: number): Array<Record<string, unknown>> {
  const tokens = queryTokens(query);
  if (tokens.length === 0) return [];
  const rows = db
    .prepare(
      `SELECT id, attempted, failed_because, do_not_repeat, confidence, created_at, space, trust_level, sensitivity, source_ids_json, section_ids_json
       FROM failures
       ORDER BY created_at DESC
       LIMIT 300`
    )
    .all() as Array<{
    id: string;
    attempted: string;
    failed_because: string;
    do_not_repeat: string;
    confidence: number;
    created_at: string;
    space: string;
    trust_level: string;
    sensitivity: string;
    source_ids_json: string;
    section_ids_json: string;
  }>;

  return rows
    .map((row) => {
      const text = `${row.attempted} ${row.failed_because} ${row.do_not_repeat}`.toLowerCase();
      const matches = tokens.filter((token) => text.includes(token)).length;
      return { row, matches };
    })
    .filter((item) => item.matches > 0)
    .sort((a, b) => b.matches - a.matches || b.row.confidence - a.row.confidence)
    .slice(0, limit)
    .map(({ row, matches }) => ({
      id: row.id,
      heading: row.attempted,
      sourceTitle: "Failure memory",
      snippet: `${row.failed_because} Do not repeat: ${row.do_not_repeat}`,
      score: matches + row.confidence,
      capturedAt: row.created_at,
      space: row.space,
      trustLevel: row.trust_level,
      sensitivity: row.sensitivity,
      sourceIds: safeJsonArray(row.source_ids_json),
      sectionIds: safeJsonArray(row.section_ids_json),
      relatedFailures: [{ id: row.id, doNotRepeat: row.do_not_repeat }]
    }));
}

function failureSearchGuidance(results: Array<Record<string, unknown>>): Record<string, unknown> {
  const doNotRepeat = results
    .flatMap((row) => Array.isArray(row.relatedFailures) ? row.relatedFailures : [])
    .map((failure) => String((failure as Record<string, unknown>).doNotRepeat ?? ""))
    .filter(Boolean)
    .slice(0, 5);
  return {
    confidence: results.length === 0 ? "none" : results.length >= 3 ? "high" : "medium",
    resultCount: results.length,
    citationCount: new Set(results.flatMap((row) => [...stringArray(row.sourceIds), ...stringArray(row.sectionIds)])).size,
    relatedFailureCount: doNotRepeat.length,
    doNotRepeat,
    recommendedNextStep: results.length === 0
      ? "No matching failure memory found. Search by the exact project, incident, or error phrase."
      : "Treat these as known failed paths. Read the cited failure/source before repeating a similar action."
  };
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String).filter(Boolean) : [];
}

function proposalGroups(db: UmosDatabase, paths: VaultPaths): Array<Record<string, unknown>> {
  const summaries = listProposalSummaries(db, paths, "pending", "all");
  const groups = new Map<string, { ids: string[]; clean: number; warnings: number; blocked: number; label: string }>();
  for (const row of summaries) {
    const date = String(row.createdAt ?? "").slice(0, 10) || "unknown-date";
    const risk = Number(row.blockedCount) > 0 ? "blocked" : Number(row.warningCount) > 0 ? "warnings" : "clean";
    const space = String(row.space ?? "space");
    const sensitivity = String(row.sensitivity ?? "normal");
    const key = `${date}|${space}|${sensitivity}|${risk}`;
    const group = groups.get(key) ?? { ids: [], clean: 0, warnings: 0, blocked: 0, label: `${date} / ${space} / ${sensitivity} / ${risk}` };
    group.ids.push(String(row.id));
    if (risk === "clean") group.clean += 1;
    if (risk === "warnings") group.warnings += 1;
    if (risk === "blocked") group.blocked += 1;
    groups.set(key, group);
  }
  return Array.from(groups.entries())
    .map(([key, group]) => ({ key, ...group, count: group.ids.length }))
    .sort((a, b) => String(b.key).localeCompare(String(a.key)));
}

function archiveDuplicateProposals(db: UmosDatabase, paths: VaultPaths): Record<string, unknown> {
  const rows = db
    .prepare("SELECT id, created_at, diff_json, source_ids_json FROM proposals WHERE status = 'pending' ORDER BY created_at DESC")
    .all() as Array<{ id: string; created_at: string; diff_json: string; source_ids_json: string }>;
  const groups = new Map<string, typeof rows>();
  for (const row of rows) {
    const signature = createHash("sha256")
      .update(`${normalizeJson(row.source_ids_json)}|${normalizeJson(row.diff_json)}`)
      .digest("hex");
    groups.set(signature, [...(groups.get(signature) ?? []), row]);
  }
  const archived: string[] = [];
  const update = db.prepare("UPDATE proposals SET status = 'archived' WHERE id = ? AND status = 'pending'");
  const tx = db.transaction(() => {
    for (const group of groups.values()) {
      for (const duplicate of group.slice(1)) {
        if (update.run(duplicate.id).changes > 0) archived.push(duplicate.id);
      }
    }
  });
  tx();
  if (archived.length > 0) {
    recordGovernorAudit(paths, {
      action: "archive_duplicate_proposals",
      targetIds: archived,
      before: [],
      after: []
    });
  }
  return { ok: true, archived, duplicateGroups: Array.from(groups.values()).filter((group) => group.length > 1).length };
}

function applyHighValueCleanProposals(db: UmosDatabase, paths: VaultPaths, limit: number): Record<string, unknown> {
  const summaries = listProposalSummaries(db, paths, "pending", "clean")
    .filter((row) => isHighValueProposal(row))
    .slice(0, limit);
  const applied: string[] = [];
  const skipped: Array<{ id: string; error: string }> = [];
  for (const row of summaries) {
    const id = String(row.id ?? "");
    if (!id) continue;
    try {
      applyProposal(db, paths, id);
      applied.push(id);
    } catch (error) {
      skipped.push({ id, error: error instanceof Error ? error.message : String(error) });
    }
  }
  if (applied.length > 0) {
    recordGovernorAudit(paths, {
      action: "apply_high_value_clean_proposals",
      targetIds: applied,
      before: [],
      after: []
    });
  }
  return { ok: true, applied, skipped, considered: summaries.length };
}

function isHighValueProposal(row: Record<string, unknown>): boolean {
  if (!row.clean || row.status !== "pending") return false;
  const counts = row.counts as { events?: number; facts?: number; failures?: number } | undefined;
  const itemCount = Number(counts?.events ?? 0) + Number(counts?.facts ?? 0) + Number(counts?.failures ?? 0);
  if (itemCount === 0) return false;
  const text = `${row.summary ?? ""} ${row.space ?? ""} ${row.sensitivity ?? ""}`.toLowerCase();
  if (Number(counts?.failures ?? 0) > 0) return true;
  return /\b(neurakeep|memory|promarkia|wisdomprompt|agentix|production|decision|decided|policy|mcp|openclaw|codex|claude|pdf|watcher|sync|dedupe|failure|do not repeat|seo|client|security|scheduler)\b/i.test(text);
}

function triageNoisyWarningProposals(
  db: UmosDatabase,
  paths: VaultPaths,
  options: { archive: boolean; limit: number }
): Record<string, unknown> {
  const warnings = listProposalSummaries(db, paths, "pending", "warnings");
  const noisy = warnings.filter((row) => isNoisyWarningProposal(row)).slice(0, options.limit);
  const keepReview = warnings.filter((row) => !isNoisyWarningProposal(row)).slice(0, options.limit);
  const archived: string[] = [];
  if (options.archive && noisy.length > 0) {
    const update = db.prepare("UPDATE proposals SET status = 'archived' WHERE id = ? AND status = 'pending'");
    const tx = db.transaction(() => {
      for (const row of noisy) {
        const id = String(row.id ?? "");
        if (id && update.run(id).changes > 0) archived.push(id);
      }
    });
    tx();
    recordGovernorAudit(paths, {
      action: "archive_noisy_warning_proposals",
      targetIds: archived,
      before: [],
      after: []
    });
  }
  return {
    ok: true,
    archived,
    noisy: noisy.map(proposalTriageSummary),
    keepForReview: keepReview.map(proposalTriageSummary),
    totalWarnings: warnings.length
  };
}

function isNoisyWarningProposal(row: Record<string, unknown>): boolean {
  const counts = row.counts as { events?: number; facts?: number; failures?: number } | undefined;
  const itemCount = Number(counts?.events ?? 0) + Number(counts?.facts ?? 0) + Number(counts?.failures ?? 0);
  const text = `${row.summary ?? ""} ${(row.sourceIds as string[] | undefined)?.join(" ") ?? ""}`.toLowerCase();
  const highValue = isHighValueProposal({ ...row, clean: true, status: "pending" });
  if (Number(row.blockedCount ?? 0) > 0) return true;
  if (itemCount > 90 && /\bmemory\.md|daily|2026-|workspace memory|extract \d+ events/i.test(text)) return true;
  if (Number(row.warningCount ?? 0) >= 8 && !highValue) return true;
  if (/generic_api_key|secret|poisoning/i.test(text) && !highValue) return true;
  return false;
}

function proposalTriageSummary(row: Record<string, unknown>): Record<string, unknown> {
  return {
    id: row.id,
    summary: row.summary,
    createdAt: row.createdAt,
    counts: row.counts,
    warningCount: row.warningCount,
    blockedCount: row.blockedCount,
    sensitivity: row.sensitivity
  };
}

function collapseDuplicateFacts(db: UmosDatabase, paths: VaultPaths): Record<string, unknown> {
  const rows = db
    .prepare("SELECT id, subject, predicate, object, confidence, created_at, supersedes_json FROM facts WHERE valid_until IS NULL")
    .all() as Array<{
    id: string;
    subject: string;
    predicate: string;
    object: string;
    confidence: number;
    created_at: string;
    supersedes_json: string;
  }>;
  const groups = new Map<string, typeof rows>();
  for (const row of rows) {
    const key = normalizeText(`${row.subject}|${row.predicate}|${row.object}`);
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  const collapsed: Array<{ winnerId: string; loserIds: string[] }> = [];
  const now = new Date().toISOString();
  const beforeIds: string[] = [];
  for (const group of groups.values()) {
    if (group.length > 1) beforeIds.push(...group.map((row) => row.id));
  }
  const before = factsSnapshot(db, beforeIds);
  const tx = db.transaction(() => {
    for (const group of groups.values()) {
      if (group.length < 2) continue;
      const sorted = [...group].sort((a, b) => b.confidence - a.confidence || String(b.created_at).localeCompare(a.created_at));
      const winner = sorted[0];
      const losers = sorted.slice(1);
      const loserIds = losers.map((row) => row.id);
      const supersedes = Array.from(new Set([...safeJsonArray(winner.supersedes_json), ...loserIds]));
      db.prepare("UPDATE facts SET supersedes_json = ? WHERE id = ?").run(JSON.stringify(supersedes), winner.id);
      const markLoser = db.prepare("UPDATE facts SET valid_until = ?, review_after = ? WHERE id = ?");
      for (const loser of losers) {
        markLoser.run(now, now, loser.id);
      }
      collapsed.push({ winnerId: winner.id, loserIds });
    }
  });
  tx();
  if (collapsed.length > 0) {
    recordGovernorAudit(paths, {
      action: "collapse_duplicate_facts",
      targetIds: beforeIds,
      before,
      after: factsSnapshot(db, beforeIds)
    });
  }
  return { ok: true, collapsedGroups: collapsed.length, collapsedFacts: collapsed.reduce((sum, group) => sum + group.loserIds.length, 0), groups: collapsed };
}

function fuzzyDuplicateFactPreview(db: UmosDatabase): Array<Record<string, unknown>> {
  const rows = db
    .prepare("SELECT id, subject, predicate, object, confidence, created_at, supersedes_json FROM facts WHERE valid_until IS NULL")
    .all() as Array<{
    id: string;
    subject: string;
    predicate: string;
    object: string;
    confidence: number;
    created_at: string;
    supersedes_json: string;
  }>;
  const groups = fuzzyDuplicateGroups(rows);
  return groups.map((group) => {
    const sorted = [...group].sort((a, b) => b.confidence - a.confidence || String(b.created_at).localeCompare(a.created_at));
    const winner = sorted[0];
    const losers = sorted.slice(1);
    const similarity = losers.length > 0 ? textSimilarity(factText(winner), factText(losers[0])) : 1;
    const exactObject = losers.every((row) => normalizeText(row.object) === normalizeText(winner.object));
    const groupId = createHash("sha256").update(sorted.map((row) => row.id).sort().join("|")).digest("hex").slice(0, 16);
    return {
      groupId,
      similarity,
      exactObject,
      safeAutoSelectable: exactObject && similarity >= 0.98,
      reviewRecommendation: exactObject && similarity >= 0.98 ? "safe_exact_duplicate" : "manual_review_required",
      winner,
      losers,
      ids: sorted.map((row) => row.id)
    };
  });
}

function fuzzyDuplicateGroups(rows: Array<{
  id: string;
  subject: string;
  predicate: string;
  object: string;
  confidence: number;
  created_at: string;
  supersedes_json: string;
}>): Array<typeof rows> {
  const grouped = new Map<string, typeof rows>();
  for (const row of rows) {
    const key = `${tokenSignature(row.subject)}|${tokenSignature(row.predicate)}`;
    grouped.set(key, [...(grouped.get(key) ?? []), row]);
  }
  const groups: Array<typeof rows> = [];
  for (const candidates of grouped.values()) {
    const used = new Set<string>();
    for (const row of candidates) {
      if (used.has(row.id)) continue;
      const similar = candidates.filter((other) => {
        if (used.has(other.id)) return false;
        return textSimilarity(`${row.subject} ${row.predicate} ${row.object}`, `${other.subject} ${other.predicate} ${other.object}`) >= 0.84;
      });
      if (similar.length > 1) {
        similar.forEach((item) => used.add(item.id));
        groups.push(similar);
      }
    }
  }
  return groups;
}

function collapseFuzzyDuplicateFacts(db: UmosDatabase, paths: VaultPaths, groupIds?: string[]): Record<string, unknown> {
  const preview = fuzzyDuplicateFactPreview(db);
  const selected = new Set((groupIds ?? []).map(String).filter(Boolean));
  if (selected.size === 0) {
    throw new Error("Fuzzy duplicate collapse requires explicit groupIds from preview.");
  }
  const selectedGroups = preview.filter((group) => selected.has(String(group.groupId)));
  const groups = selectedGroups.map((group) => [group.winner, ...(group.losers as unknown[])] as Array<{
    id: string;
    subject: string;
    predicate: string;
    object: string;
    confidence: number;
    created_at: string;
    supersedes_json: string;
  }>);
  const targetIds = groups.flatMap((group) => group.map((row) => row.id));
  const before = factsSnapshot(db, targetIds);
  const collapsed: Array<{ winnerId: string; loserIds: string[]; similarity: number }> = [];
  const now = new Date().toISOString();
  const tx = db.transaction(() => {
    for (const group of groups) {
      const sorted = [...group].sort((a, b) => b.confidence - a.confidence || String(b.created_at).localeCompare(a.created_at));
      const winner = sorted[0];
      const losers = sorted.slice(1);
      const loserIds = losers.map((row) => row.id);
      const supersedes = Array.from(new Set([...safeJsonArray(winner.supersedes_json), ...loserIds]));
      db.prepare("UPDATE facts SET supersedes_json = ? WHERE id = ?").run(JSON.stringify(supersedes), winner.id);
      const markLoser = db.prepare("UPDATE facts SET valid_until = ?, review_after = ? WHERE id = ?");
      for (const loser of losers) {
        markLoser.run(now, now, loser.id);
      }
      collapsed.push({ winnerId: winner.id, loserIds, similarity: textSimilarity(factText(winner), factText(losers[0])) });
    }
  });
  tx();
  if (collapsed.length > 0) {
    recordGovernorAudit(paths, {
      action: "collapse_fuzzy_duplicate_facts",
      targetIds,
      before,
      after: factsSnapshot(db, targetIds)
    });
  }
  return { ok: true, collapsedGroups: collapsed.length, collapsedFacts: collapsed.reduce((sum, group) => sum + group.loserIds.length, 0), groups: collapsed };
}

function syncWorkspaceMemoryFiles(db: UmosDatabase, paths: VaultPaths): Record<string, unknown> {
  const workspaceRoot = resolve(paths.root, "..", "..", "..");
  const candidates = [
    join(workspaceRoot, "MEMORY.md"),
    ...safeListMarkdown(join(workspaceRoot, "memory"))
  ].filter((path) => existsSync(path) && statSync(path).isFile());
  const ingested: unknown[] = [];
  const proposals: unknown[] = [];
  const skipped: unknown[] = [];
  for (const path of candidates) {
    const ingest = ingestFile(db, paths, {
      path,
      kind: "markdown",
      space: "system",
      trustLevel: "observed",
      sourceOrigin: "agent",
      visibility: "private",
      sensitivity: "internal"
    });
    if (ingest.skipped) {
      skipped.push({ path, sourceId: ingest.sourceId, reason: "already_ingested" });
      continue;
    }
    ingested.push({ path, ...ingest });
    proposals.push(proposeSourceExtraction(db, ingest.sourceId, { reportPaths: paths }));
  }
  return { ok: true, considered: candidates.length, ingested, proposals, skipped, queueOnly: true };
}

function ocrHealth(): Record<string, unknown> {
  const pdftoppm = findBinary("pdftoppm");
  const tesseract = findBinary("tesseract");
  return {
    ok: Boolean(pdftoppm && tesseract),
    tools: {
      pdftoppm: pdftoppm ? { installed: true, path: pdftoppm } : { installed: false },
      tesseract: tesseract ? { installed: true, path: tesseract } : { installed: false }
    },
    install: {
      windows: "Install Poppler for Windows and Tesseract OCR, then add both bin folders to PATH. With Chocolatey: choco install poppler tesseract",
      mac: "brew install poppler tesseract",
      linux: "sudo apt-get install poppler-utils tesseract-ocr"
    }
  };
}

function importSupport(paths: VaultPaths): Record<string, unknown> {
  const workspaceRoot = resolve(paths.root, "..", "..", "..");
  return {
    supportedKinds: [
      { kind: "markdown", extensions: [".md", ".markdown"], proposalReviewed: true },
      { kind: "note", extensions: [".txt"], proposalReviewed: true },
      { kind: "session", extensions: [".jsonl"], proposalReviewed: true },
      { kind: "pdf", extensions: [".pdf"], proposalReviewed: true, ocrFallback: true }
    ],
    approvedRoots: [resolve(paths.root), workspaceRoot, homedir()],
    inbox: paths.inboxDir,
    policy: {
      rawSourcesAutoIndexed: true,
      durableMemoryAutoApplied: false,
      queueOnly: true
    },
    ocr: ocrHealth()
  };
}

function integrationStatus(db: UmosDatabase, paths: VaultPaths, options: HttpMcpServerOptions): Record<string, unknown> {
  const cliPath = resolve(dirname(fileURLToPath(import.meta.url)), "..", "cli", "index.js");
  const stdioCommand = {
    command: "node",
    args: [cliPath, "mcp", "--root", paths.root]
  };
  const clients = [
    configStatus("OpenClaw", join(homedir(), ".openclaw", "openclaw.json")),
    configStatus("Claude Desktop", join(process.env.APPDATA ?? join(homedir(), "AppData", "Roaming"), "Claude", "claude_desktop_config.json")),
    configStatus(
      "Claude Desktop packaged",
      join(process.env.LOCALAPPDATA ?? join(homedir(), "AppData", "Local"), "Packages", "Claude_pzs8sxrjxfjjc", "LocalCache", "Roaming", "Claude", "claude_desktop_config.json")
    ),
    {
      name: "Claude Code",
      configured: null,
      configPath: null,
      note: "Verify with `claude mcp get neurakeep` because Claude Code stores MCP config outside this app."
    },
    {
      name: "Codex",
      configured: null,
      configPath: null,
      note: "Use the same stdio command in the MCP host or the local HTTP endpoint when available."
    }
  ];
  const toolNames = ["memory_search", "memory_read", "memory_explain_sources", "memory_propose_update", "memory_apply_update"];
  return {
    ok: true,
    server: {
      name: "neurakeep",
      httpEndpoint: `http://${options.host}:${options.port}/mcp`,
      uiEndpoint: options.serveUi ? `http://${options.host}:${options.port}/index.html` : null,
      mode: options.readOnly ? "read-only" : "read-write",
      tokenRequired: Boolean(options.token)
    },
    vault: {
      root: paths.root,
      sourceCount: scalarCount(db, "SELECT COUNT(*) AS count FROM sources"),
      pendingProposals: scalarCount(db, "SELECT COUNT(*) AS count FROM proposals WHERE status = 'pending'")
    },
    stdioCommand,
    tools: toolNames,
    clients,
    smokeTests: [
      { name: "search", tool: "memory_search", arguments: { query: "Promarkia scheduled task lessons", limit: 5, neighbors: 1 } },
      { name: "read", tool: "memory_read", note: "Use an id returned by memory_search." },
      { name: "propose", tool: "memory_propose_update", note: "Creates a pending proposal only; review before applying." },
      { name: "apply", tool: "memory_apply_update", note: "Only use after explicit approval or a clean reviewed proposal." }
    ],
    policy: {
      durableAutoApply: false,
      queueFirst: true,
      readBeforeActing: true
    }
  };
}

function dailyWorkflowStatus(db: UmosDatabase, paths: VaultPaths, options: HttpMcpServerOptions): Record<string, unknown> {
  const dashboard = qualityDashboard(db, paths);
  const pending = dashboard.counts as Record<string, unknown>;
  return {
    ok: true,
    lastCheckedAt: new Date().toISOString(),
    integration: integrationStatus(db, paths, options),
    importSupport: importSupport(paths),
    watcher: watchStatus(paths),
    policy: selfMemoryPolicy,
    quality: dashboard,
    recommendedActions: workflowRecommendations(pending, dashboard)
  };
}

function workflowRecommendations(counts: Record<string, unknown>, dashboard: Record<string, unknown>): string[] {
  const actions: string[] = [];
  if (Number(counts.pendingProposals ?? 0) > 0) {
    actions.push("Review pending proposals before applying durable memory.");
  }
  if (Number(counts.warningProposals ?? 0) > 0) {
    actions.push("Triage warning proposals in batches; archive noisy imports and prune useful ones before apply.");
  }
  if (Number(counts.fuzzyDuplicateFactGroups ?? 0) > 0) {
    actions.push("Use fuzzy preview and select only obvious duplicate groups for collapse.");
  }
  const ocr = (dashboard.ocr ?? ocrHealth()) as Record<string, unknown>;
  if (!ocr.ok) {
    actions.push("Install or repair local OCR tools before importing scanned PDFs.");
  }
  if (actions.length === 0) {
    actions.push("Queue today's session summary, then leave proposals pending for review.");
  }
  return actions;
}

function configStatus(name: string, configPath: string): Record<string, unknown> {
  const exists = existsSync(configPath);
  let containsNeuraKeep = false;
  let error: string | undefined;
  if (exists) {
    try {
      containsNeuraKeep = readFileSync(configPath, "utf8").toLowerCase().includes("neurakeep");
    } catch (readError) {
      error = readError instanceof Error ? readError.message : String(readError);
    }
  }
  return {
    name,
    configured: containsNeuraKeep,
    configPath,
    exists,
    error,
    note: containsNeuraKeep ? "Config references NeuraKeep." : "Config does not reference NeuraKeep."
  };
}

function qualityDashboard(db: UmosDatabase, paths: VaultPaths): Record<string, unknown> {
  const quality = inspectMemoryQuality(db);
  const pending = listProposalSummaries(db, paths, "pending", "all");
  const sourceCount = scalarCount(db, "SELECT COUNT(*) AS count FROM sources");
  const sectionCount = scalarCount(db, "SELECT COUNT(*) AS count FROM sections");
  const factCount = scalarCount(db, "SELECT COUNT(*) AS count FROM facts WHERE valid_until IS NULL");
  const failureCount = scalarCount(db, "SELECT COUNT(*) AS count FROM failures");
  const eventCount = scalarCount(db, "SELECT COUNT(*) AS count FROM events");
  const warningCount = pending.filter((row) => Number(row.warningCount) > 0 && Number(row.blockedCount) === 0).length;
  const blockedCount = pending.filter((row) => Number(row.blockedCount) > 0).length;
  const cleanCount = pending.filter((row) => Boolean(row.clean)).length;
  const topNoisyImports = pending
    .filter((row) => Number(row.warningCount) > 0 || Number(row.blockedCount) > 0)
    .sort((a, b) => Number(b.warningCount) + Number(b.blockedCount) * 3 - (Number(a.warningCount) + Number(a.blockedCount) * 3))
    .slice(0, 8)
    .map(proposalTriageSummary);
  return {
    counts: {
      sources: sourceCount,
      sections: sectionCount,
      activeFacts: factCount,
      failures: failureCount,
      events: eventCount,
      pendingProposals: pending.length,
      cleanProposals: cleanCount,
      warningProposals: warningCount,
      blockedProposals: blockedCount,
      duplicateFactGroups: quality.duplicateFacts.length,
      duplicateFailureGroups: quality.duplicateFailures.length,
      staleFacts: quality.staleFacts.length,
      fuzzyDuplicateFactGroups: fuzzyDuplicateFactPreview(db).length
    },
    warningRate: pending.length ? warningCount / pending.length : 0,
    topNoisyImports
  };
}

function scalarCount(db: UmosDatabase, sql: string): number {
  const row = db.prepare(sql).get() as { count: number } | undefined;
  return Number(row?.count ?? 0);
}

function findBinary(name: string): string | null {
  const command = process.platform === "win32" ? "where.exe" : "which";
  const found = spawnSync(command, [name], { encoding: "utf8" });
  if (found.status !== 0) return null;
  return found.stdout.split(/\r?\n/).map((line) => line.trim()).find(Boolean) ?? null;
}

function safeListMarkdown(dir: string): string[] {
  try {
    return readdirSync(dir)
      .filter((name) => name.endsWith(".md"))
      .map((name) => join(dir, name))
      .sort();
  } catch {
    return [];
  }
}

function safeUploadName(fileName: string): string {
  const base = basename(fileName).replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 120);
  return base || "memory-upload.txt";
}

function queryTokens(query: string): string[] {
  return Array.from(query.matchAll(/[\p{L}\p{N}_-]+/gu))
    .map((match) => match[0].toLowerCase())
    .filter((token) => token.length > 2)
    .slice(0, 10);
}

function normalizeJson(value: string): string {
  try {
    return JSON.stringify(JSON.parse(value));
  } catch {
    return value;
  }
}

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function tokenSignature(value: string): string {
  return Array.from(new Set(queryTokens(value).filter((token) => !["the", "and", "for", "with", "this", "that"].includes(token))))
    .sort()
    .slice(0, 8)
    .join(" ");
}

function textSimilarity(a: string, b: string): number {
  const aTokens = new Set(queryTokens(a));
  const bTokens = new Set(queryTokens(b));
  if (aTokens.size === 0 || bTokens.size === 0) return 0;
  const intersection = Array.from(aTokens).filter((token) => bTokens.has(token)).length;
  const union = new Set([...Array.from(aTokens), ...Array.from(bTokens)]).size;
  const jaccard = intersection / Math.max(1, union);
  const na = normalizeText(a);
  const nb = normalizeText(b);
  const containment = na.includes(nb) || nb.includes(na) ? 1 : 0;
  return Math.max(jaccard, containment);
}

function factText(row: { subject: string; predicate: string; object: string }): string {
  return `${row.subject} ${row.predicate} ${row.object}`;
}

function searchPresetPath(paths: VaultPaths): string {
  return join(paths.root, "state", "search-presets.json");
}

function readSearchPresets(paths: VaultPaths): Array<Record<string, unknown>> {
  const file = searchPresetPath(paths);
  if (!existsSync(file)) return [];
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8")) as unknown;
    return Array.isArray(parsed) ? parsed.filter((item) => item && typeof item === "object") as Array<Record<string, unknown>> : [];
  } catch {
    return [];
  }
}

function writeSearchPresets(paths: VaultPaths, presets: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
  const file = searchPresetPath(paths);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(presets.slice(0, 50), null, 2), "utf8");
  return presets.slice(0, 50);
}

function saveSearchPreset(paths: VaultPaths, input: { name?: string; query?: string; filters?: Record<string, unknown> }): Array<Record<string, unknown>> {
  const name = normalizeText(String(input.name ?? "")).slice(0, 60);
  if (!name) throw new Error("Preset name is required.");
  const presets = readSearchPresets(paths).filter((preset) => normalizeText(String(preset.name ?? "")) !== name);
  presets.unshift({
    name,
    query: String(input.query ?? ""),
    filters: input.filters ?? {},
    updatedAt: new Date().toISOString()
  });
  return writeSearchPresets(paths, presets);
}

function deleteSearchPreset(paths: VaultPaths, name: string): Array<Record<string, unknown>> {
  const normalized = normalizeText(name);
  return writeSearchPresets(paths, readSearchPresets(paths).filter((preset) => normalizeText(String(preset.name ?? "")) !== normalized));
}

function handleHttpRequest(
  db: UmosDatabase,
  paths: VaultPaths,
  payload: unknown,
  readOnly: boolean
): unknown {
  if (!isJsonRpcObject(payload)) {
    return {
      jsonrpc: "2.0",
      id: null,
      error: { code: -32600, message: "Invalid JSON-RPC request" }
    };
  }

  if (readOnly && payload.method === "tools/call") {
    const name = String((payload.params as Record<string, unknown> | undefined)?.name ?? "");
    if (name === "memory_propose_update" || name === "memory_apply_update") {
      return {
        jsonrpc: "2.0",
        id: payload.id,
        error: { code: -32001, message: `${name} is disabled in read-only HTTP mode` }
      };
    }
  }

  return handleJsonRpcRequest(db, paths, payload);
}

function isJsonRpcObject(value: unknown): value is {
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
} {
  return typeof value === "object" && value !== null && typeof (value as { method?: unknown }).method === "string";
}

function authorizeRequest(req: IncomingMessage, options: HttpMcpServerOptions): boolean {
  if (!options.token) {
    return true;
  }
  const expected = `Bearer ${options.token}`;
  return req.headers.authorization === expected;
}

function authSettings(paths: VaultPaths, options: HttpMcpServerOptions): Record<string, unknown> {
  const saved = readAuthSettings(paths);
  return {
    mode: saved.mode,
    provider: "local",
    tokenRequired: Boolean(options.token),
    readOnly: options.readOnly,
    hasToken: Boolean(options.token),
    endpoint: "/mcp",
    user: {
      ...saved.user,
      actor: {
        provider: "local",
        uid: "local",
        roles: [saved.user.role]
      },
      allowWrites: saved.user.allowWrites && !options.readOnly
    }
  };
}

function readAuthSettings(paths: VaultPaths): AuthSettingsFile {
  const fallback: AuthSettingsFile = {
    mode: "local",
    user: {
      displayName: "Local NeuraKeep User",
      role: "owner",
      allowWrites: true
    }
  };
  const file = authSettingsPath(paths);
  if (!existsSync(file)) {
    return fallback;
  }
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8")) as Partial<AuthSettingsFile>;
    const role = parsed.user?.role === "viewer" || parsed.user?.role === "operator" || parsed.user?.role === "owner"
      ? parsed.user.role
      : fallback.user.role;
    return {
      mode: parsed.mode === "remote" ? "remote" : "local",
      user: {
        displayName: String(parsed.user?.displayName ?? fallback.user.displayName),
        role,
        allowWrites: Boolean(parsed.user?.allowWrites ?? fallback.user.allowWrites)
      }
    };
  } catch {
    return fallback;
  }
}

function writeAuthSettings(paths: VaultPaths, body: Partial<AuthSettingsFile>, options: HttpMcpServerOptions): Record<string, unknown> {
  const current = readAuthSettings(paths);
  const next: AuthSettingsFile = {
    mode: body.mode === "remote" ? "remote" : body.mode === "local" ? "local" : current.mode,
    user: {
      displayName: String(body.user?.displayName ?? current.user.displayName),
      role: body.user?.role === "viewer" || body.user?.role === "operator" || body.user?.role === "owner"
        ? body.user.role
        : current.user.role,
      allowWrites: Boolean(body.user?.allowWrites ?? current.user.allowWrites)
    }
  };
  mkdirSync(join(paths.root, "state"), { recursive: true });
  writeFileSync(authSettingsPath(paths), `${JSON.stringify(next, null, 2)}\n`, "utf8");
  return authSettings(paths, options);
}

function authSettingsPath(paths: VaultPaths): string {
  return join(paths.root, "state", "auth-settings.json");
}

function readBody(req: IncomingMessage, maxBytes = 2_000_000): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > maxBytes) {
        reject(new Error("Request body too large"));
      }
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

function tryServeUi(paths: VaultPaths, req: IncomingMessage, res: ServerResponse): boolean {
  const url = new URL(req.url ?? "/", "http://127.0.0.1");
  const pathname = url.pathname === "/" ? "/index.html" : url.pathname;
  const relative = normalize(pathname.replace(/^\/+/, ""));
  if (relative.startsWith("..")) {
    return false;
  }

  const filePath = join(paths.root, "app", relative);
  try {
    const stat = statSync(filePath);
    if (!stat.isFile()) {
      return false;
    }
    const content = readFileSync(filePath);
    res.writeHead(200, { "content-type": contentType(filePath) });
    res.end(content);
    return true;
  } catch {
    return false;
  }
}

function listInboxFiles(paths: VaultPaths): Array<Record<string, unknown>> {
  try {
    return readdirSync(paths.inboxDir)
      .filter((name) => name !== "pending-updates")
      .map((name) => join(paths.inboxDir, name))
      .filter((path) => statSync(path).isFile())
      .map((path) => {
        const stat = statSync(path);
        const kind = kindFromExtension(path);
        const scan = kind === "pdf"
          ? { riskFlags: [], secretHints: [], poisoningHints: [] }
          : scanContentForSafety(readFileSync(path, "utf8").slice(0, 200_000));
        return {
          path,
          name: relative(paths.inboxDir, path),
          bytes: stat.size,
          kind,
          riskFlags: scan.riskFlags,
          trustHint: scan.riskFlags.length > 0 ? "review-first" : "normal",
          sourceHint: path.includes("self-memory") || path.includes("workspace-summary") ? "self-memory" : "inbox"
        };
      });
  } catch {
    return [];
  }
}

function kindFromExtension(path: string): "markdown" | "session" | "pdf" {
  const extension = extname(path).toLowerCase();
  if (extension === ".jsonl") return "session";
  if (extension === ".pdf") return "pdf";
  return "markdown";
}

function normalizeIngestKind(value: unknown): "markdown" | "session" | "note" | "pdf" {
  if (value === "session" || value === "note" || value === "pdf") {
    return value;
  }
  return "markdown";
}

function autoIngestQueue(
  db: UmosDatabase,
  paths: VaultPaths,
  options: {
    extraFolders?: string[];
    recursive?: boolean;
    policy?: IngestPolicy;
    profileId?: string;
  } = {}
): Record<string, unknown> {
  const files = [
    ...listInboxFiles(paths),
    ...listProfileFiles(paths, options.extraFolders ?? [], Boolean(options.recursive))
  ];
  const ingested: unknown[] = [];
  const proposals: unknown[] = [];
  const skipped: unknown[] = [];
  const seen = new Set<string>();
  const policy = options.policy ?? {
    space: "project",
    trustLevel: "observed",
    sourceOrigin: "manual",
    visibility: "private",
    sensitivity: "normal"
  };
  for (const file of files) {
    const path = String(file.path ?? "");
    if (!path) {
      continue;
    }
    const prepared = prepareWatcherIngestFile(paths, path, policy, String(file.kind ?? "markdown"));
    const dedupeKey = prepared.contentHash;
    if (seen.has(dedupeKey)) {
      skipped.push({ path, reason: "duplicate_content", contentHash: dedupeKey });
      continue;
    }
    seen.add(dedupeKey);
    const kind = prepared.kind;
    const ingest = ingestFile(db, paths, {
      path: prepared.path,
      kind,
      space: policy.space,
      trustLevel: prepared.trustLevel,
      sourceOrigin: policy.sourceOrigin,
      visibility: policy.visibility,
      sensitivity: prepared.sensitivity
    });
    ingested.push({ ...ingest, originalPath: path, redactions: prepared.redactions, riskFlags: prepared.riskFlags });
    if (!ingest.skipped) {
      proposals.push(proposeSourceExtraction(db, ingest.sourceId, { reportPaths: paths }));
    }
  }
  return { ingested, proposals, skipped, profileId: options.profileId ?? null, recursive: Boolean(options.recursive), queueOnly: true };
}

function prepareWatcherIngestFile(
  paths: VaultPaths,
  sourcePath: string,
  policy: IngestPolicy,
  requestedKind: string
): {
  path: string;
  kind: "markdown" | "session" | "note" | "pdf";
  contentHash: string;
  trustLevel: IngestPolicy["trustLevel"];
  sensitivity: IngestPolicy["sensitivity"];
  riskFlags: string[];
  redactions: string[];
} {
  const kind = normalizeIngestKind(requestedKind);
  const isPdf = kind === "pdf";
  const contentBuffer = readFileSync(sourcePath);
  const content = isPdf ? "" : contentBuffer.toString("utf8");
  const scan = scanContentForSafety(content);
  const redacted = redactSensitiveContent(content);
  const shouldRedact = redacted.redactions.length > 0 && policy.sourceOrigin !== "manual";
  const finalContent = shouldRedact ? redacted.redacted : content;
  const contentHash = createHash("sha256").update(isPdf ? contentBuffer : finalContent).digest("hex");
  const trustLevel = scan.poisoningHints.length > 0 || redacted.redactions.length > 0 ? "untrusted" : policy.trustLevel;
  const sensitivity = redacted.redactions.length > 0 ? "confidential" : policy.sensitivity;
  if (!shouldRedact) {
    return {
      path: sourcePath,
      kind,
      contentHash,
      trustLevel,
      sensitivity,
      riskFlags: scan.riskFlags,
      redactions: []
    };
  }
  const redactedDir = join(paths.inboxDir, "pending-updates", "redacted");
  mkdirSync(redactedDir, { recursive: true });
  const extension = kind === "session" ? ".jsonl" : ".md";
  const redactedPath = join(redactedDir, `${contentHash.slice(0, 16)}${extension}`);
  writeFileSync(
    redactedPath,
    [
      `# Redacted Watcher Import`,
      ``,
      `Original: ${sourcePath}`,
      `Risk flags: ${scan.riskFlags.join(", ") || "none"}`,
      `Redactions: ${redacted.redactions.join(", ")}`,
      ``,
      finalContent
    ].join("\n"),
    "utf8"
  );
  return {
    path: redactedPath,
    kind: "markdown",
    contentHash,
    trustLevel,
    sensitivity,
    riskFlags: scan.riskFlags,
    redactions: redacted.redactions
  };
}

function startAutoIngestWatcher(
  db: UmosDatabase,
  paths: VaultPaths,
  options: {
    folders?: string[];
    debounceMs?: number;
    profileId?: string;
    recursive?: boolean;
  }
): Record<string, unknown> {
  stopAutoIngestWatcher(paths);
  const profile = resolveWatcherProfile(paths, options.profileId);
  const folders = resolveWatchFolders(paths, options.folders && options.folders.length > 0 ? options.folders : profile?.folders);
  const debounceMs = Math.max(500, Math.min(Number(options.debounceMs ?? 1500), 30000));
  const state: WatchState = {
    watchers: [],
    folders,
    debounceMs,
    running: true,
    startedAt: new Date().toISOString(),
    runCount: 0,
    recursive: Boolean(options.recursive ?? profile?.recursive),
    profileId: profile?.id,
    policy: profile?.policy
  };
  const key = paths.root;
  const schedule = (): void => {
    state.queuedAt = new Date().toISOString();
    if (state.timer) {
      clearTimeout(state.timer);
    }
    state.timer = setTimeout(() => {
      try {
        state.lastRunAt = new Date().toISOString();
        state.lastResult = autoIngestQueue(db, paths, {
          extraFolders: state.folders,
          recursive: state.recursive,
          policy: state.policy,
          profileId: state.profileId
        });
        state.lastError = undefined;
        state.runCount += 1;
        appendWatcherHistory(paths, {
          at: state.lastRunAt,
          profileId: state.profileId,
          folders: state.folders,
          recursive: state.recursive,
          ok: true,
          ingested: Array.isArray(state.lastResult.ingested) ? state.lastResult.ingested.length : 0,
          proposals: Array.isArray(state.lastResult.proposals) ? state.lastResult.proposals.length : 0
        });
        exportStaticApp(db, paths);
      } catch (error) {
        state.lastError = error instanceof Error ? error.message : String(error);
        appendWatcherHistory(paths, {
          at: new Date().toISOString(),
          profileId: state.profileId,
          folders: state.folders,
          recursive: state.recursive,
          ok: false,
          ingested: 0,
          proposals: 0,
          error: state.lastError
        });
      }
    }, debounceMs);
  };

  for (const folder of folders) {
    const watcher = watch(folder, { persistent: false }, schedule);
    watcher.on("error", (error) => {
      state.lastError = error.message;
    });
    state.watchers.push(watcher);
  }
  watchStates.set(key, state);
  const persisted = readPersistedWatcherState(paths);
  writePersistedWatcherState(paths, {
    ...persisted,
    running: true,
    folders,
    debounceMs,
    recursive: state.recursive,
    profileId: state.profileId,
    startedAt: state.startedAt,
    stoppedAt: undefined
  });
  return watchStatus(paths);
}

function stopAutoIngestWatcher(paths: VaultPaths): Record<string, unknown> {
  const state = watchStates.get(paths.root);
  if (!state) {
    const persisted = readPersistedWatcherState(paths);
    writePersistedWatcherState(paths, { ...persisted, running: false, stoppedAt: new Date().toISOString() });
    return { running: false, folders: persisted.folders, history: persisted.history };
  }
  if (state.timer) {
    clearTimeout(state.timer);
  }
  for (const watcher of state.watchers) {
    watcher.close();
  }
  watchStates.delete(paths.root);
  const stoppedAt = new Date().toISOString();
  const persisted = readPersistedWatcherState(paths);
  writePersistedWatcherState(paths, {
    ...persisted,
    running: false,
    folders: state.folders,
    debounceMs: state.debounceMs,
    recursive: state.recursive,
    profileId: state.profileId,
    stoppedAt
  });
  return { running: false, folders: state.folders, stoppedAt, history: persisted.history };
}

function watchStatus(paths: VaultPaths): Record<string, unknown> {
  const persisted = readPersistedWatcherState(paths);
  const state = watchStates.get(paths.root);
  if (!state) {
    return { ...persisted, running: false };
  }
  return {
    running: state.running,
    folders: state.folders,
    debounceMs: state.debounceMs,
    recursive: state.recursive,
    profileId: state.profileId,
    policy: state.policy,
    startedAt: state.startedAt,
    queuedAt: state.queuedAt,
    lastRunAt: state.lastRunAt,
    lastResult: state.lastResult,
    lastError: state.lastError,
    runCount: Math.max(state.runCount, persisted.runCount ?? 0),
    history: persisted.history
  };
}

function restorePersistedWatcher(db: UmosDatabase, paths: VaultPaths): void {
  const state = readPersistedWatcherState(paths);
  if (!state.running || state.folders.length === 0) {
    return;
  }
  try {
    startAutoIngestWatcher(db, paths, {
      folders: state.folders,
      debounceMs: state.debounceMs,
      profileId: state.profileId,
      recursive: state.recursive
    });
  } catch (error) {
    writePersistedWatcherState(paths, {
      ...state,
      running: false,
      stoppedAt: new Date().toISOString(),
      history: [
        ...(state.history ?? []),
        {
          at: new Date().toISOString(),
          profileId: state.profileId,
          folders: state.folders,
          recursive: state.recursive,
          ok: false,
          ingested: 0,
          proposals: 0,
          error: error instanceof Error ? error.message : String(error)
        }
      ].slice(-50)
    });
  }
}

function resolveWatchFolders(paths: VaultPaths, requestedFolders: string[] | undefined): string[] {
  const workspaceRoot = resolve(paths.root, "..", "..", "..");
  const roots = [resolve(paths.root), workspaceRoot];
  const folders = requestedFolders && requestedFolders.length > 0 ? requestedFolders : [paths.inboxDir];
  return Array.from(
    new Set(
      folders.map((folder) => {
        const resolved = resolve(folder);
        if (!roots.some((root) => resolved === root || resolved.startsWith(`${root}\\`) || resolved.startsWith(`${root}/`))) {
          throw new Error(`Watch folder is outside approved local roots: ${folder}`);
        }
        if (!existsSync(resolved) || !statSync(resolved).isDirectory()) {
          throw new Error(`Watch folder does not exist: ${folder}`);
        }
        return resolved;
      })
    )
  );
}

function listProposalSummaries(db: UmosDatabase, paths: VaultPaths, status: string, filter: string): Array<Record<string, unknown>> {
  const safeStatus = ["pending", "applied", "archived", "rejected", "all"].includes(status) ? status : "pending";
  const rows = (safeStatus === "all"
    ? db.prepare("SELECT * FROM proposals ORDER BY created_at DESC LIMIT 200").all()
    : db.prepare("SELECT * FROM proposals WHERE status = ? ORDER BY created_at DESC LIMIT 200").all(safeStatus)) as Array<{
    id: string;
    created_at: string;
    status: string;
    kind: string;
    summary: string;
    diff_json: string;
    source_ids_json: string;
    section_ids_json: string;
    space: string;
    trust_level: string;
    sensitivity: string;
  }>;
  return rows
    .map((row) => proposalSummary(db, paths, row))
    .filter((row) => {
      if (filter === "clean") {
        return Number(row.warningCount) === 0 && Number(row.blockedCount) === 0;
      }
      if (filter === "warnings") {
        return Number(row.warningCount) > 0 && Number(row.blockedCount) === 0;
      }
      if (filter === "blocked") {
        return Number(row.blockedCount) > 0;
      }
      return true;
    });
}

function proposalSummary(
  db: UmosDatabase,
  paths: VaultPaths,
  row: {
    id: string;
    created_at: string;
    status: string;
    kind: string;
    summary: string;
    diff_json: string;
    source_ids_json: string;
    section_ids_json: string;
    space: string;
    trust_level: string;
    sensitivity: string;
  }
): Record<string, unknown> {
  let diff: ExtractedMemory = { events: [], facts: [], failures: [] };
  try {
    diff = JSON.parse(row.diff_json) as ExtractedMemory;
  } catch {
    diff = { events: [], facts: [], failures: [] };
  }
  const governor = governProposalDiff(db, diff);
  const extractionReport = latestExtractionReport(paths, row.id);
  const extractionWarnings = extractionReport?.score?.warnings?.length ?? 0;
  const extractionBlocked = extractionReport?.score?.gate?.passed === false ? 1 : 0;
  return {
    id: row.id,
    createdAt: row.created_at,
    status: row.status,
    kind: row.kind,
    summary: row.summary,
    sourceIds: safeJsonArray(row.source_ids_json),
    sectionIds: safeJsonArray(row.section_ids_json),
    space: row.space,
    trustLevel: row.trust_level,
    sensitivity: row.sensitivity,
    counts: {
      events: diff.events.length,
      facts: diff.facts.length,
      failures: diff.failures.length
    },
    warningCount: governor.warnings.length + extractionWarnings,
    blockedCount: governor.blocked.length + extractionBlocked,
    clean: governor.warnings.length === 0 && governor.blocked.length === 0 && extractionWarnings === 0 && extractionBlocked === 0,
    extractionGate: extractionReport?.score?.gate
  };
}

function latestExtractionReport(paths: VaultPaths, proposalId: string) {
  return listExtractionReports(paths).filter((row) => row.proposalId === proposalId).at(-1);
}

function citationPreview(db: UmosDatabase, id: string): Record<string, unknown> | null {
  const source = db
    .prepare("SELECT id, title, uri, raw_path, captured_at, space, trust_level, sensitivity FROM sources WHERE id = ?")
    .get(id) as
    | {
        id: string;
        title: string | null;
        uri: string;
        raw_path: string;
        captured_at: string;
        space: string;
        trust_level: string;
        sensitivity: string;
      }
    | undefined;
  if (source) {
    const section = db
      .prepare("SELECT heading, body FROM sections WHERE source_id = ? ORDER BY ordinal LIMIT 1")
      .get(id) as { heading: string | null; body: string } | undefined;
    return {
      id,
      type: "source",
      title: source.title ?? source.uri,
      subtitle: source.raw_path,
      capturedAt: source.captured_at,
      space: source.space,
      trustLevel: source.trust_level,
      sensitivity: source.sensitivity,
      markdown: section ? `${section.heading ? `# ${section.heading}\n\n` : ""}${section.body}` : "",
      snippet: snippet(section?.body ?? source.raw_path)
    };
  }

  const section = db
    .prepare(
      "SELECT s.id, s.heading, s.body, s.source_id, s.space, s.trust_level, s.sensitivity, src.title AS source_title FROM sections s LEFT JOIN sources src ON src.id = s.source_id WHERE s.id = ?"
    )
    .get(id) as
    | {
        id: string;
        heading: string | null;
        body: string;
        source_id: string;
        space: string;
        trust_level: string;
        sensitivity: string;
        source_title: string | null;
      }
    | undefined;
  if (section) {
    return {
      id,
      type: "section",
      title: section.heading ?? "Section",
      subtitle: section.source_title ?? section.source_id,
      sourceId: section.source_id,
      space: section.space,
      trustLevel: section.trust_level,
      sensitivity: section.sensitivity,
      markdown: section.body,
      snippet: snippet(section.body)
    };
  }

  const event = db
    .prepare("SELECT id, summary, timestamp, source_ids_json, section_ids_json FROM events WHERE id = ?")
    .get(id) as { id: string; summary: string; timestamp: string; source_ids_json: string; section_ids_json: string } | undefined;
  if (event) {
    return {
      id,
      type: "event",
      title: event.summary,
      subtitle: event.timestamp,
      sourceIds: safeJsonArray(event.source_ids_json),
      sectionIds: safeJsonArray(event.section_ids_json),
      markdown: event.summary,
      snippet: snippet(event.summary)
    };
  }

  const fact = db
    .prepare("SELECT id, subject, predicate, object, confidence, source_ids_json, section_ids_json FROM facts WHERE id = ?")
    .get(id) as
    | { id: string; subject: string; predicate: string; object: string; confidence: number; source_ids_json: string; section_ids_json: string }
    | undefined;
  if (fact) {
    const text = `${fact.subject} ${fact.predicate} ${fact.object}`;
    return {
      id,
      type: "fact",
      title: text,
      subtitle: `confidence ${fact.confidence}`,
      sourceIds: safeJsonArray(fact.source_ids_json),
      sectionIds: safeJsonArray(fact.section_ids_json),
      markdown: text,
      snippet: snippet(text)
    };
  }

  const failure = db
    .prepare("SELECT id, attempted, failed_because, do_not_repeat, source_ids_json, section_ids_json FROM failures WHERE id = ?")
    .get(id) as
    | {
        id: string;
        attempted: string;
        failed_because: string;
        do_not_repeat: string;
        source_ids_json: string;
        section_ids_json: string;
      }
    | undefined;
  if (failure) {
    const text = `Attempted: ${failure.attempted}\nFailed because: ${failure.failed_because}\nDo not repeat: ${failure.do_not_repeat}`;
    return {
      id,
      type: "failure",
      title: failure.attempted,
      subtitle: failure.failed_because,
      sourceIds: safeJsonArray(failure.source_ids_json),
      sectionIds: safeJsonArray(failure.section_ids_json),
      markdown: text,
      snippet: snippet(text)
    };
  }

  return null;
}

function snippet(value: string): string {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, 900);
}

function resolveGovernorAction(
  db: UmosDatabase,
  paths: VaultPaths,
  body: { action?: string; winnerId?: string; loserIds?: string[]; factIds?: string[] }
): Record<string, unknown> {
  const now = new Date().toISOString();
  if (body.action === "merge" && body.winnerId) {
    const loserIds = body.loserIds ?? [];
    const targetIds = [body.winnerId, ...loserIds];
    const before = factsSnapshot(db, targetIds);
    const row = db.prepare("SELECT supersedes_json FROM facts WHERE id = ?").get(body.winnerId) as
      | { supersedes_json: string }
      | undefined;
    const existing = row ? safeJsonArray(row.supersedes_json) : [];
    const supersedes = Array.from(new Set([...existing, ...loserIds]));
    db.prepare("UPDATE facts SET supersedes_json = ? WHERE id = ?").run(
      JSON.stringify(supersedes),
      body.winnerId
    );
    if (loserIds.length > 0) {
      const updateLoser = db.prepare("UPDATE facts SET valid_until = ?, review_after = ? WHERE id = ?");
      for (const id of loserIds) {
        updateLoser.run(now, now, id);
      }
    }
    const after = factsSnapshot(db, targetIds);
    const audit = recordGovernorAudit(paths, {
      action: "merge",
      targetIds,
      before,
      after
    });
    return { ok: true, action: "merge", winnerId: body.winnerId, loserIds, audit };
  }

  if (body.action === "mark_stale") {
    const factIds = body.factIds ?? [];
    const before = factsSnapshot(db, factIds);
    const update = db.prepare("UPDATE facts SET review_after = ? WHERE id = ?");
    for (const id of factIds) {
      update.run(now, id);
    }
    const after = factsSnapshot(db, factIds);
    const audit = recordGovernorAudit(paths, {
      action: "mark_stale",
      targetIds: factIds,
      before,
      after
    });
    return { ok: true, action: "mark_stale", factIds, audit };
  }

  if (body.action === "review_later") {
    const factIds = body.factIds ?? [];
    const reviewAt = new Date(Date.now() + 30 * 86_400_000).toISOString();
    const before = factsSnapshot(db, factIds);
    const update = db.prepare("UPDATE facts SET review_after = ? WHERE id = ?");
    for (const id of factIds) {
      update.run(reviewAt, id);
    }
    const after = factsSnapshot(db, factIds);
    const audit = recordGovernorAudit(paths, {
      action: "review_later",
      targetIds: factIds,
      before,
      after
    });
    return { ok: true, action: "review_later", factIds, reviewAt, audit };
  }

  if (body.action === "keep_both") {
    const audit = recordGovernorAudit(paths, {
      action: "keep_both",
      targetIds: body.factIds ?? [],
      before: [],
      after: []
    });
    return { ok: true, action: "keep_both", audit };
  }

  throw new Error("Unsupported governor action");
}

function writeWorkspaceSummary(db: UmosDatabase, paths: VaultPaths): Record<string, unknown> {
  const today = new Date().toISOString().slice(0, 10);
  const workspaceRoot = resolve(paths.root, "..", "..", "..");
  const memoryPath = join(workspaceRoot, "memory", `${today}.md`);
  const content = existsSync(memoryPath)
    ? readFileSync(memoryPath, "utf8")
    : `# ${today}\n\nNo workspace daily memory file found.`;
  const summaryPath = join(paths.inboxDir, `workspace-summary-${today}.md`);
  writeFileSync(
    summaryPath,
    `# Workspace Summary ${today}\n\nSource: ${memoryPath}\nPolicy: queue-only proposal under NeuraKeep Self-Memory Policy v${selfMemoryPolicy.version}\n\n${content.slice(0, 12000)}\n`,
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
  return { summaryPath, ingest, proposal, policy: selfMemoryPolicy };
}

function safeJsonArray(value: string): string[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function requireInboxPath(paths: VaultPaths, path: string): string {
  const resolved = resolve(path);
  const inbox = resolve(paths.inboxDir);
  if (!resolved.startsWith(inbox)) {
    throw new Error("Only files inside the NeuraKeep inbox can be ingested from the UI.");
  }
  return resolved;
}

function requireManualImportPath(paths: VaultPaths, path: string): string {
  const resolved = resolve(path);
  if (!existsSync(resolved) || !statSync(resolved).isFile()) {
    throw new Error(`Manual import file does not exist: ${path}`);
  }
  const workspaceRoot = resolve(paths.root, "..", "..", "..");
  const roots = [resolve(paths.root), workspaceRoot, homedir()].map((root) => resolve(root));
  if (!roots.some((root) => resolved === root || resolved.startsWith(`${root}\\`) || resolved.startsWith(`${root}/`))) {
    throw new Error("Manual imports are limited to the workspace, the NeuraKeep vault, or the user home directory.");
  }
  return resolved;
}

function assertWritable(readOnly: boolean, action: string): void {
  if (readOnly) {
    throw new Error(`${action} is disabled in read-only HTTP mode`);
  }
}

function sendJson(res: ServerResponse, status: number, value: unknown): void {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(value));
}

function setCors(res: ServerResponse): void {
  res.setHeader("access-control-allow-origin", "*");
  res.setHeader("access-control-allow-methods", "GET,POST,OPTIONS");
  res.setHeader("access-control-allow-headers", "content-type,authorization");
}

function contentType(filePath: string): string {
  switch (extname(filePath).toLowerCase()) {
    case ".html":
      return "text/html; charset=utf-8";
    case ".js":
      return "text/javascript; charset=utf-8";
    case ".css":
      return "text/css; charset=utf-8";
    case ".json":
      return "application/json; charset=utf-8";
    case ".svg":
      return "image/svg+xml; charset=utf-8";
    case ".png":
      return "image/png";
    case ".map":
      return "application/json; charset=utf-8";
    default:
      return "application/octet-stream";
  }
}
