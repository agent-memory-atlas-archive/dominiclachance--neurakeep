import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  apiClient,
  authSettings,
  listProposals,
  loadGraph,
  loadProposal,
  saveGraphState,
  type AuthSettings
} from "./api.js";
import { computeLayout, defaultPhysics, type LayoutPoint, type PhysicsSettings } from "./graphEngine.js";
import { Markdown } from "./markdown.js";
import type {
  GraphEdge,
  GraphNode,
  GraphPayload,
  GraphState,
  ProposalDiff,
  ProposalReview,
  ProposalSummary,
  RouteName,
  Toast
} from "./types.js";
import "./styles.css";

const colors: Record<GraphNode["type"], string> = {
  root: "#d6b2ff",
  source: "#4da3ff",
  section: "#6bd78f",
  event: "#f4c84a",
  fact: "#e7dc79",
  failure: "#ff6b6b"
};

const pinnedSearchPresets = [
  { name: "Failures", query: "do not repeat", filters: { memoryType: "failure", failuresOnly: true } },
  { name: "Decisions", query: "decision direction chosen", filters: { memoryType: "decision", failuresOnly: false } },
  { name: "Promarkia", query: "Promarkia", filters: { project: "Promarkia", failuresOnly: false } },
  { name: "NeuraKeep", query: "NeuraKeep memory graph", filters: { project: "NeuraKeep", failuresOnly: false } },
  { name: "Recent", query: "recent memory", filters: { dateFrom: new Date(Date.now() - 14 * 86400000).toISOString().slice(0, 10), failuresOnly: false } }
] as const;

function App(): React.ReactElement {
  const [route, setRoute] = useState<RouteName>(() => routeFromHash());
  const [graph, setGraph] = useState<GraphPayload>({ nodes: [], edges: [], state: {} });
  const [selected, setSelected] = useState<GraphNode | null>(null);
  const [focusIds, setFocusIds] = useState<Set<string> | null>(null);
  const [expandedBranches, setExpandedBranches] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("memory poisoning");
  const [typeFilter, setTypeFilter] = useState("");
  const [sourceId, setSourceId] = useState("latest");
  const [proposalId, setProposalId] = useState("");
  const [graphDepth, setGraphDepth] = useState(1);
  const [graphLimit, setGraphLimit] = useState(180);
  const [searchFilters, setSearchFilters] = useState<SearchFilters>({
    dateFrom: "",
    dateTo: "",
    project: "",
    sensitivity: "all",
    sourceOrigin: "all",
    memoryType: "all",
    failuresOnly: false
  });
  const [auth, setAuth] = useState<AuthSettings | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [modal, setModal] = useState<{ title: string; body: React.ReactNode } | null>(null);
  const [searching, setSearching] = useState(false);

  const toast = useCallback((message: string, type: Toast["type"] = "ok") => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setToasts((rows) => [...rows, { id, message, type }]);
    window.setTimeout(() => setToasts((rows) => rows.filter((row) => row.id !== id)), 3600);
  }, []);

  const refreshGraph = useCallback(async (options: { focusId?: string } = {}) => {
    const data = await loadGraph({ focusId: options.focusId, depth: graphDepth, limit: graphLimit });
    setGraph(data);
  }, [graphDepth, graphLimit]);

  const resetRootGraph = useCallback(async () => {
    const data = await loadGraph({ depth: graphDepth, limit: graphLimit });
    setGraph({ ...data, state: { ...(data.state ?? {}), mode: "all", collapsedBranches: [] } });
    setFocusIds(null);
    setSelected(null);
    setExpandedBranches(new Set());
  }, [graphDepth, graphLimit]);

  useEffect(() => {
    refreshGraph().catch((error) => toast(error.message, "error"));
    authSettings().then(setAuth).catch(() => null);
  }, [refreshGraph, toast]);

  useEffect(() => {
    const onHash = () => setRoute(routeFromHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const updateState = useCallback(
    async (state: GraphState) => {
      const saved = await saveGraphState(state);
      setGraph((current) => ({ ...current, state: saved }));
    },
    []
  );

  const runSearch = async (): Promise<void> => {
    if (!query.trim()) return;
    setSearching(true);
    try {
      const params = new URLSearchParams({
        query,
        limit: "20",
        neighbors: "1",
        memoryType: searchFilters.memoryType,
        sensitivity: searchFilters.sensitivity,
        sourceOrigin: searchFilters.sourceOrigin,
        failuresOnly: String(searchFilters.failuresOnly)
      });
      if (searchFilters.dateFrom) params.set("dateFrom", searchFilters.dateFrom);
      if (searchFilters.dateTo) params.set("dateTo", searchFilters.dateTo);
      if (searchFilters.project.trim()) params.set("project", searchFilters.project.trim());
      const data = await apiClient.api<{ results?: SearchResult[]; guidance?: RetrievalGuidance }>(`/api/search?${params.toString()}`);
      setModal({
        title: "Search Results",
        body: <SearchResults results={data.results ?? []} guidance={data.guidance} openRecord={openRecord} focusNode={focusNode} />
      });
    } finally {
      setSearching(false);
    }
  };

  const applyPinnedSearch = (preset: typeof pinnedSearchPresets[number]): void => {
    setQuery(preset.query);
    setSearchFilters((old) => ({
      ...old,
      dateFrom: "dateFrom" in preset.filters ? String(preset.filters.dateFrom ?? "") : old.dateFrom,
      project: "project" in preset.filters ? String(preset.filters.project ?? "") : old.project,
      memoryType: "memoryType" in preset.filters ? String(preset.filters.memoryType ?? old.memoryType) : old.memoryType,
      failuresOnly: Boolean(preset.filters.failuresOnly)
    }));
    setRoute("search");
    window.location.hash = "search";
    toast(`Pinned search loaded: ${preset.name}`);
  };

  const openRecord = async (id: string): Promise<void> => {
    setModal({ title: id, body: <div className="meta">Loading record...</div> });
    const data = await apiClient.mcp<{ record?: MemoryRecord }>("memory_read", { id });
    const record = data.record;
    setModal({
      title: recordTitle(record, id),
      body: <RecordView record={record} focusNode={focusNode} openRecord={openRecord} />
    });
  };

  const focusNode = (id: string): void => {
    const ids = new Set<string>([id]);
    for (const edge of graph.edges) {
      if (edge.from === id) ids.add(edge.to);
      if (edge.to === id) ids.add(edge.from);
    }
    setFocusIds(ids);
    setGraph((current) => ({ ...current, state: { ...current.state, mode: "focused" } }));
    setRoute("graph");
    window.location.hash = "graph";
    setModal(null);
  };

  const expandNode = async (id: string): Promise<void> => {
    const data = await loadGraph({ focusId: id, depth: graphDepth, limit: graphLimit });
    setGraph((current) => mergeGraphPayload(current, data));
    setFocusIds((old) => new Set([...(old ? Array.from(old) : []), ...data.nodes.map((node) => node.id)]));
    setExpandedBranches((old) => new Set([...Array.from(old), id]));
  };

  const collapseBranch = async (id: string): Promise<void> => {
    const branches = new Set(graph.state.collapsedBranches ?? []);
    if (branches.has(id)) branches.delete(id); else branches.add(id);
    const state = { ...graph.state, collapsedBranches: Array.from(branches) };
    setGraph((current) => ({ ...current, state }));
    setExpandedBranches((old) => {
      const next = new Set(old);
      next.delete(id);
      return next;
    });
    await updateState(state);
  };

  const proposeUpdate = async (): Promise<void> => {
    const proposal = await apiClient.mcp<ProposalReview>("memory_propose_update", {
      source_id: sourceId,
      extractor: "deterministic"
    });
    setProposalId(proposal.proposalId);
    toast("Proposal created");
    setRoute("proposals");
    window.location.hash = "proposals";
  };

  const applyCurrentProposal = async (): Promise<void> => {
    if (!proposalId.trim()) return;
    await apiClient.mcp("memory_apply_update", { proposal_id: proposalId.trim() });
    toast("Proposal applied");
    await refreshGraph();
  };

  const state = graph.state ?? {};

  return (
    <div className="app" data-route={route}>
      <aside>
        <h1 className="appBrand">
          <img src="/assets/icon.svg" alt="" width="30" height="30" />
          <span>NeuraKeep</span>
        </h1>
        <nav className="routes">
          {(["graph", "search", "inbox", "proposals", "quality", "settings"] as RouteName[]).map((name) => (
            <button key={name} className={route === name ? "active" : ""} onClick={() => { window.location.hash = name; setRoute(name); }}>
              {name === "proposals" ? "Props" : title(name)}
            </button>
          ))}
        </nav>
        {route === "graph" && (
          <RailSection title="Graph">
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search memory" />
            <input value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)} placeholder="Filter graph nodes/type" />
            <select
              value={state.mode ?? "all"}
              onChange={(event) => setGraph((current) => ({ ...current, state: { ...current.state, mode: event.target.value } }))}
            >
              <option value="all">All</option>
              <option value="focused">Focused</option>
              <option value="source">Source-centric</option>
              <option value="failures">Failures-only</option>
              <option value="decisions">Decisions-only</option>
            </select>
            <label>Expand depth<select value={graphDepth} onChange={(event) => setGraphDepth(Number(event.target.value))}>
              <option value={1}>1 hop</option>
              <option value={2}>2 hops</option>
              <option value={3}>3 hops</option>
            </select></label>
            <label>Visible cap<select value={graphLimit} onChange={(event) => setGraphLimit(Number(event.target.value))}>
              <option value={120}>120</option>
              <option value={180}>180</option>
              <option value={260}>260</option>
              <option value={400}>400</option>
            </select></label>
            <select
              value={state.clusterBy ?? "type"}
              onChange={(event) => setGraph((current) => ({ ...current, state: { ...current.state, clusterBy: event.target.value } }))}
            >
              <option value="type">Cluster by type</option>
              <option value="space">Cluster by space</option>
              <option value="trust">Cluster by trust</option>
              <option value="sensitivity">Cluster by sensitivity</option>
            </select>
            <EdgeControls state={state} setGraph={setGraph} />
            <PhysicsControls state={state} setGraph={setGraph} />
            <div className="compactGrid">
              <button onClick={() => resetRootGraph().then(() => toast("Root overview loaded"))}>Overview</button>
              <button onClick={() => updateState(state).then(() => toast("Graph saved"))}>Save</button>
              <button disabled={!selected} onClick={() => selected && togglePin(selected.id, graph, setGraph, updateState, toast)}>
                Pin
              </button>
              <button disabled={!selected} onClick={() => selected && toggleCollapse(selected.id, graph, setGraph, updateState, toast)}>
                Collapse
              </button>
            </div>
            <PinnedSearchButtons apply={applyPinnedSearch} />
          </RailSection>
        )}
        {route === "search" && (
          <RailSection title="Search">
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search memory" />
            <button disabled={!query.trim() || searching} onClick={() => runSearch().catch((error) => toast(error.message, "error"))}>{searching ? "Searching..." : "Search Modal"}</button>
            <PinnedSearchButtons apply={applyPinnedSearch} />
          </RailSection>
        )}
        {route === "proposals" && (
          <RailSection title="Proposal">
            <input value={sourceId} onChange={(event) => setSourceId(event.target.value)} placeholder="source id or latest" />
            <button onClick={() => proposeUpdate().catch((error) => toast(error.message, "error"))}>Propose</button>
            <input value={proposalId} onChange={(event) => setProposalId(event.target.value)} placeholder="proposal id" />
            <button disabled={!proposalId.trim()} onClick={() => applyCurrentProposal().catch((error) => toast(error.message, "error"))}>
              Apply
            </button>
          </RailSection>
        )}
        {route === "settings" && (
          <RailSection title="Auth">
            <input
              defaultValue={apiClient.getToken()}
              placeholder="Bearer token"
              onChange={(event) => apiClient.setToken(event.target.value)}
            />
            <div className="meta">{auth ? `${auth.mode} / ${auth.readOnly ? "read-only" : "read-write"} / ${auth.user.role}` : "Auth loading..."}</div>
          </RailSection>
        )}
        <div className="actionLog">{graph.nodes.length} / {graph.meta?.totalNodes ?? graph.nodes.length} nodes, {graph.edges.length} / {graph.meta?.totalEdges ?? graph.edges.length} edges</div>
      </aside>
      <main>
        <div className="toolbar">
          <input value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => event.key === "Enter" && runSearch()} placeholder="Search memory" />
          <button disabled={!query.trim() || searching} onClick={() => runSearch().catch((error) => toast(error.message, "error"))}>{searching ? "Searching..." : "Search"}</button>
          <button className="secondary" onClick={() => setModal(null)}>Clear</button>
        </div>
        {route === "graph" && (
          <GraphView
            graph={graph}
            state={state}
            typeFilter={typeFilter}
            focusIds={focusIds}
            selectedId={selected?.id ?? ""}
            onSelect={(node) => { setSelected(node); expandNode(node.id).catch((error) => toast(error.message, "error")); openRecord(node.id).catch((error) => toast(error.message, "error")); }}
            onExpandBranch={(id) => expandNode(id).then(() => toast("Branch expanded")).catch((error) => toast(error.message, "error"))}
            onCollapseBranch={(id) => collapseBranch(id).then(() => toast("Branch collapsed")).catch((error) => toast(error.message, "error"))}
            onResetGraph={() => resetRootGraph().then(() => toast("Root overview loaded")).catch((error) => toast(error.message, "error"))}
            onState={updateState}
            expandedBranches={expandedBranches}
          />
        )}
        {route === "search" && <SearchView query={query} setQuery={setQuery} runSearch={runSearch} searching={searching} toast={toast} filters={searchFilters} setFilters={setSearchFilters} />}
        {route === "inbox" && <InboxView toast={toast} refreshGraph={refreshGraph} />}
        {route === "proposals" && <ProposalsView toast={toast} refreshGraph={refreshGraph} openRecord={openRecord} />}
        {route === "quality" && <QualityView toast={toast} openRecord={openRecord} refreshGraph={refreshGraph} />}
        {route === "settings" && <SettingsView auth={auth} setAuth={setAuth} toast={toast} />}
      </main>
      {modal && <Modal title={modal.title} close={() => setModal(null)}>{modal.body}</Modal>}
      <div className="toastStack">{toasts.map((row) => <div key={row.id} className={`toast ${row.type ?? ""}`}>{row.message}</div>)}</div>
    </div>
  );
}

