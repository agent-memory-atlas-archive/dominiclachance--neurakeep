import { appHtml, appShellCss, appShellJs } from "./frontend.js";
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { VaultPaths } from "../core/paths.js";
import type { UmosDatabase } from "../db/client.js";

export interface AppExportResult {
  appDir: string;
  indexPath: string;
  graphPath: string;
  nodeCount: number;
  edgeCount: number;
}

interface GraphNode {
  id: string;
  label: string;
  type: "root" | "source" | "section" | "event" | "fact" | "failure";
  space?: string;
  trustLevel?: string;
  sensitivity?: string;
}

interface GraphEdge {
  from: string;
  to: string;
  type: "root" | "contains" | "cites" | "next";
}

export interface GraphPayload {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface GraphViewPayload extends GraphPayload {
  hiddenNeighbors: Record<string, number>;
  meta: {
    totalNodes: number;
    totalEdges: number;
    visibleNodes: number;
    visibleEdges: number;
    focusId: string | null;
    depth: number;
    limit: number;
    truncated: boolean;
  };
}

export function exportStaticApp(db: UmosDatabase, paths: VaultPaths): AppExportResult {
  const appDir = join(paths.root, "app");
  mkdirSync(appDir, { recursive: true });

  const graph = buildGraph(db);
  const graphPath = join(appDir, "graph.json");
  const indexPath = join(appDir, "index.html");
  const cssPath = join(appDir, "app-shell.css");
  const jsPath = join(appDir, "app-shell.js");
  const webDist = resolve(packageRoot(), "web-dist");

  if (existsSync(join(webDist, "index.html"))) {
    rmSync(appDir, { recursive: true, force: true });
    mkdirSync(appDir, { recursive: true });
    cpSync(webDist, appDir, { recursive: true });
  } else {
    writeFileSync(indexPath, appHtml(), "utf8");
    writeFileSync(cssPath, appShellCss(), "utf8");
    writeFileSync(jsPath, appShellJs(), "utf8");
  }

  writeFileSync(graphPath, JSON.stringify(graph, null, 2), "utf8");

  return {
    appDir,
    indexPath,
    graphPath,
    nodeCount: graph.nodes.length,
    edgeCount: graph.edges.length
  };
}

function packageRoot(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
}

export function buildGraph(db: UmosDatabase): GraphPayload {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const seen = new Set<string>();

  const addNode = (node: GraphNode): void => {
    if (seen.has(node.id)) {
      return;
    }
    seen.add(node.id);
    nodes.push(node);
  };

  const sources = db.prepare("SELECT id, title, uri, space, trust_level, sensitivity FROM sources").all() as Array<{
    id: string;
    title: string | null;
    uri: string;
    space: string;
    trust_level: string;
    sensitivity: string;
  }>;
  for (const source of sources) {
    addNode({
      id: source.id,
      label: source.title ?? source.uri,
      type: "source",
      space: source.space,
      trustLevel: source.trust_level,
      sensitivity: source.sensitivity
    });
  }

  const sections = db
    .prepare("SELECT id, source_id, heading, ordinal, next_section_id, space, trust_level, sensitivity FROM sections")
    .all() as Array<{
    id: string;
    source_id: string;
    heading: string | null;
    ordinal: number;
    next_section_id: string | null;
    space: string;
    trust_level: string;
    sensitivity: string;
  }>;
  for (const section of sections) {
    addNode({
      id: section.id,
      label: section.heading ?? `Section ${section.ordinal + 1}`,
      type: "section",
      space: section.space,
      trustLevel: section.trust_level,
      sensitivity: section.sensitivity
    });
    edges.push({ from: section.source_id, to: section.id, type: "contains" });
    if (section.next_section_id) {
      edges.push({ from: section.id, to: section.next_section_id, type: "next" });
    }
  }

  addCitedRows(db, "events", "event", "summary", addNode, edges);
  addCitedRows(db, "facts", "fact", "subject", addNode, edges);
  addCitedRows(db, "failures", "failure", "attempted", addNode, edges);
  addRootTopology(nodes, edges, addNode);

  return { nodes, edges };
}

export function buildGraphView(
  db: UmosDatabase,
  options: { focusId?: string | null; depth?: number; limit?: number } = {}
): GraphViewPayload {
  const full = buildGraph(db);
  const limit = Math.max(25, Math.min(Number(options.limit ?? 180), 600));
  const depth = Math.max(1, Math.min(Number(options.depth ?? 1), 3));
  const focusId = options.focusId?.trim() || null;

  const adjacency = new Map<string, string[]>();
  for (const edge of full.edges) {
    adjacency.set(edge.from, [...(adjacency.get(edge.from) ?? []), edge.to]);
    adjacency.set(edge.to, [...(adjacency.get(edge.to) ?? []), edge.from]);
  }

  const nodeById = new Map(full.nodes.map((node) => [node.id, node]));
  const selectedIds = focusId && nodeById.has(focusId)
    ? neighborhoodIds(focusId, adjacency, depth)
    : overviewIds(full.nodes, full.edges, adjacency);

  const orderedIds = Array.from(selectedIds)
    .filter((id) => nodeById.has(id))
    .sort((a, b) => nodePriority(nodeById.get(b)!) - nodePriority(nodeById.get(a)!))
    .slice(0, limit);
  const visibleIdSet = new Set(orderedIds);
  const nodes = orderedIds.map((id) => nodeById.get(id)!);
  const edges = full.edges.filter((edge) => visibleIdSet.has(edge.from) && visibleIdSet.has(edge.to));
  const hiddenNeighbors = hiddenNeighborCounts(full.edges, visibleIdSet);

  return {
    nodes,
    edges,
    hiddenNeighbors,
    meta: {
      totalNodes: full.nodes.length,
      totalEdges: full.edges.length,
      visibleNodes: nodes.length,
      visibleEdges: edges.length,
      focusId,
      depth,
      limit,
      truncated: selectedIds.size > nodes.length || full.nodes.length > nodes.length
    }
  };
}

function hiddenNeighborCounts(edges: GraphEdge[], visibleIds: Set<string>): Record<string, number> {
  const counts = new Map<string, Set<string>>();
  for (const edge of edges) {
    if (visibleIds.has(edge.from) && !visibleIds.has(edge.to)) {
      counts.set(edge.from, new Set([...(counts.get(edge.from) ?? []), edge.to]));
    }
    if (visibleIds.has(edge.to) && !visibleIds.has(edge.from)) {
      counts.set(edge.to, new Set([...(counts.get(edge.to) ?? []), edge.from]));
    }
  }
  return Object.fromEntries(Array.from(counts.entries()).map(([id, neighbors]) => [id, neighbors.size]));
}

function neighborhoodIds(focusId: string, adjacency: Map<string, string[]>, depth: number): Set<string> {
  const ids = new Set<string>([focusId]);
  let frontier = new Set<string>([focusId]);
  for (let step = 0; step < depth; step += 1) {
    const next = new Set<string>();
    for (const id of frontier) {
      for (const neighbor of adjacency.get(id) ?? []) {
        if (!ids.has(neighbor)) {
          ids.add(neighbor);
          next.add(neighbor);
        }
      }
    }
    frontier = next;
  }
  return ids;
}

function overviewIds(nodes: GraphNode[], _edges: GraphEdge[], adjacency: Map<string, string[]>): Set<string> {
  const rootId = "root:neurakeep";
  return nodes.some((node) => node.id === rootId)
    ? neighborhoodIds(rootId, adjacency, 1)
    : new Set(nodes.filter((node) => node.type === "root").map((node) => node.id));
}

function nodePriority(node: GraphNode): number {
  const typeScore = {
    root: 100,
    failure: 80,
    event: 70,
    fact: 60,
    source: 50,
    section: 20
  }[node.type];
  const sensitivityPenalty = node.sensitivity === "secret" ? -30 : node.sensitivity === "confidential" ? -10 : 0;
  return typeScore + sensitivityPenalty;
}

function addRootTopology(nodes: GraphNode[], edges: GraphEdge[], addNode: (node: GraphNode) => void): void {
  const roots: GraphNode[] = [
    { id: "root:neurakeep", label: "NeuraKeep", type: "root", space: "system", trustLevel: "verified", sensitivity: "normal" },
    { id: "root:sources", label: "Sources", type: "root", space: "system", trustLevel: "verified", sensitivity: "normal" },
    { id: "root:sections", label: "Sections", type: "root", space: "system", trustLevel: "verified", sensitivity: "normal" },
    { id: "root:decisions", label: "Decisions", type: "root", space: "system", trustLevel: "verified", sensitivity: "normal" },
    { id: "root:facts", label: "Facts", type: "root", space: "system", trustLevel: "verified", sensitivity: "normal" },
    { id: "root:failures", label: "Failures", type: "root", space: "system", trustLevel: "verified", sensitivity: "normal" }
  ];
  roots.forEach(addNode);
  for (const root of roots.slice(1)) {
    edges.push({ from: "root:neurakeep", to: root.id, type: "root" });
  }
  for (const node of nodes) {
    if (node.type === "source") edges.push({ from: "root:sources", to: node.id, type: "root" });
    if (node.type === "section") edges.push({ from: "root:sections", to: node.id, type: "root" });
    if (node.type === "event") edges.push({ from: "root:decisions", to: node.id, type: "root" });
    if (node.type === "fact") edges.push({ from: "root:facts", to: node.id, type: "root" });
    if (node.type === "failure") edges.push({ from: "root:failures", to: node.id, type: "root" });
  }
}

function addCitedRows(
  db: UmosDatabase,
  table: string,
  type: GraphNode["type"],
  labelColumn: string,
  addNode: (node: GraphNode) => void,
  edges: GraphEdge[]
): void {
  const rows = db
    .prepare(
      `SELECT id, ${labelColumn} AS label, source_ids_json, section_ids_json, space, trust_level, sensitivity FROM ${table}`
    )
    .all() as Array<{
    id: string;
    label: string;
    source_ids_json: string;
    section_ids_json: string;
    space: string;
    trust_level: string;
    sensitivity: string;
  }>;

  for (const row of rows) {
    addNode({
      id: row.id,
      label: row.label,
      type,
      space: row.space,
      trustLevel: row.trust_level,
      sensitivity: row.sensitivity
    });
    for (const cited of [...parseArray(row.source_ids_json), ...parseArray(row.section_ids_json)]) {
      edges.push({ from: row.id, to: cited, type: "cites" });
    }
  }
}

function parseArray(value: string): string[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