function GraphView(props: {
  graph: GraphPayload;
  state: GraphState;
  typeFilter: string;
  focusIds: Set<string> | null;
  selectedId: string;
  onSelect: (node: GraphNode) => void;
  onExpandBranch: (id: string) => void;
  onCollapseBranch: (id: string) => void;
  onResetGraph: () => void;
  onState: (state: GraphState) => Promise<void>;
  expandedBranches: Set<string>;
}): React.ReactElement {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [size, setSize] = useState({ width: 900, height: 700 });
  const [view, setView] = useState({ x: 0, y: 0, scale: 1 });
  const [drag, setDrag] = useState<{ id?: string; x: number; y: number; startX: number; startY: number } | null>(null);
  const [workerPositions, setWorkerPositions] = useState<Map<string, LayoutPoint> | null>(null);

  useEffect(() => {
    const resize = () => {
      const rect = svgRef.current?.getBoundingClientRect();
      if (rect) setSize({ width: rect.width, height: rect.height });
    };
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

  const filtered = useMemo(() => {
    const modeIds = graphModeIds(props.graph, props.state.mode ?? "all", props.selectedId, props.focusIds);
    const collapsed = new Set(props.state.collapsed ?? []);
    const branchHidden = branchHiddenIds(props.graph, props.state.collapsedBranches ?? []);
    const q = props.typeFilter.toLowerCase();
    return props.graph.nodes.filter((node) => {
      if (collapsed.has(node.id)) return false;
      if (branchHidden.has(node.id)) return false;
      if (modeIds && !modeIds.has(node.id)) return false;
      if (q && !`${node.label} ${node.type}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [props.graph, props.state, props.typeFilter, props.focusIds, props.selectedId]);

  const filteredIds = useMemo(() => new Set(filtered.map((node) => node.id)), [filtered]);
  const hiddenCounts = useMemo(() => hiddenNeighborCounts(props.graph, filteredIds), [props.graph, filteredIds]);
  const breadcrumb = useMemo(() => graphBreadcrumb(props.graph, props.selectedId), [props.graph, props.selectedId]);

  const edges = useMemo(() => {
    const edgeTypes = new Set(props.state.edgeTypes ?? ["root", "contains", "cites", "next"]);
    return props.graph.edges.filter((edge) => filteredIds.has(edge.from) && filteredIds.has(edge.to) && edgeTypes.has(edge.type));
  }, [props.graph.edges, props.state.edgeTypes, filteredIds]);

  const syncPositions = useMemo(
    () => filtered.length > 160 ? null : computeLayout(filtered, edges, size.width, size.height, props.state),
    [filtered, edges, size, props.state]
  );
  useEffect(() => {
    if (filtered.length <= 160) {
      setWorkerPositions(null);
      return;
    }
    let cancelled = false;
    try {
      const worker = new Worker(new URL("./graphLayoutWorker.ts", import.meta.url), { type: "module" });
      worker.onmessage = (event: MessageEvent<{ positions: Array<[string, LayoutPoint]> }>) => {
        if (!cancelled) setWorkerPositions(new Map(event.data.positions));
        worker.terminate();
      };
      worker.onerror = () => {
        if (!cancelled) setWorkerPositions(computeLayout(filtered, edges, size.width, size.height, props.state));
        worker.terminate();
      };
      worker.postMessage({ nodes: filtered, edges, width: size.width, height: size.height, state: props.state });
      return () => {
        cancelled = true;
        worker.terminate();
      };
    } catch {
      setWorkerPositions(computeLayout(filtered, edges, size.width, size.height, props.state));
    }
  }, [filtered, edges, size, props.state]);
  const positions = syncPositions ?? workerPositions ?? new Map<string, LayoutPoint>();

  const graphPoint = (event: React.MouseEvent): LayoutPoint => {
    const rect = svgRef.current?.getBoundingClientRect();
    const x = (event.clientX - (rect?.left ?? 0) - view.x) / view.scale;
    const y = (event.clientY - (rect?.top ?? 0) - view.y) / view.scale;
    return { x, y };
  };

  const saveNode = async (id: string, point: LayoutPoint): Promise<void> => {
    const pinned = Array.from(new Set([...(props.state.pinned ?? []), id]));
    await props.onState({
      ...props.state,
      pinned,
      layout: { ...(props.state.layout ?? {}), [id]: { ...point, pinned: true } }
    });
  };

  return (
    <section className="graphWrap">
      <div className="graphControls">
        <button onClick={() => setView((old) => ({ ...old, scale: Math.max(0.35, old.scale / 1.2) }))}>-</button>
        <span>{Math.round(view.scale * 100)}%</span>
        <button onClick={() => setView((old) => ({ ...old, scale: Math.min(4, old.scale * 1.2) }))}>+</button>
        <button onClick={() => { setView({ x: 0, y: 0, scale: 1 }); props.onResetGraph(); }}>Reset</button>
      </div>
      <div className="graphInfoPanel">
        <h2>Legend</h2>
        <div className="legendGrid">
          {Object.entries(colors).map(([type, color]) => <span key={type}><i style={{ background: color }} />{type}</span>)}
        </div>
        <h2>Node Details</h2>
        {breadcrumb.length > 0 && <div className="breadcrumbs">{breadcrumb.map((node, index) => <span key={node.id}>{index > 0 ? ">" : ""}{node.label}</span>)}</div>}
        <div className="meta">{props.selectedId ? `${props.selectedId} selected. Its connected neighborhood is loaded. Alt-drag to pin.` : "Overview mode shows a bounded set. Click a node to load connected nodes. Alt-drag to pin."}</div>
        <div className="meta">{props.graph.meta ? `${props.graph.meta.visibleNodes}/${props.graph.meta.totalNodes} nodes visible, depth ${props.graph.meta.depth}, cap ${props.graph.meta.limit}${props.graph.meta.truncated ? " (trimmed)" : ""}` : `${filtered.length} nodes visible`}</div>
        <div className="proposalTools">
          <button disabled={!props.selectedId} onClick={() => props.selectedId && props.onExpandBranch(props.selectedId)}>Expand branch</button>
          <button disabled={!props.selectedId} onClick={() => props.selectedId && props.onCollapseBranch(props.selectedId)}>
            {props.selectedId && props.expandedBranches.has(props.selectedId) ? "Collapse branch" : "Hide branch"}
          </button>
          <button onClick={props.onResetGraph}>Root overview</button>
        </div>
      </div>
      <svg
        ref={svgRef}
        data-testid="graph-svg"
        onWheel={(event) => {
          event.preventDefault();
          const factor = event.deltaY > 0 ? 0.9 : 1.1;
          setView((old) => ({ ...old, scale: Math.max(0.35, Math.min(4, old.scale * factor)) }));
        }}
        onMouseMove={(event) => {
          if (!drag) return;
          if (drag.id) {
            const point = graphPoint(event);
            props.graph.state.layout = { ...(props.graph.state.layout ?? {}), [drag.id]: { ...point, pinned: true } };
            props.graph.state.pinned = Array.from(new Set([...(props.graph.state.pinned ?? []), drag.id]));
          } else {
            setView((old) => ({ ...old, x: drag.startX + event.clientX - drag.x, y: drag.startY + event.clientY - drag.y }));
          }
        }}
        onMouseUp={(event) => {
          if (drag?.id) void saveNode(drag.id, graphPoint(event));
          setDrag(null);
        }}
        onMouseLeave={() => setDrag(null)}
        onMouseDown={(event) => {
          if (event.target === svgRef.current) setDrag({ x: event.clientX, y: event.clientY, startX: view.x, startY: view.y });
        }}
      >
        <g transform={`translate(${view.x} ${view.y}) scale(${view.scale})`}>
          {edges.map((edge, index) => {
            const a = positions.get(edge.from);
            const b = positions.get(edge.to);
            if (!a || !b) return null;
            return <line key={`${edge.from}-${edge.to}-${index}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} className={`edge ${edge.type}`} />;
          })}
          {filtered.map((node) => {
            const p = positions.get(node.id);
            if (!p) return null;
            return (
              <g
                key={node.id}
                className={`node ${props.selectedId === node.id ? "selected" : ""}`}
                onMouseDown={(event) => {
                  if (event.altKey) {
                    event.stopPropagation();
                    setDrag({ id: node.id, x: event.clientX, y: event.clientY, startX: p.x, startY: p.y });
                  }
                }}
                onClick={(event) => { event.stopPropagation(); props.onSelect(node); }}
              >
                <circle className="hit" cx={p.x} cy={p.y} r={15} />
                <circle cx={p.x} cy={p.y} r={8} fill={colors[node.type]} />
                <text x={p.x + 12} y={p.y + 4}>{node.label.length > 28 ? `${node.label.slice(0, 27)}...` : node.label}</text>
                {(hiddenCounts.get(node.id) ?? 0) > 0 && <text className="hiddenBadge" x={p.x - 10} y={p.y - 13}>+{hiddenCounts.get(node.id)}</text>}
              </g>
            );
          })}
        </g>
      </svg>
    </section>
  );
}

function ProposalsView({ toast, refreshGraph, openRecord }: { toast: (message: string, type?: Toast["type"]) => void; refreshGraph: () => Promise<void>; openRecord: (id: string) => Promise<void> }): React.ReactElement {
  const [status, setStatus] = useState("pending");
  const [filter, setFilter] = useState("all");
  const [proposals, setProposals] = useState<ProposalSummary[]>([]);
  const [review, setReview] = useState<ProposalReview | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Record<string, boolean>>({});
  const [groups, setGroups] = useState<Array<{ key: string; label: string; ids: string[]; count: number; clean: number; warnings: number; blocked: number }>>([]);
  const [triage, setTriage] = useState<Record<string, any> | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setProposals(await listProposals(status, filter));
      const groupData = await apiClient.api<{ groups: typeof groups }>("/api/proposals/groups");
      setGroups(groupData.groups);
    } finally {
      setLoading(false);
    }
  }, [status, filter]);
  useEffect(() => { reload().catch((error) => toast(error.message, "error")); }, [reload, toast]);

  const setStatusFor = async (id: string, next: string): Promise<void> => {
    await apiClient.api(`/api/proposals/${encodeURIComponent(id)}/status`, { method: "POST", body: JSON.stringify({ status: next }) });
    toast(`Proposal ${next}`);
    await reload();
  };
  const selectedList = () => Object.entries(selectedIds).filter(([, value]) => value).map(([id]) => id);
  const bulkStatus = async (next: "archived" | "rejected"): Promise<void> => {
    const ids = selectedList();
    if (ids.length === 0) {
      toast("Select at least one proposal first.", "error");
      return;
    }
    await apiClient.api("/api/proposals/bulk-status", { method: "POST", body: JSON.stringify({ ids, status: next }) });
    setSelectedIds({});
    toast(`${ids.length} proposals ${next}`);
    await reload();
  };
  const applySelectedClean = async (): Promise<void> => {
    const cleanIds = proposals.filter((row) => selectedIds[row.id] && row.status === "pending" && row.clean).map((row) => row.id);
    if (cleanIds.length === 0) {
      toast("No selected clean pending proposals to apply.", "error");
      return;
    }
    for (const id of cleanIds) {
      await apiClient.api(`/api/proposals/${encodeURIComponent(id)}/apply`, { method: "POST", body: "{}" });
    }
    setSelectedIds({});
    toast(`${cleanIds.length} clean proposals applied`);
    await refreshGraph();
    await reload();
  };
  const archiveDuplicates = async (): Promise<void> => {
    const result = await apiClient.api<{ archived: string[] }>("/api/proposals/archive-duplicates", { method: "POST", body: "{}" });
    toast(`${result.archived.length} duplicate proposals archived`);
    await reload();
  };
  const applyHighValueClean = async (): Promise<void> => {
    const result = await apiClient.api<{ applied: string[]; skipped: unknown[] }>("/api/proposals/apply-high-value-clean", { method: "POST", body: JSON.stringify({ limit: 25 }) });
    toast(`Applied ${result.applied.length} clean high-value proposals${result.skipped.length ? `, ${result.skipped.length} skipped` : ""}`);
    await refreshGraph();
    await reload();
  };
  const triageWarnings = async (archive: boolean): Promise<void> => {
    const result = await apiClient.api<Record<string, any>>("/api/proposals/triage-noisy", {
      method: "POST",
      body: JSON.stringify({ archive, limit: 50 })
    });
    setTriage(result);
    toast(archive ? `Archived ${result.archived?.length ?? 0} noisy warning proposals` : `Reviewed ${result.totalWarnings ?? 0} warning proposals`);
    await reload();
  };

  return (
    <section className="viewSurface">
      <h2>Proposal Inbox</h2>
      <div className="filters">
        <select value={status} onChange={(event) => setStatus(event.target.value)}>
          <option value="pending">pending</option><option value="all">all</option><option value="applied">applied</option><option value="archived">archived</option><option value="rejected">rejected</option>
        </select>
        <select value={filter} onChange={(event) => setFilter(event.target.value)}>
          <option value="all">all</option><option value="clean">clean</option><option value="warnings">warnings</option><option value="blocked">blocked</option>
        </select>
      </div>
      <div className="viewCard cleanupCard">
        <h3>Bulk Review</h3>
        <div className="proposalTools">
          <button onClick={() => setSelectedIds(Object.fromEntries(proposals.map((row) => [row.id, true])))}>Select page</button>
          <button onClick={() => setSelectedIds(Object.fromEntries(proposals.filter((row) => row.clean && row.status === "pending").map((row) => [row.id, true])))}>Select clean</button>
          <button onClick={() => setSelectedIds({})}>Clear</button>
          <button onClick={() => applySelectedClean().catch((error) => toast(error.message, "error"))}>Apply selected clean</button>
          <button onClick={() => bulkStatus("archived").catch((error) => toast(error.message, "error"))}>Archive selected</button>
          <button onClick={() => bulkStatus("rejected").catch((error) => toast(error.message, "error"))}>Reject selected</button>
          <button onClick={() => archiveDuplicates().catch((error) => toast(error.message, "error"))}>Archive duplicates</button>
          <button onClick={() => applyHighValueClean().catch((error) => toast(error.message, "error"))}>Apply clean high-value</button>
          <button onClick={() => triageWarnings(false).catch((error) => toast(error.message, "error"))}>Preview noisy warnings</button>
          <button onClick={() => triageWarnings(true).catch((error) => toast(error.message, "error"))}>Archive noisy warnings</button>
        </div>
        <div className="groupGrid">{groups.slice(0, 10).map((group) => <button className="groupButton" key={group.key} onClick={() => setSelectedIds(Object.fromEntries(group.ids.map((id) => [id, true])))}><b>{group.label}</b><span>{group.count} total / {group.clean} clean / {group.warnings} warnings / {group.blocked} blocked</span></button>)}</div>
        {triage && <div className="triagePreview"><div className="chips"><span>{triage.noisy?.length ?? 0} noisy</span><span>{triage.keepForReview?.length ?? 0} keep for review</span><span>{triage.archived?.length ?? 0} archived</span></div>{(triage.keepForReview ?? []).slice(0, 6).map((row: Record<string, unknown>) => <div className="result" key={String(row.id)}><b>Review: {String(row.summary)}</b><div className="meta">{String(row.warningCount)} warnings / {String(row.blockedCount)} blocked</div></div>)}</div>}
      </div>
      <table className="viewTable">
        <thead><tr><th>Select</th><th>Proposal</th><th>Status</th><th>Actions</th></tr></thead>
        <tbody>
          {loading && <tr><td colSpan={4} className="meta">Loading proposals...</td></tr>}
          {!loading && proposals.length === 0 && <tr><td colSpan={4} className="meta">No proposals match this filter. Ingestion and self-memory will queue new proposals here for review.</td></tr>}
          {proposals.map((row) => (
            <tr key={row.id}>
              <td><input type="checkbox" checked={Boolean(selectedIds[row.id])} onChange={(event) => setSelectedIds((old) => ({ ...old, [row.id]: event.target.checked }))} /></td>
              <td><b>{row.summary}</b><div className="meta">{row.id} / {row.createdAt}</div><div className="chips"><span>{row.counts.events} events</span><span>{row.counts.facts} facts</span><span>{row.counts.failures} failures</span><span>{row.warningCount} warnings</span><span>{row.blockedCount} blocked</span></div></td>
              <td>{row.status}</td>
              <td className="rowActions">
                <button onClick={() => loadProposal(row.id).then(setReview).catch((error) => toast(error.message, "error"))}>Review</button>
                <button disabled={row.status !== "pending" || !row.clean || row.blockedCount > 0} title={row.clean ? "Apply this clean pending proposal." : "Review warnings before applying."} onClick={() => apiClient.api(`/api/proposals/${encodeURIComponent(row.id)}/apply`, { method: "POST", body: "{}" }).then(refreshGraph).then(reload).then(() => toast("Clean proposal applied")).catch((error) => toast(error.message, "error"))}>Apply clean</button>
                <button onClick={() => setStatusFor(row.id, "archived").catch((error) => toast(error.message, "error"))}>Archive</button>
                <button onClick={() => setStatusFor(row.id, "rejected").catch((error) => toast(error.message, "error"))}>Reject</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {review && <ProposalReviewer proposal={review} toast={toast} refreshGraph={refreshGraph} openRecord={openRecord} afterApply={() => { setReview(null); void reload(); }} />}
    </section>
  );
}

function ProposalReviewer({ proposal, toast, refreshGraph, openRecord, afterApply }: { proposal: ProposalReview; toast: (message: string, type?: Toast["type"]) => void; refreshGraph: () => Promise<void>; openRecord: (id: string) => Promise<void>; afterApply: () => void }): React.ReactElement {
  const [diff, setDiff] = useState<ProposalDiff>(proposal.diff);
  const [selected, setSelected] = useState(() => selectedMap(proposal.diff, true));
  const original = proposal.diff;
  const governorItems = [...(proposal.governor?.warnings ?? []), ...(proposal.governor?.blocked ?? [])];

  useEffect(() => {
    setDiff(proposal.diff);
    setSelected(selectedMap(proposal.diff, true));
  }, [proposal]);

  const applySelected = async (): Promise<void> => {
    const reviewed = filterDiff(diff, selected);
    if (countItems(reviewed) === 0) {
      toast("Select at least one proposal item before applying.", "error");
      return;
    }
    await apiClient.api(`/api/proposals/${encodeURIComponent(proposal.proposalId)}/apply`, { method: "POST", body: JSON.stringify({ diff: reviewed }) });
    toast("Reviewed proposal applied");
    await refreshGraph();
    afterApply();
  };

  return (
    <div className="reviewer" data-testid="proposal-reviewer">
      <h2>Review Proposal</h2>
      <div className="chips"><span>{proposal.proposalId}</span><span>{proposal.governor?.warnings.length ?? 0} warnings</span><span>{proposal.governor?.blocked.length ?? 0} blocked</span></div>
      <div className="proposalTools">
        <button onClick={() => setSelected(selectedMap(diff, true))}>Select all</button>
        <button onClick={() => setSelected(selectedMap(diff, false))}>Select none</button>
        <button onClick={() => setSelected(cleanSelected(diff, governorItems))}>Select clean</button>
        <button onClick={() => apiClient.api(`/api/proposals/${encodeURIComponent(proposal.proposalId)}/save`, { method: "POST", body: JSON.stringify({ diff }) }).then(() => toast("Review saved")).catch((error) => toast(error.message, "error"))}>Save</button>
        <button onClick={() => applySelected().catch((error) => toast(error.message, "error"))}>Apply selected</button>
      </div>
      <DiffPreview original={original} current={diff} />
      <ReviewTable title="Events" kind="events" rows={diff.events} selected={selected} setSelected={setSelected} update={(rows) => setDiff({ ...diff, events: rows })} warnings={governorItems} openRecord={openRecord} />
      <ReviewTable title="Facts" kind="facts" rows={diff.facts} selected={selected} setSelected={setSelected} update={(rows) => setDiff({ ...diff, facts: rows })} warnings={governorItems} openRecord={openRecord} />
      <ReviewTable title="Failures" kind="failures" rows={diff.failures} selected={selected} setSelected={setSelected} update={(rows) => setDiff({ ...diff, failures: rows })} warnings={governorItems} openRecord={openRecord} />
    </div>
  );
}

function ReviewTable({ title: titleText, kind, rows, selected, setSelected, update, warnings, openRecord }: {
  title: string;
  kind: keyof ProposalDiff;
  rows: Array<Record<string, any>>;
  selected: Record<string, boolean>;
  setSelected: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  update: (rows: any[]) => void;
  warnings: Array<{ itemId: string; message: string }>;
  openRecord: (id: string) => Promise<void>;
}): React.ReactElement {
  const bulkPrefix = `${kind}:`;
  return (
    <div className="reviewBlock">
      <h3>{titleText}</h3>
      <table className="viewTable">
        <tbody>
          {rows.map((row, index) => {
            const key = `${kind}:${index}`;
            const warning = warnings.find((item) => item.itemId === row.id);
            return (
              <tr key={key}>
                <td><input type="checkbox" checked={selected[key] ?? true} onChange={(event) => setSelected((old) => ({ ...old, [key]: event.target.checked }))} /></td>
                <td>
                  {Object.entries(row).filter(([field]) => !["sourceIds", "sectionIds", "id"].includes(field)).map(([field, value]) => (
                    <label key={field}>{field}<input value={String(value ?? "")} onChange={(event) => update(rows.map((item, rowIndex) => rowIndex === index ? { ...item, [field]: event.target.value } : item) as never[])} /></label>
                  ))}
                  {warning && <div className="warn">{warning.message}</div>}
                </td>
                <td><CitationButtons ids={[...(row.sourceIds as string[] ?? []), ...(row.sectionIds as string[] ?? [])]} openRecord={openRecord} /></td>
              </tr>
            );
          })}
          {rows.length === 0 && <tr><td className="meta">No {bulkPrefix.slice(0, -1)} items.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

function DiffPreview({ original, current }: { original: ProposalDiff; current: ProposalDiff }): React.ReactElement {
  const before = countItems(original);
  const after = countItems(current);
  return <div className="diffPreview"><b>Diff preview</b><span>{before} original items</span><span>{after} current items</span><span>{after - before >= 0 ? "+" : ""}{after - before} net</span></div>;
}

function SearchView({ query, setQuery, runSearch, searching, toast, filters, setFilters }: {
  query: string;
  setQuery: (value: string) => void;
  runSearch: () => Promise<void>;
  searching: boolean;
  toast: (message: string, type?: Toast["type"]) => void;
  filters: SearchFilters;
  setFilters: React.Dispatch<React.SetStateAction<SearchFilters>>;
}): React.ReactElement {
  const [presets, setPresets] = useState<Array<{ name: string; query: string; filters: SearchFilters }>>([]);
  const [presetName, setPresetName] = useState("");
  useEffect(() => {
    apiClient.api<{ presets: Array<{ name: string; query: string; filters: SearchFilters }> }>("/api/search/presets")
      .then((data) => setPresets(data.presets))
      .catch(() => null);
  }, []);
  const set = <K extends keyof SearchFilters>(key: K, value: SearchFilters[K]) => setFilters((old) => ({ ...old, [key]: value }));
  const savePreset = async (): Promise<void> => {
    const name = presetName.trim() || query.trim();
    if (!name) {
      toast("Name the preset first.", "error");
      return;
    }
    const result = await apiClient.api<{ presets: Array<{ name: string; query: string; filters: SearchFilters }> }>("/api/search/presets", {
      method: "POST",
      body: JSON.stringify({ name, query, filters })
    });
    setPresets(result.presets);
    setPresetName("");
    toast("Search preset saved");
  };
  const applyPreset = (name: string): void => {
    const preset = presets.find((item) => item.name === name);
    if (!preset) return;
    setQuery(preset.query);
    setFilters({ ...filters, ...(preset.filters ?? {}) });
    toast(`Preset loaded: ${preset.name}`);
  };
  return <section className="viewSurface"><h2>Search</h2><div className="viewCard"><input value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => event.key === "Enter" && runSearch().catch((error) => toast(error.message, "error"))} /><div className="searchPresetBar"><select defaultValue="" onChange={(event) => applyPreset(event.target.value)}><option value="" disabled>saved presets</option>{presets.map((preset) => <option key={preset.name} value={preset.name}>{preset.name}</option>)}</select><input value={presetName} onChange={(event) => setPresetName(event.target.value)} placeholder="Preset name" /><button onClick={() => savePreset().catch((error) => toast(error.message, "error"))}>Save preset</button></div><div className="searchFilters"><label>From<input type="date" value={filters.dateFrom} onChange={(event) => set("dateFrom", event.target.value)} /></label><label>To<input type="date" value={filters.dateTo} onChange={(event) => set("dateTo", event.target.value)} /></label><label>Project<input value={filters.project} onChange={(event) => set("project", event.target.value)} placeholder="optional" /></label><label>Sensitivity<select value={filters.sensitivity} onChange={(event) => set("sensitivity", event.target.value)}><option value="all">all</option><option value="normal">normal</option><option value="internal">internal</option><option value="confidential">confidential</option><option value="secret">secret</option></select></label><label>Origin<select value={filters.sourceOrigin} onChange={(event) => set("sourceOrigin", event.target.value)}><option value="all">all</option><option value="manual">manual</option><option value="agent">agent</option><option value="session">session</option><option value="import">import</option><option value="connector">connector</option><option value="system">system</option></select></label><label>Type<select value={filters.memoryType} onChange={(event) => set("memoryType", event.target.value)}><option value="all">all</option><option value="source">source</option><option value="decision">decision</option><option value="failure">failure</option></select></label><label className="check"><input type="checkbox" checked={filters.failuresOnly} onChange={(event) => set("failuresOnly", event.target.checked)} />failures only</label></div><button disabled={!query.trim() || searching} onClick={() => runSearch().catch((error) => toast(error.message, "error"))}>{searching ? "Searching..." : "Open Search Modal"}</button><p className="meta">Results stay in a modal so the graph area remains available. Use failures-only for "don't repeat this mistake" searches.</p></div></section>;
}

function InboxView({ toast, refreshGraph }: { toast: (message: string, type?: Toast["type"]) => void; refreshGraph: () => Promise<void> }): React.ReactElement {
  const [files, setFiles] = useState<Array<{ name: string; path: string; kind: string; bytes: number; riskFlags?: string[]; trustHint?: string; sourceHint?: string }>>([]);
  const [status, setStatus] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(true);
  const [manualPath, setManualPath] = useState("");
  const [manualKind, setManualKind] = useState("auto");
  const [dragging, setDragging] = useState(false);
  const [ocrHealth, setOcrHealth] = useState<Record<string, any> | null>(null);
  const [importSupport, setImportSupport] = useState<Record<string, any> | null>(null);
  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setFiles((await apiClient.api<{ files: typeof files }>("/api/inbox")).files);
      setStatus(await apiClient.api("/api/watch/status"));
      setOcrHealth(await apiClient.api("/api/import/ocr-health"));
      setImportSupport(await apiClient.api("/api/import/supported"));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { reload().catch((error) => toast(error.message, "error")); }, [reload, toast]);
  const importManual = async (): Promise<void> => {
    await apiClient.api("/api/import", { method: "POST", body: JSON.stringify({ path: manualPath, kind: manualKind }) });
    setManualPath("");
    await refreshGraph();
    await reload();
    toast("Manual memory imported and queued for proposal review");
  };
  const uploadFiles = async (fileList: FileList | File[]): Promise<void> => {
    const items = Array.from(fileList).slice(0, 6);
    for (const file of items) {
      const contentBase64 = await fileToBase64(file);
      await apiClient.api("/api/import/upload", {
        method: "POST",
        body: JSON.stringify({ fileName: file.name, kind: manualKind, contentBase64 })
      });
    }
    await refreshGraph();
    await reload();
    toast(`${items.length} file${items.length === 1 ? "" : "s"} uploaded and queued for review`);
  };
  return <section className="viewSurface"><h2>Inbox</h2><div className="viewGrid"><div className="viewCard"><h3>Manual Import</h3><div className="meta">Import a local markdown, text, session JSONL, or PDF from the workspace, vault, or your home folder.</div><div className={`dropZone ${dragging ? "dragging" : ""}`} onDragOver={(event) => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={(event) => { event.preventDefault(); setDragging(false); void uploadFiles(event.dataTransfer.files).catch((error) => toast(error.message, "error")); }}><b>Drop PDFs or notes here</b><span>Files are copied to the local inbox, indexed, and queued as proposals.</span><input type="file" multiple accept=".pdf,.md,.txt,.jsonl" onChange={(event) => event.target.files && uploadFiles(event.target.files).catch((error) => toast(error.message, "error"))} /></div><label>File path<input value={manualPath} onChange={(event) => setManualPath(event.target.value)} placeholder="C:\\Users\\macro\\Downloads\\paper.pdf" /></label><label>Kind<select value={manualKind} onChange={(event) => setManualKind(event.target.value)}><option value="auto">auto</option><option value="markdown">markdown</option><option value="note">note</option><option value="session">session</option><option value="pdf">pdf</option></select></label><button disabled={!manualPath.trim()} onClick={() => importManual().catch((error) => toast(error.message, "error"))}>Import Memory</button><button onClick={() => apiClient.api<{ ingested: unknown[]; skipped: unknown[] }>("/api/memory/sync", { method: "POST", body: "{}" }).then((result) => refreshGraph().then(reload).then(() => toast(`Memory sync: ${result.ingested.length} new, ${result.skipped.length} skipped`))).catch((error) => toast(error.message, "error"))}>Sync workspace memory</button></div><ImportSupportCard support={importSupport} /><OcrHealthCard health={ocrHealth} /><div className="viewCard"><h3>Files</h3>{loading && <div className="meta">Loading inbox...</div>}{!loading && files.length === 0 && <div className="meta">No inbox files waiting. Watchers and self-memory summaries queue proposals here before anything becomes durable.</div>}{files.map((file) => <div className="result" key={file.path}><b>{file.name}</b><div className="meta">{file.path}</div><div className="chips"><span>{file.kind}</span><span>{Math.round(file.bytes / 1024)} KB</span><span>{file.sourceHint ?? "inbox"}</span><span>{file.trustHint ?? "normal"}</span>{(file.riskFlags ?? []).map((flag) => <span className="warnChip" key={flag}>{flag}</span>)}</div><button onClick={() => apiClient.api("/api/ingest", { method: "POST", body: JSON.stringify({ path: file.path, kind: file.kind }) }).then(refreshGraph).then(reload).then(() => toast("File ingested and queued for proposal review")).catch((error) => toast(error.message, "error"))}>Ingest</button></div>)}</div><div className="viewCard"><h3>Watcher</h3><div className="meta">Watcher ingestion creates pending proposals only; it does not auto-apply durable memory. Session/profile imports are deduped and redacted before queueing when secrets are detected.</div><div className="chips"><span>{String(status.running ? "running" : "stopped")}</span><span>{String(status.runCount ?? 0)} runs</span></div><button disabled={Boolean(status.running)} onClick={() => apiClient.api("/api/watch/start", { method: "POST", body: "{}" }).then(reload).then(() => toast("Watcher started")).catch((error) => toast(error.message, "error"))}>Start Watcher</button><button disabled={!status.running} onClick={() => apiClient.api("/api/watch/stop", { method: "POST", body: "{}" }).then(reload).then(() => toast("Watcher stopped")).catch((error) => toast(error.message, "error"))}>Stop Watcher</button><pre>{JSON.stringify(status.history ?? [], null, 2)}</pre></div></div></section>;
}

function OcrHealthCard({ health }: { health: Record<string, any> | null }): React.ReactElement {
  const tools = health?.tools ?? {};
  return <div className="viewCard"><h3>OCR Health</h3><div className="chips"><span className={health?.ok ? "" : "warnChip"}>{health?.ok ? "OCR ready" : "OCR tools missing"}</span><span>pdftoppm: {tools.pdftoppm?.installed ? "installed" : "missing"}</span><span>tesseract: {tools.tesseract?.installed ? "installed" : "missing"}</span></div><div className="meta">{health?.ok ? "Scanned PDFs can be OCR-indexed locally." : String(health?.install?.windows ?? "Install Poppler and Tesseract, then add both to PATH.")}</div></div>;
}

function ImportSupportCard({ support }: { support: Record<string, any> | null }): React.ReactElement {
  const kinds = support?.supportedKinds ?? [];
  return <div className="viewCard"><h3>Import Support</h3><div className="chips">{kinds.map((row: Record<string, unknown>) => <span key={String(row.kind)}>{String(row.kind)} {Array.isArray(row.extensions) ? row.extensions.join("/") : ""}</span>)}</div><div className="meta">Approved roots: {(support?.approvedRoots ?? []).join(" | ") || "loading"}</div><div className="meta">Raw sources index immediately; durable facts, events, failures, and decisions stay proposal-reviewed.</div></div>;
}

function QualityView({ toast, openRecord, refreshGraph }: { toast: (message: string, type?: Toast["type"]) => void; openRecord: (id: string) => Promise<void>; refreshGraph: () => Promise<void> }): React.ReactElement {
  const [report, setReport] = useState<Record<string, unknown>>({});
  const [dashboard, setDashboard] = useState<Record<string, any>>({});
  const [audit, setAudit] = useState<{ entries?: Array<Record<string, unknown>> }>({});
  const [timeline, setTimeline] = useState<{ timeline?: Array<Record<string, unknown>> }>({});
  const [fuzzyGroups, setFuzzyGroups] = useState<Array<Record<string, any>>>([]);
  const [selectedFuzzy, setSelectedFuzzy] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setReport(await apiClient.api("/api/quality"));
      setDashboard(await apiClient.api("/api/quality/dashboard"));
      setAudit(await apiClient.api("/api/governor/audit"));
      setTimeline(await apiClient.api("/api/governor/timeline"));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { reload().catch((error) => toast(error.message, "error")); }, [reload, toast]);
  const previewFuzzy = async (): Promise<void> => {
    const result = await apiClient.api<{ groups: Array<Record<string, any>> }>("/api/memory/dedupe/fuzzy-preview");
    setFuzzyGroups(result.groups);
    setSelectedFuzzy(Object.fromEntries(result.groups.slice(0, 20).map((group) => [String(group.groupId), Boolean(group.safeAutoSelectable)])));
    toast(`Found ${result.groups.length} fuzzy duplicate groups`);
  };
  const applySelectedFuzzy = async (): Promise<void> => {
    const groupIds = Object.entries(selectedFuzzy).filter(([, value]) => value).map(([id]) => id);
    if (groupIds.length === 0) {
      toast("Select at least one fuzzy group first.", "error");
      return;
    }
    const result = await apiClient.api<{ collapsedGroups: number; collapsedFacts: number }>("/api/memory/dedupe/fuzzy", {
      method: "POST",
      body: JSON.stringify({ groupIds })
    });
    setFuzzyGroups([]);
    setSelectedFuzzy({});
    await reload();
    await refreshGraph();
    toast(`Fuzzy-collapsed ${result.collapsedFacts} facts in ${result.collapsedGroups} groups`);
  };
  return <section className="viewSurface"><h2>Quality</h2>{loading && <div className="meta">Loading quality checks...</div>}<QualityDashboard dashboard={dashboard} /><div className="viewGrid"><div className="viewCard"><h3>Memory Deduplication</h3><div className="meta">Exact duplicate collapse can run directly. Fuzzy collapse requires preview and selected groups before stale/supersedes changes are committed.</div><button onClick={() => apiClient.api<{ collapsedGroups: number; collapsedFacts: number }>("/api/memory/dedupe", { method: "POST", body: "{}" }).then((result) => reload().then(refreshGraph).then(() => toast(`Collapsed ${result.collapsedFacts} duplicate facts in ${result.collapsedGroups} groups`))).catch((error) => toast(error.message, "error"))}>Collapse exact duplicates</button><button onClick={() => previewFuzzy().catch((error) => toast(error.message, "error"))}>Preview fuzzy duplicates</button><button disabled={Object.values(selectedFuzzy).filter(Boolean).length === 0} onClick={() => applySelectedFuzzy().catch((error) => toast(error.message, "error"))}>Apply selected fuzzy</button><div className="chips"><span>{(report.duplicateFacts as unknown[] | undefined)?.length ?? 0} exact fact groups</span><span>{dashboard.counts?.fuzzyDuplicateFactGroups ?? 0} fuzzy fact groups</span><span>{(report.duplicateFailures as unknown[] | undefined)?.length ?? 0} duplicate failure groups</span></div>{fuzzyGroups.length > 0 && <div className="dedupePreview">{fuzzyGroups.slice(0, 20).map((group) => <label className="dedupeGroup" key={String(group.groupId)}><input type="checkbox" checked={Boolean(selectedFuzzy[String(group.groupId)])} onChange={(event) => setSelectedFuzzy((old) => ({ ...old, [String(group.groupId)]: event.target.checked }))} /><b>Keep: {String(group.winner?.subject ?? group.winner?.id)}</b><span>{Number(group.similarity ?? 0).toFixed(2)} similarity / stale {(group.losers ?? []).length} duplicates</span><span className={group.safeAutoSelectable ? "chip" : "warnChip"}>{String(group.reviewRecommendation ?? "manual_review_required")}</span><p>{String(group.winner?.object ?? "")}</p></label>)}</div>}</div><QualityBlock title="Conflicts" rows={report.conflictingFacts as Array<Record<string, unknown>>} openRecord={openRecord} toast={toast} refresh={async () => { await reload(); await refreshGraph(); }} /><QualityBlock title="Stale Review Queue" rows={report.staleFacts as Array<Record<string, unknown>>} openRecord={openRecord} toast={toast} refresh={async () => { await reload(); await refreshGraph(); }} /><div className="viewCard"><h3>Undo History</h3>{(audit.entries ?? []).length === 0 && <div className="meta">No governor actions yet.</div>}{(audit.entries ?? []).map((row) => <div className="result" key={String(row.id)}><b>{String(row.action)} {String(row.createdAt)}</b><div className="meta">{(row.targetIds as string[] | undefined)?.join(", ")}</div>{row.undoable ? <button onClick={() => apiClient.api("/api/governor/undo", { method: "POST", body: JSON.stringify({ auditId: row.id }) }).then(reload).then(() => toast("Undo restored")).catch((error) => toast(error.message, "error"))}>Undo</button> : null}</div>)}</div><div className="viewCard"><h3>Timeline</h3>{(timeline.timeline ?? []).length === 0 && <div className="meta">No supersede or review timeline yet.</div>}{(timeline.timeline ?? []).slice(0, 20).map((row) => <div className="result" key={String(row.id)}><b>{String(row.subject)} {String(row.predicate)}</b><div className="meta">{String(row.id)} / review {String(row.review_after ?? "none")} / valid until {String(row.valid_until ?? "current")}</div><p>{String(row.object)}</p></div>)}</div></div></section>;
}

function QualityDashboard({ dashboard }: { dashboard: Record<string, any> }): React.ReactElement {
  const counts = dashboard.counts ?? {};
  const metrics = [
    ["Sources", counts.sources],
    ["Sections", counts.sections],
    ["Facts", counts.activeFacts],
    ["Failures", counts.failures],
    ["Pending", counts.pendingProposals],
    ["Clean", counts.cleanProposals],
    ["Warnings", counts.warningProposals],
    ["Stale", counts.staleFacts]
  ];
  return <div className="qualityDashboard"><div className="metricGrid">{metrics.map(([label, value]) => <div className="metric" key={String(label)}><b>{String(value ?? 0)}</b><span>{label}</span></div>)}</div><div className="viewCard"><h3>Top Noisy Imports</h3>{(dashboard.topNoisyImports ?? []).length === 0 ? <div className="meta">No noisy pending imports.</div> : dashboard.topNoisyImports.map((row: Record<string, unknown>) => <div className="result" key={String(row.id)}><b>{String(row.summary)}</b><div className="meta">{String(row.warningCount)} warnings / {String(row.blockedCount)} blocked</div></div>)}</div></div>;
}

function QualityBlock({ title: titleText, rows = [], openRecord, toast, refresh }: { title: string; rows?: Array<Record<string, unknown>>; openRecord: (id: string) => Promise<void>; toast: (message: string, type?: Toast["type"]) => void; refresh: () => Promise<void> }): React.ReactElement {
  return <div className="viewCard"><h3>{titleText}</h3>{rows.length === 0 ? <div className="meta">None.</div> : rows.map((row, index) => {
    const values = row.values as Array<{ factId: string; object: string; confidence: number }> | undefined;
    if (Array.isArray(values) && values.length > 0) {
      const allIds = values.map((value) => value.factId);
      return <div className="result" key={index}><b>{String(row.key)}</b><div className="compareGrid">{values.map((value) => <div className="compareCell" key={value.factId}><div className="meta">{value.factId} / confidence {Number(value.confidence ?? 0).toFixed(2)}</div><p>{value.object}</p><button onClick={() => openRecord(value.factId)}>Open</button><button onClick={() => apiClient.api("/api/governor/resolve", { method: "POST", body: JSON.stringify({ action: "merge", winnerId: value.factId, loserIds: allIds.filter((id) => id !== value.factId) }) }).then(refresh).then(() => toast("Merged facts")).catch((error) => toast(error.message, "error"))}>Use this</button></div>)}</div><button onClick={() => apiClient.api("/api/governor/resolve", { method: "POST", body: JSON.stringify({ action: "keep_both", factIds: allIds }) }).then(refresh).then(() => toast("Kept both facts")).catch((error) => toast(error.message, "error"))}>Keep both</button><button onClick={() => apiClient.api("/api/governor/resolve", { method: "POST", body: JSON.stringify({ action: "review_later", factIds: allIds }) }).then(refresh).then(() => toast("Review scheduled")).catch((error) => toast(error.message, "error"))}>Review later</button></div>;
    }
    const factId = String(row.factId ?? "");
    return <div className="result" key={index}><pre>{JSON.stringify(row, null, 2)}</pre><button disabled={!factId} onClick={() => openRecord(factId)}>Open</button><button disabled={!factId} onClick={() => apiClient.api("/api/governor/resolve", { method: "POST", body: JSON.stringify({ action: "mark_stale", factIds: [factId].filter(Boolean) }) }).then(refresh).then(() => toast("Marked stale")).catch((error) => toast(error.message, "error"))}>Mark stale</button><button disabled={!factId} onClick={() => apiClient.api("/api/governor/resolve", { method: "POST", body: JSON.stringify({ action: "review_later", factIds: [factId].filter(Boolean) }) }).then(refresh).then(() => toast("Review scheduled")).catch((error) => toast(error.message, "error"))}>Review later</button></div>;
  })}</div>;
}

function SettingsView({ auth, setAuth, toast }: { auth: AuthSettings | null; setAuth: (auth: AuthSettings) => void; toast: (message: string, type?: Toast["type"]) => void }): React.ReactElement {
  const [reports, setReports] = useState<Array<Record<string, unknown>>>([]);
  const [mode, setMode] = useState<AuthSettings["mode"]>("local");
  const [displayName, setDisplayName] = useState("Local NeuraKeep User");
  const [role, setRole] = useState<AuthSettings["user"]["role"]>("owner");
  const [allowWrites, setAllowWrites] = useState(true);
  const [ocrHealth, setOcrHealth] = useState<Record<string, any> | null>(null);
  const [integration, setIntegration] = useState<Record<string, any> | null>(null);
  const [dailyLoop, setDailyLoop] = useState<Record<string, any> | null>(null);
  useEffect(() => { apiClient.api<{ reports: Array<Record<string, unknown>> }>("/api/extraction/reports").then((data) => setReports(data.reports)).catch(() => null); }, []);
  useEffect(() => { apiClient.api<Record<string, any>>("/api/import/ocr-health").then(setOcrHealth).catch(() => null); }, []);
  useEffect(() => { apiClient.api<Record<string, any>>("/api/integrations/status").then(setIntegration).catch(() => null); }, []);
  useEffect(() => { apiClient.api<Record<string, any>>("/api/workflow/daily-loop").then(setDailyLoop).catch(() => null); }, []);
  useEffect(() => {
    if (!auth) return;
    setMode(auth.mode);
    setDisplayName(auth.user.displayName);
    setRole(auth.user.role);
    setAllowWrites(auth.user.allowWrites);
  }, [auth]);
  const save = async (): Promise<void> => {
    const next = await apiClient.api<AuthSettings>("/api/auth/settings", {
      method: "POST",
      body: JSON.stringify({ mode, user: { displayName, role, allowWrites } })
    });
    setAuth(next);
    toast("Auth settings saved");
  };
  const runDailyLoop = async (): Promise<void> => {
    const result = await apiClient.api<Record<string, any>>("/api/workflow/daily-loop", {
      method: "POST",
      body: JSON.stringify({ queueSummary: true, reason: "session-close" })
    });
    setDailyLoop(result.status ?? result);
    toast("Daily workflow queued summary and synced workspace memory");
  };
  return <section className="viewSurface"><h2>Settings</h2><div className="viewGrid"><div className="viewCard"><h3>Auth / User</h3><div className="chips"><span>{auth?.provider ?? "local"}</span><span>{auth?.readOnly ? "read-only" : "read-write"}</span><span>{auth?.tokenRequired ? "token required" : "local open"}</span></div><label>Bearer token<input defaultValue={apiClient.getToken()} onChange={(event) => apiClient.setToken(event.target.value)} /></label><label>Mode<select value={mode} onChange={(event) => setMode(event.target.value as AuthSettings["mode"])}><option value="local">local</option><option value="remote">remote</option></select></label><label>Display name<input value={displayName} onChange={(event) => setDisplayName(event.target.value)} /></label><label>Role<select value={role} onChange={(event) => setRole(event.target.value as AuthSettings["user"]["role"])}><option value="owner">owner</option><option value="operator">operator</option><option value="viewer">viewer</option></select></label><label className="check"><input type="checkbox" checked={allowWrites} onChange={(event) => setAllowWrites(event.target.checked)} />Allow writes when server is read-write</label><button onClick={() => save().catch((error) => toast(error.message, "error"))}>Save auth settings</button><button onClick={() => authSettings().then(setAuth).then(() => toast("Auth settings refreshed")).catch((error) => toast(error.message, "error"))}>Refresh auth</button><pre>{JSON.stringify(auth, null, 2)}</pre></div><IntegrationStatusCard status={integration} /><DailyLoopCard status={dailyLoop} run={() => runDailyLoop().catch((error) => toast(error.message, "error"))} /><OcrHealthCard health={ocrHealth} /><div className="viewCard"><h3>Extraction Eval Reports</h3>{reports.length === 0 && <div className="meta">No extraction eval reports yet.</div>}{reports.map((row) => <div className="result" key={String(row.id)}><b>{String(row.proposalId)}</b><pre>{JSON.stringify(row.score, null, 2)}</pre></div>)}</div></div></section>;
}

function IntegrationStatusCard({ status }: { status: Record<string, any> | null }): React.ReactElement {
  const clients = status?.clients ?? [];
  return <div className="viewCard"><h3>Client Integrations</h3><div className="chips"><span>{status?.server?.mode ?? "loading"}</span><span>{status?.tools?.length ?? 0} tools</span><span>{status?.server?.tokenRequired ? "token required" : "local open"}</span></div>{clients.map((client: Record<string, unknown>) => <div className="result" key={String(client.name)}><b>{String(client.name)}</b><div className="meta">{client.configured === null ? String(client.note) : client.configured ? "Configured" : "Not configured"}{client.configPath ? ` / ${String(client.configPath)}` : ""}</div></div>)}<pre>{JSON.stringify(status?.smokeTests ?? [], null, 2)}</pre></div>;
}

function DailyLoopCard({ status, run }: { status: Record<string, any> | null; run: () => void }): React.ReactElement {
  const actions = status?.recommendedActions ?? [];
  const counts = status?.quality?.counts ?? {};
  return <div className="viewCard"><h3>Daily Workflow Loop</h3><div className="chips"><span>{counts.pendingProposals ?? 0} pending</span><span>{counts.warningProposals ?? 0} warnings</span><span>{counts.fuzzyDuplicateFactGroups ?? 0} fuzzy groups</span></div><div className="meta">Queues a session-close summary and syncs workspace memory as proposals. Durable memory remains review-first.</div>{actions.map((action: string) => <div className="result" key={action}>{action}</div>)}<button onClick={run}>Queue daily summary</button></div>;
}

function SearchResults({ results, guidance, openRecord, focusNode }: { results: SearchResult[]; guidance?: RetrievalGuidance; openRecord: (id: string) => Promise<void>; focusNode: (id: string) => void }): React.ReactElement {
  return <div><RetrievalGuidancePanel guidance={guidance} />{results.length === 0 ? <div className="result">No results.</div> : results.map((row) => <div key={row.id} className="result clickable" onClick={() => void openRecord(row.id)}><b>{row.heading ?? row.sourceTitle ?? row.id}</b><div className="meta">{row.id} / score {Number(row.score ?? 0).toFixed(2)}</div><p>{row.snippet}</p><button onClick={(event) => { event.stopPropagation(); focusNode(row.id); }}>Focus graph</button>{row.relatedFailures?.map((failure) => <div className="warn" key={failure.id}><b>Known failed path</b><p>{failure.doNotRepeat}</p></div>)}</div>)}</div>;
}

function RetrievalGuidancePanel({ guidance }: { guidance?: RetrievalGuidance }): React.ReactElement {
  if (!guidance) return <></>;
  return <div className="guidancePanel"><div className="chips"><span>confidence: {guidance.confidence}</span><span>{guidance.resultCount} results</span><span>{guidance.citationCount} citations</span><span>{guidance.relatedFailureCount} failure warnings</span></div><div className="meta">{guidance.recommendedNextStep}</div>{guidance.doNotRepeat.length > 0 && <div className="warn"><b>Do not repeat</b>{guidance.doNotRepeat.map((item) => <p key={item}>{item}</p>)}</div>}</div>;
}

function RecordView({ record, focusNode, openRecord }: { record?: MemoryRecord; focusNode: (id: string) => void; openRecord: (id: string) => Promise<void> }): React.ReactElement {
  if (!record) return <div className="warn">No record found.</div>;
  const text = recordText(record);
  const citations = parseArray(record.source_ids_json).concat(parseArray(record.section_ids_json));
  return <div className="record"><div className="chips"><span>{record.recordType}</span><button onClick={() => focusNode(record.id)}>Focus graph</button></div><Markdown text={text} /><CitationButtons ids={citations} openRecord={openRecord} /></div>;
}

function CitationButtons({ ids, openRecord }: { ids: string[]; openRecord: (id: string) => Promise<void> }): React.ReactElement {
  const uniqueIds = Array.from(new Set(ids.filter(Boolean)));
  if (uniqueIds.length === 0) return <></>;
  return <div className="chips">{uniqueIds.map((id) => <button className="linkChip" key={id} onClick={() => void openRecord(id)}>{id}</button>)}</div>;
}

function Modal({ title: titleText, close, children }: { title: string; close: () => void; children: React.ReactNode }): React.ReactElement {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [close]);
  return <div className="modalBackdrop open" role="dialog" aria-modal="true"><div className="modal"><div className="modalHeader"><h2>{titleText}</h2><button aria-label="Close modal" onClick={close}>Close</button></div><div className="modalBody">{children}</div></div></div>;
}

function RailSection({ title: titleText, children }: { title: string; children: React.ReactNode }): React.ReactElement {
  return <section className="menuSection visible"><h2>{titleText}</h2>{children}</section>;
}

function PinnedSearchButtons({ apply }: { apply: (preset: typeof pinnedSearchPresets[number]) => void }): React.ReactElement {
  return <div className="pinnedSearches"><h2>Pinned</h2>{pinnedSearchPresets.map((preset) => <button key={preset.name} onClick={() => apply(preset)}>{preset.name}</button>)}</div>;
}

function EdgeControls({ state, setGraph }: { state: GraphState; setGraph: React.Dispatch<React.SetStateAction<GraphPayload>> }): React.ReactElement {
  const selected = new Set(state.edgeTypes ?? ["root", "contains", "cites", "next"]);
  return <div className="edgeFilters">{(["root", "contains", "cites", "next"] as const).map((edge) => <label key={edge}><input type="checkbox" checked={selected.has(edge)} onChange={(event) => setGraph((current) => ({ ...current, state: { ...current.state, edgeTypes: toggleInSet(selected, edge, event.target.checked) } }))} />{edge}</label>)}</div>;
}

function PhysicsControls({ state, setGraph }: { state: GraphState; setGraph: React.Dispatch<React.SetStateAction<GraphPayload>> }): React.ReactElement {
  const physics: PhysicsSettings = { ...defaultPhysics, ...(state.physics ?? {}) };
  const set = (key: keyof PhysicsSettings, value: number) => setGraph((current) => ({ ...current, state: { ...current.state, physics: { ...physics, [key]: value } } }));
  return <div className="physics"><label>Repel<input type="range" min="600" max="3200" value={physics.repulsion} onChange={(event) => set("repulsion", Number(event.target.value))} /></label><label>Links<input type="range" min="80" max="260" value={physics.linkDistance} onChange={(event) => set("linkDistance", Number(event.target.value))} /></label></div>;
}

function graphModeIds(graph: GraphPayload, mode: string, selectedId: string, focusIds: Set<string> | null): Set<string> | null {
  if (mode === "focused") {
    if (focusIds) return focusIds;
    if (!selectedId) return null;
    const ids = new Set<string>([selectedId]);
    graph.edges.forEach((edge) => {
      if (edge.from === selectedId) ids.add(edge.to);
      if (edge.to === selectedId) ids.add(edge.from);
    });
    return ids;
  }
  if (mode === "all") return null;
  const ids = new Set<string>();
  const addNeighbors = () => graph.edges.forEach((edge) => { if (ids.has(edge.from)) ids.add(edge.to); if (ids.has(edge.to)) ids.add(edge.from); });
  if (mode === "source") graph.nodes.filter((node) => node.type === "root" || node.type === "source" || node.id === selectedId).forEach((node) => ids.add(node.id));
  if (mode === "failures") graph.nodes.filter((node) => node.type === "failure").forEach((node) => ids.add(node.id));
  if (mode === "decisions") graph.nodes.filter((node) => node.type === "event" && /decision|decided|direction/i.test(node.label)).forEach((node) => ids.add(node.id));
  addNeighbors();
  return ids;
}

function mergeGraphPayload(current: GraphPayload, incoming: GraphPayload): GraphPayload {
  const nodes = new Map<string, GraphNode>();
  const edges = new Map<string, GraphEdge>();
  for (const node of current.nodes) nodes.set(node.id, node);
  for (const node of incoming.nodes) nodes.set(node.id, node);
  for (const edge of current.edges) edges.set(`${edge.from}->${edge.to}:${edge.type}`, edge);
  for (const edge of incoming.edges) edges.set(`${edge.from}->${edge.to}:${edge.type}`, edge);
  return {
    nodes: Array.from(nodes.values()),
    edges: Array.from(edges.values()),
    hiddenNeighbors: { ...(current.hiddenNeighbors ?? {}), ...(incoming.hiddenNeighbors ?? {}) },
    state: { ...(current.state ?? {}), mode: "all", collapsedBranches: current.state?.collapsedBranches ?? [] },
    meta: {
      ...(incoming.meta ?? current.meta ?? {
        totalNodes: nodes.size,
        totalEdges: edges.size,
        visibleNodes: nodes.size,
        visibleEdges: edges.size,
        focusId: null,
        depth: 1,
        limit: nodes.size,
        truncated: false
      }),
      visibleNodes: nodes.size,
      visibleEdges: edges.size
    }
  };
}

function branchHiddenIds(graph: GraphPayload, roots: string[]): Set<string> {
  const hidden = new Set<string>();
  const adjacency = new Map<string, string[]>();
  for (const edge of graph.edges) {
    adjacency.set(edge.from, [...(adjacency.get(edge.from) ?? []), edge.to]);
    adjacency.set(edge.to, [...(adjacency.get(edge.to) ?? []), edge.from]);
  }
  const distances = graphRootDistances(graph, adjacency);
  for (const root of roots) {
    const rootDistance = distances.get(root) ?? 0;
    const queue = (adjacency.get(root) ?? [])
      .filter((id) => (distances.get(id) ?? Number.MAX_SAFE_INTEGER) > rootDistance)
      .map((id) => ({ id, parent: root }));
    const visited = new Set<string>([root]);
    while (queue.length > 0) {
      const item = queue.shift()!;
      if (visited.has(item.id)) continue;
      visited.add(item.id);
      const node = graph.nodes.find((candidate) => candidate.id === item.id);
      if (!node || node.type === "root") continue;
      hidden.add(item.id);
      const distance = distances.get(item.id) ?? Number.MAX_SAFE_INTEGER;
      for (const next of adjacency.get(item.id) ?? []) {
        if (next === item.parent) continue;
        if ((distances.get(next) ?? Number.MAX_SAFE_INTEGER) >= distance) {
          queue.push({ id: next, parent: item.id });
        }
      }
    }
  }
  return hidden;
}

function hiddenNeighborCounts(graph: GraphPayload, visibleIds: Set<string>): Map<string, number> {
  const counts = new Map<string, number>();
  for (const [id, count] of Object.entries(graph.hiddenNeighbors ?? {})) {
    if (visibleIds.has(id) && count > 0) counts.set(id, count);
  }
  for (const edge of graph.edges) {
    if (visibleIds.has(edge.from) && !visibleIds.has(edge.to)) counts.set(edge.from, (counts.get(edge.from) ?? 0) + 1);
    if (visibleIds.has(edge.to) && !visibleIds.has(edge.from)) counts.set(edge.to, (counts.get(edge.to) ?? 0) + 1);
  }
  return counts;
}

function graphBreadcrumb(graph: GraphPayload, selectedId: string): GraphNode[] {
  if (!selectedId) return [];
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
  if (!nodeById.has(selectedId)) return [];
  const adjacency = new Map<string, string[]>();
  for (const edge of graph.edges) {
    adjacency.set(edge.from, [...(adjacency.get(edge.from) ?? []), edge.to]);
    adjacency.set(edge.to, [...(adjacency.get(edge.to) ?? []), edge.from]);
  }
  const parent = new Map<string, string | null>([["root:neurakeep", null]]);
  const queue = ["root:neurakeep"];
  while (queue.length > 0 && !parent.has(selectedId)) {
    const id = queue.shift()!;
    for (const next of adjacency.get(id) ?? []) {
      if (parent.has(next)) continue;
      parent.set(next, id);
      queue.push(next);
    }
  }
  if (!parent.has(selectedId)) return [nodeById.get(selectedId)!];
  const path: GraphNode[] = [];
  let cursor: string | null = selectedId;
  while (cursor) {
    const node = nodeById.get(cursor);
    if (node) path.unshift(node);
    cursor = parent.get(cursor) ?? null;
  }
  return path.slice(0, 5);
}

function graphRootDistances(graph: GraphPayload, adjacency: Map<string, string[]>): Map<string, number> {
  const distances = new Map<string, number>();
  const queue = ["root:neurakeep"];
  distances.set("root:neurakeep", 0);
  while (queue.length > 0) {
    const id = queue.shift()!;
    const distance = distances.get(id) ?? 0;
    for (const next of adjacency.get(id) ?? []) {
      if (distances.has(next)) continue;
      distances.set(next, distance + 1);
      queue.push(next);
    }
  }
  for (const node of graph.nodes) {
    if (!distances.has(node.id)) distances.set(node.id, Number.MAX_SAFE_INTEGER);
  }
  return distances;
}

function togglePin(id: string, graph: GraphPayload, setGraph: React.Dispatch<React.SetStateAction<GraphPayload>>, save: (state: GraphState) => Promise<void>, toast: (message: string) => void): void {
  const pinned = new Set(graph.state.pinned ?? []);
  if (pinned.has(id)) pinned.delete(id); else pinned.add(id);
  const state = { ...graph.state, pinned: Array.from(pinned) };
  setGraph((current) => ({ ...current, state }));
  void save(state).then(() => toast(pinned.has(id) ? "Node pinned" : "Node unpinned"));
}

function toggleCollapse(id: string, graph: GraphPayload, setGraph: React.Dispatch<React.SetStateAction<GraphPayload>>, save: (state: GraphState) => Promise<void>, toast: (message: string) => void): void {
  const collapsed = new Set(graph.state.collapsed ?? []);
  if (collapsed.has(id)) collapsed.delete(id); else collapsed.add(id);
  const state = { ...graph.state, collapsed: Array.from(collapsed) };
  setGraph((current) => ({ ...current, state }));
  void save(state).then(() => toast(collapsed.has(id) ? "Node collapsed" : "Node expanded"));
}

function selectedMap(diff: ProposalDiff, value: boolean): Record<string, boolean> {
  const map: Record<string, boolean> = {};
  (["events", "facts", "failures"] as Array<keyof ProposalDiff>).forEach((kind) => diff[kind].forEach((_, index) => { map[`${kind}:${index}`] = value; }));
  return map;
}

function cleanSelected(diff: ProposalDiff, warnings: Array<{ itemType: string; itemId: string }>): Record<string, boolean> {
  const map = selectedMap(diff, true);
  const blocked = new Set(warnings.map((warning) => warning.itemId));
  (["events", "facts", "failures"] as Array<keyof ProposalDiff>).forEach((kind) => diff[kind].forEach((item, index) => { if (blocked.has(item.id ?? "")) map[`${kind}:${index}`] = false; }));
  return map;
}

function filterDiff(diff: ProposalDiff, selected: Record<string, boolean>): ProposalDiff {
  return {
    events: diff.events.filter((_, index) => selected[`events:${index}`]),
    facts: diff.facts.filter((_, index) => selected[`facts:${index}`]),
    failures: diff.failures.filter((_, index) => selected[`failures:${index}`])
  };
}

function countItems(diff: ProposalDiff): number {
  return diff.events.length + diff.facts.length + diff.failures.length;
}

function toggleInSet(set: Set<string>, value: string, checked: boolean): string[] {
  const next = new Set(set);
  if (checked) next.add(value); else next.delete(value);
  return Array.from(next);
}

function recordTitle(record: MemoryRecord | undefined, fallback: string): string {
  return record?.title ?? record?.heading ?? record?.summary ?? record?.subject ?? record?.attempted ?? fallback;
}

function recordText(record: MemoryRecord): string {
  if (record.recordType === "source" && Array.isArray(record.sections)) {
    return record.sections.map((section) => `${section.heading ? `# ${section.heading}\n\n` : ""}${section.body ?? ""}`).join("\n\n---\n\n");
  }
  if (record.recordType === "section") return record.body ?? "";
  if (record.recordType === "fact") return [record.subject, record.predicate, record.object].filter(Boolean).join(" ");
  if (record.recordType === "failure") return `Attempted: ${record.attempted ?? ""}\nFailed because: ${record.failed_because ?? ""}\nDo not repeat: ${record.do_not_repeat ?? ""}`;
  return record.summary ?? JSON.stringify(record, null, 2);
}

function parseArray(value: unknown): string[] {
  try {
    const parsed = JSON.parse(String(value ?? "[]")) as unknown;
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const value = String(reader.result ?? "");
      resolve(value.includes(",") ? value.slice(value.indexOf(",") + 1) : value);
    };
    reader.onerror = () => reject(reader.error ?? new Error("File read failed"));
    reader.readAsDataURL(file);
  });
}

function title(value: string): string {
  return value.slice(0, 1).toUpperCase() + value.slice(1);
}

function routeFromHash(): RouteName {
  const route = window.location.hash.replace(/^#/, "");
  if (route === "props") return "proposals";
  return ["graph", "search", "inbox", "proposals", "quality", "settings"].includes(route) ? route as RouteName : "graph";
}

interface SearchResult {
  id: string;
  heading?: string;
  sourceTitle?: string;
  score?: number;
  snippet?: string;
  relatedFailures?: Array<{ id: string; doNotRepeat: string }>;
}

interface RetrievalGuidance {
  confidence: string;
  resultCount: number;
  citationCount: number;
  relatedFailureCount: number;
  doNotRepeat: string[];
  recommendedNextStep: string;
}

type MemoryRecord = Record<string, any>;

interface SearchFilters {
  dateFrom: string;
  dateTo: string;
  project: string;
  sensitivity: string;
  sourceOrigin: string;
  memoryType: string;
  failuresOnly: boolean;
}

createRoot(document.getElementById("root")!).render(<App />);
