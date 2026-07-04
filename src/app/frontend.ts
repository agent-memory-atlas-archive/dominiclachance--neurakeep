export function appHtml(): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>NeuraKeep</title>
  <link rel="stylesheet" href="app-shell.css" />
  <style>
    :root { color-scheme: dark; font-family: Inter, ui-sans-serif, system-ui, sans-serif; background: #111315; color: #f4f1ea; }
    html, body { height: 100%; overflow: hidden; }
    body { margin: 0; display: grid; grid-template-columns: 300px minmax(0, 1fr); height: 100vh; }
    aside { border-right: 1px solid #33383d; padding: 10px; overflow: hidden; background: #171a1d; font-size: 12px; }
    main { display: grid; grid-template-rows: auto minmax(0, 1fr); min-width: 0; height: 100vh; min-height: 0; }
    h1 { font-size: 18px; margin: 0 0 5px; }
    h2 { font-size: 11px; text-transform: uppercase; letter-spacing: 0; color: #9fb1c1; margin: 8px 0 4px; }
    h3 { font-size: 14px; margin: 0 0 7px; }
    label { font-size: 11px; color: #c7d0d9; }
    select, input, button { width: 100%; box-sizing: border-box; background: #22272b; border: 1px solid #3c434a; color: #f4f1ea; padding: 5px 7px; margin: 3px 0 5px; border-radius: 5px; font-size: 12px; min-height: 28px; }
    button { cursor: pointer; background: #2f6f5e; border-color: #4b9f88; font-weight: 650; }
    button:disabled { opacity: .42; cursor: not-allowed; filter: grayscale(.35); }
    button.secondary { background: #2b3035; border-color: #454d55; }
    button.small { min-width: 42px; width: auto; margin: 0; padding: 8px 10px; }
    .toolbar { display: grid; grid-template-columns: 1fr 112px 112px; gap: 8px; padding: 9px 10px; border-bottom: 1px solid #30363b; background: #15181b; }
    .panel { min-height: 0; overflow: hidden; }
    .viewPanel { display: none; height: 100%; min-height: 0; overflow: hidden; }
    body[data-route="graph"] #graphView,
    body[data-route="search"] #searchView,
    body[data-route="inbox"] #inboxView,
    body[data-route="proposals"] #proposalsView,
    body[data-route="quality"] #qualityView,
    body[data-route="settings"] #settingsView { display: block; }
    .viewSurface { height: 100%; min-height: 0; overflow: auto; padding: 12px; box-sizing: border-box; background: #101214; }
    .viewSurface h2 { margin-top: 0; }
    .viewGrid { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 10px; }
    .viewCard { border: 1px solid #30363b; border-radius: 7px; background: #171a1d; padding: 10px; }
    .viewTable { width: 100%; border-collapse: collapse; font-size: 12px; }
    .viewTable th, .viewTable td { border-bottom: 1px solid #30363b; padding: 7px; vertical-align: top; text-align: left; }
    .viewTable th { color: #9fb1c1; }
    .meta { color: #a8b0b8; font-size: 12px; line-height: 1.35; }
    .item { border-top: 1px solid #30363b; padding: 6px 0; font-size: 11px; }
    .record { border-top: 1px solid #30363b; padding: 12px 0; font-size: 13px; line-height: 1.45; }
    .record pre { margin: 10px 0 0; white-space: pre-wrap; word-break: break-word; background: #111417; border: 1px solid #2f363d; border-radius: 6px; padding: 10px; max-height: 42vh; overflow: auto; }
    .markdown { margin-top: 12px; max-height: 52vh; overflow: auto; padding: 14px; background: #111417; border: 1px solid #2f363d; border-radius: 6px; color: #dbe3ea; }
    .markdown h1, .markdown h2, .markdown h3 { color: #f4f1ea; text-transform: none; letter-spacing: 0; margin: 18px 0 8px; }
    .markdown h1 { font-size: 24px; border-bottom: 1px solid #30363b; padding-bottom: 8px; }
    .markdown h2 { font-size: 18px; color: #f4f1ea; }
    .markdown h3 { font-size: 15px; }
    .markdown p { margin: 9px 0; }
    .markdown ul, .markdown ol { margin: 9px 0 9px 22px; padding: 0; }
    .markdown li { margin: 5px 0; }
    .markdown code { background: #22272b; border: 1px solid #30363b; border-radius: 4px; padding: 1px 4px; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 12px; }
    .markdown pre code { display: block; padding: 10px; overflow: auto; border-radius: 6px; }
    .markdown blockquote { margin: 10px 0; padding-left: 12px; border-left: 3px solid #4b9f88; color: #b8c8d6; }
    .markdown a { color: #8ed9ff; }
    .kv { display: grid; grid-template-columns: 92px minmax(0, 1fr); gap: 6px; margin: 5px 0; color: #c7d0d9; }
    .kv span:first-child { color: #83919d; }
    .chips { display: flex; flex-wrap: wrap; gap: 6px; margin: 8px 0; }
    .chip { border: 1px solid #3c434a; border-radius: 999px; color: #c7d0d9; padding: 3px 8px; font-size: 12px; }
    .linkChip { border: 1px solid #4b9f88; border-radius: 999px; color: #d8fff3; background: #17352f; padding: 3px 8px; font-size: 12px; width: auto; margin: 0; }
    .inlineLink { display: inline; width: auto; margin: 0; padding: 0; border: 0; border-radius: 0; background: transparent; color: #8ed9ff; font: inherit; text-align: left; text-decoration: underline; }
    .result { padding: 12px 14px; border-bottom: 1px solid #30363b; }
    .result.clickable { cursor: pointer; }
    .result.clickable:hover { background: #171d22; }
    .result b { display: block; margin-bottom: 6px; }
    .warn { border-left: 3px solid #ff6b6b; padding-left: 9px; margin-top: 8px; color: #ffd3d3; }
    .routes { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4px; margin: 7px 0; }
    .routes button { margin: 0; padding: 5px 4px; font-size: 11px; min-height: 26px; background: #22272b; border-color: #3c434a; }
    .routes button.active { background: #2f6f5e; border-color: #4b9f88; }
    .menuSection { display: none; border-top: 1px solid #30363b; padding-top: 6px; margin-top: 6px; }
    body[data-route="graph"] .graphMenu,
    body[data-route="search"] .searchMenu,
    body[data-route="proposals"] .proposalMenu,
    body[data-route="inbox"] .inboxMenu,
    body[data-route="quality"] .qualityMenu,
    body[data-route="settings"] .settingsMenu { display: block; }
    .compactGrid { display: grid; grid-template-columns: 1fr 1fr; gap: 5px; }
    .compactGrid button { margin: 0; }
    .railHint { margin: 4px 0; font-size: 11px; }
    .proposalTools { display: flex; gap: 8px; flex-wrap: wrap; margin: 10px 0; }
    .proposalTools button { width: auto; margin: 0; }
    .proposalTable { width: 100%; border-collapse: collapse; margin: 8px 0 14px; font-size: 12px; }
    .proposalTable th, .proposalTable td { border-bottom: 1px solid #30363b; padding: 7px; vertical-align: top; text-align: left; }
    .proposalTable th { color: #9fb1c1; font-weight: 700; }
    .proposalTable input, .proposalTable textarea { margin: 0; width: 100%; }
    .proposalTable textarea { min-height: 62px; background: #111417; color: #f4f1ea; border: 1px solid #30363b; border-radius: 6px; padding: 7px; }
    .proposalTable input[type="checkbox"] { width: auto; }
    .proposalTable input[type="range"] { min-width: 90px; }
    .proposalWarn { color: #ffd3d3; font-size: 11px; margin-top: 5px; }
    .split { display: grid; grid-template-columns: minmax(0, 1fr); }
    .graphWrap { position: relative; height: 100%; background: #101214; }
    .graphControls { position: absolute; top: 12px; right: 12px; display: flex; gap: 8px; align-items: center; background: rgba(16, 18, 20, .88); border: 1px solid #30363b; border-radius: 8px; padding: 8px; z-index: 3; }
    .graphControls .meta { min-width: 52px; text-align: center; }
    .graphInfoPanel { position: absolute; left: 12px; bottom: 12px; width: min(340px, calc(100% - 24px)); max-height: 34vh; overflow: hidden; background: rgba(16, 18, 20, .9); border: 1px solid #30363b; border-radius: 8px; padding: 10px; z-index: 3; }
    .legendGrid { display: grid; grid-template-columns: repeat(5, auto); gap: 6px 10px; margin-bottom: 8px; align-items: center; }
    .legendItem { display: flex; align-items: center; gap: 7px; color: #c7d0d9; font-size: 12px; }
    .dot { width: 9px; height: 9px; border-radius: 50%; border: 1px solid #f4f1ea; display: inline-block; }
    .selectedSummary { border-top: 1px solid #30363b; padding-top: 8px; max-height: 12vh; overflow: hidden; }
    .lasso { fill: rgba(142, 217, 255, .1); stroke: #8ed9ff; stroke-dasharray: 4 4; pointer-events: none; }
    svg { width: 100%; height: 100%; min-height: 0; display: block; cursor: grab; }
    svg.dragging { cursor: grabbing; }
    line { stroke: #49515a; stroke-opacity: .55; }
    circle { stroke: #f4f1ea; stroke-width: 1; cursor: pointer; }
    circle.hit { fill: transparent; stroke: transparent; pointer-events: all; }
    g.node.selected circle { stroke: #ffffff; stroke-width: 3; filter: drop-shadow(0 0 8px rgba(255,255,255,.45)); }
    g.node.selected circle.hit { stroke: transparent; filter: none; }
    text { fill: #f4f1ea; font-size: 11px; pointer-events: none; }
    .modalBackdrop { position: fixed; inset: 0; display: none; align-items: center; justify-content: center; z-index: 50; background: rgba(5, 7, 9, .72); padding: 22px; }
    .modalBackdrop.open { display: flex; }
    .modal { width: min(920px, 100%); max-height: min(82vh, 860px); overflow: hidden; border: 1px solid #3b444c; border-radius: 8px; background: #171a1d; box-shadow: 0 24px 80px rgba(0,0,0,.45); display: grid; grid-template-rows: auto minmax(0, 1fr); }
    .modalHeader { display: flex; gap: 12px; align-items: center; justify-content: space-between; border-bottom: 1px solid #30363b; padding: 14px 16px; background: #1d2226; }
    .modalHeader h2 { margin: 0; color: #f4f1ea; text-transform: none; font-size: 16px; }
    .modalBody { overflow: auto; padding: 0 16px 16px; }
    .modalClose { width: auto; margin: 0; padding: 7px 10px; }
    .toastStack { position: fixed; right: 14px; bottom: 14px; display: grid; gap: 8px; z-index: 60; width: min(360px, calc(100vw - 28px)); }
    .toast { border: 1px solid #3c434a; border-left: 4px solid #4b9f88; background: #171a1d; color: #f4f1ea; border-radius: 7px; padding: 9px 10px; box-shadow: 0 12px 30px rgba(0,0,0,.28); font-size: 12px; }
    .toast.error { border-left-color: #ff6b6b; }
    .citationPreview { position: fixed; display: none; z-index: 35; width: min(360px, calc(100vw - 24px)); max-height: 320px; overflow: hidden; border: 1px solid #3b444c; border-radius: 8px; background: #171a1d; box-shadow: 0 18px 60px rgba(0,0,0,.45); padding: 10px; font-size: 12px; }
    .citationPreview.open { display: block; }
    .edgeFilters { display: flex; gap: 6px; flex-wrap: wrap; margin: 5px 0; }
    .edgeFilters label { display: inline-flex; align-items: center; gap: 4px; border: 1px solid #30363b; border-radius: 999px; padding: 3px 7px; }
    .edgeFilters input { width: auto; min-height: 0; margin: 0; }
    @media (max-width: 860px) { body { grid-template-columns: 1fr; grid-template-rows: 210px minmax(0, 1fr); } main { height: auto; min-height: 0; } aside { max-height: 210px; border-right: 0; border-bottom: 1px solid #33383d; } .toolbar { grid-template-columns: 1fr 82px 82px; } }
  </style>
</head>
<body data-route="graph">
  <aside>
    <h1>NeuraKeep</h1>
    <div class="routes" id="routes">
      <button data-route="graph">Graph</button>
      <button data-route="search">Search</button>
      <button data-route="inbox">Inbox</button>
      <button data-route="proposals">Props</button>
      <button data-route="quality">Quality</button>
      <button data-route="settings">Settings</button>
    </div>
    <section class="menuSection graphMenu">
      <h2>Graph</h2>
      <input id="q" placeholder="Filter graph nodes" />
      <div class="compactGrid">
        <select id="type" title="Node type">
          <option value="">All types</option>
          <option>source</option><option>section</option><option>event</option><option>fact</option><option>failure</option>
        </select>
        <select id="graphMode" title="Graph mode">
          <option value="all">All</option>
          <option value="focused">Focused</option>
          <option value="source">Sources</option>
          <option value="failures">Failures</option>
          <option value="decisions">Decisions</option>
        </select>
      </div>
      <select id="clusterBy" title="Cluster by">
        <option value="type">Cluster by type</option>
        <option value="space">Cluster by space</option>
        <option value="trust">Cluster by trust</option>
        <option value="sensitivity">Cluster by sensitivity</option>
      </select>
      <div class="edgeFilters" title="Relationship filters">
        <label><input type="checkbox" class="edgeType" value="contains" checked>contains</label>
        <label><input type="checkbox" class="edgeType" value="cites" checked>cites</label>
        <label><input type="checkbox" class="edgeType" value="next" checked>next</label>
      </div>
      <div class="compactGrid">
        <button class="secondary" id="refresh" title="Reload graph from NeuraKeep">Refresh</button>
        <button class="secondary" id="saveGraphState" title="Save layout, pins, collapsed nodes, and graph filters">Save</button>
        <button class="secondary" id="pinSelected" title="Pin or unpin the selected node" disabled>Pin</button>
        <button class="secondary" id="collapseSelected" title="Collapse or expand the selected node" disabled>Collapse</button>
      </div>
      <div class="meta railHint" id="stats"></div>
    </section>
    <section class="menuSection searchMenu">
      <h2>Search</h2>
      <div class="meta railHint">Use the search bar above the graph. Results open in a modal.</div>
    </section>
    <section class="menuSection proposalMenu">
      <h2>Proposal</h2>
      <input id="sourceId" placeholder="source id, section id, or latest" value="latest" />
      <select id="extractor">
        <option value="deterministic">Deterministic</option>
        <option value="command">Command / LLM</option>
      </select>
      <input id="extractorCommand" placeholder="optional extractor command" />
      <div class="compactGrid">
        <button id="propose">Propose</button>
        <button id="apply">Apply</button>
      </div>
      <input id="proposalId" placeholder="proposal id" />
    </section>
    <section class="menuSection inboxMenu">
      <h2>Ingestion</h2>
      <div class="compactGrid">
        <button class="secondary" id="inbox">Inbox</button>
        <button class="secondary" id="autoIngest">Auto-Ingest</button>
        <button class="secondary" id="watcher">Watcher</button>
        <button class="secondary" id="writeSummary">Summary</button>
      </div>
    </section>
    <section class="menuSection qualityMenu">
      <h2>Quality</h2>
      <button class="secondary" id="quality">Quality Report</button>
      <div class="meta railHint">Governor audit, stale facts, conflicts, and undo live here.</div>
    </section>
    <section class="menuSection settingsMenu">
      <h2>Settings</h2>
      <input id="token" placeholder="Bearer token, if enabled" />
      <button class="secondary" id="selfPolicy">Self-Memory Policy</button>
    </section>
    <div class="item meta" id="actionLog"></div>
  </aside>
  <main>
    <div class="toolbar">
      <input id="memoryQuery" placeholder="Search memory" value="memory poisoning" />
      <button id="search" title="Open search results in a modal">Search</button>
      <button class="secondary" id="clear" title="Close the active modal">Clear</button>
    </div>
    <div class="panel">
      <section class="viewPanel" id="graphView">
        <div class="graphWrap">
          <div class="graphControls" aria-label="Graph zoom controls">
            <button class="small secondary" id="zoomOut" title="Zoom out">-</button>
            <div class="meta" id="zoomStatus">100%</div>
            <button class="small secondary" id="zoomIn" title="Zoom in">+</button>
            <button class="small secondary" id="zoomReset" title="Reset graph view">Reset</button>
            <button class="small secondary" id="focusClear" title="Clear focused graph">All</button>
          </div>
          <div class="graphInfoPanel">
            <h2>Legend</h2>
            <div class="legendGrid">
              <div class="legendItem"><span class="dot" style="background:#4da3ff"></span>source</div>
              <div class="legendItem"><span class="dot" style="background:#6bd78f"></span>section</div>
              <div class="legendItem"><span class="dot" style="background:#f4c84a"></span>event</div>
              <div class="legendItem"><span class="dot" style="background:#e7dc79"></span>fact</div>
              <div class="legendItem"><span class="dot" style="background:#ff6b6b"></span>failure</div>
            </div>
            <h2>Node Details</h2>
            <div id="details" class="meta selectedSummary">Click a graph node to inspect its content. Alt-drag a node to pin it. Shift-drag to lasso-select a region.</div>
          </div>
          <svg id="graph" role="img" aria-label="NeuraKeep memory graph"></svg>
        </div>
      </section>
      <section class="viewPanel" id="searchView"><div class="viewSurface" id="searchSurface"></div></section>
      <section class="viewPanel" id="inboxView"><div class="viewSurface" id="inboxSurface"></div></section>
      <section class="viewPanel" id="proposalsView"><div class="viewSurface" id="proposalsSurface"></div></section>
      <section class="viewPanel" id="qualityView"><div class="viewSurface" id="qualitySurface"></div></section>
      <section class="viewPanel" id="settingsView"><div class="viewSurface" id="settingsSurface"></div></section>
    </div>
  </main>
  <div class="citationPreview" id="citationPreview"></div>
  <div class="toastStack" id="toastStack"></div>
  <div class="modalBackdrop" id="modalBackdrop" role="dialog" aria-modal="true" aria-labelledby="modalTitle">
    <div class="modal">
      <div class="modalHeader">
        <h2 id="modalTitle">Memory</h2>
        <button class="secondary modalClose" id="modalClose">Close</button>
      </div>
      <div class="modalBody" id="modalBody"></div>
    </div>
  </div>
  <script>
    const colors = { source: '#4da3ff', section: '#6bd78f', event: '#f4c84a', fact: '#e7dc79', failure: '#ff6b6b' };
    const svg = document.getElementById('graph');
    const stats = document.getElementById('stats');
    const details = document.getElementById('details');
    const type = document.getElementById('type');
    const q = document.getElementById('q');
    const graphMode = document.getElementById('graphMode');
    const clusterBy = document.getElementById('clusterBy');
    const actionLog = document.getElementById('actionLog');
    const zoomStatus = document.getElementById('zoomStatus');
    const modalBackdrop = document.getElementById('modalBackdrop');
    const modalTitle = document.getElementById('modalTitle');
    const modalBody = document.getElementById('modalBody');
    const citationPreview = document.getElementById('citationPreview');
    const toastStack = document.getElementById('toastStack');
    let graph = { nodes: [], edges: [] };
    let selectedNodeId = '';
    let focusIds = null;
    let viewport = null;
    let graphState = { mode: 'all', layout: {}, pinned: [], collapsed: [], clusterBy: 'type', edgeTypes: ['contains', 'cites', 'next'] };
    const view = { x: 0, y: 0, scale: 1 };
    let dragging = null;
    let nodeDrag = null;
    let lasso = null;

    loadGraph();
    type.addEventListener('change', render); q.addEventListener('input', render); graphMode.addEventListener('change', render);
    document.querySelectorAll('.edgeType').forEach(box => box.addEventListener('change', () => {
      graphState.edgeTypes = selectedEdgeTypes();
      render();
    }));
    clusterBy.addEventListener('change', async () => {
      await withBusy(document.getElementById('saveGraphState'), async () => {
        graphState = await api('/api/graph/state', { method: 'POST', body: JSON.stringify({ ...graphState, clusterBy: clusterBy.value, mode: graphMode.value, edgeTypes: selectedEdgeTypes() }) });
        render();
        toast('Cluster preset saved');
      });
    });
    document.getElementById('refresh').addEventListener('click', event => withBusy(event.currentTarget, loadGraph));
    document.getElementById('saveGraphState').addEventListener('click', event => withBusy(event.currentTarget, saveGraphState));
    document.getElementById('pinSelected').addEventListener('click', event => withBusy(event.currentTarget, pinSelectedNode));
    document.getElementById('collapseSelected').addEventListener('click', event => withBusy(event.currentTarget, collapseSelectedNode));
    document.getElementById('search').addEventListener('click', event => withBusy(event.currentTarget, runSearch));
    document.getElementById('clear').addEventListener('click', () => { closeModal(); });
    document.getElementById('propose').addEventListener('click', event => withBusy(event.currentTarget, proposeUpdate));
    document.getElementById('apply').addEventListener('click', event => withBusy(event.currentTarget, applyProposal));
    document.getElementById('inbox').addEventListener('click', () => { location.hash = 'inbox'; renderInboxView(); });
    document.getElementById('autoIngest').addEventListener('click', event => withBusy(event.currentTarget, autoIngest));
    document.getElementById('watcher').addEventListener('click', () => { location.hash = 'inbox'; renderInboxView('watcher'); });
    document.getElementById('writeSummary').addEventListener('click', event => withBusy(event.currentTarget, writeSummary));
    document.getElementById('selfPolicy').addEventListener('click', () => { location.hash = 'settings'; renderSettingsView(); });
    document.getElementById('quality').addEventListener('click', () => { location.hash = 'quality'; renderQualityView(); });
    document.getElementById('modalClose').addEventListener('click', closeModal);
    document.getElementById('proposalId').addEventListener('input', updateButtonStates);
    modalBackdrop.addEventListener('click', event => { if (event.target === modalBackdrop) closeModal(); });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape') closeModal();
      if (event.target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName)) return;
      if (event.key === '/') { event.preventDefault(); document.getElementById('memoryQuery').focus(); }
      if (event.key === '1') { graphMode.value = 'all'; focusIds = null; render(); }
      if (event.key === '2') { graphMode.value = 'focused'; render(); }
      if (event.key === '3') { graphMode.value = 'source'; render(); }
      if (event.key === '4') { graphMode.value = 'failures'; render(); }
      if (event.key === '5') { graphMode.value = 'decisions'; render(); }
      if (event.key.toLowerCase() === 'f' && selectedNodeId) focusNeighborhood(selectedNodeId);
      if (event.key.toLowerCase() === 'e' && selectedNodeId) expandNeighborhood(selectedNodeId);
    });
    document.addEventListener('click', event => {
      const link = event.target.closest ? event.target.closest('[data-open-record]') : null;
      const focus = event.target.closest ? event.target.closest('[data-focus-record]') : null;
      const expand = event.target.closest ? event.target.closest('[data-expand-record]') : null;
      const stale = event.target.closest ? event.target.closest('[data-governor-stale]') : null;
      const keep = event.target.closest ? event.target.closest('[data-governor-keep]') : null;
      const merge = event.target.closest ? event.target.closest('[data-governor-merge]') : null;
      const undo = event.target.closest ? event.target.closest('[data-governor-undo]') : null;
      if (undo) {
        event.preventDefault();
        event.stopPropagation();
        undoGovernor(undo.dataset.governorUndo);
        return;
      }
      if (stale) {
        event.preventDefault();
        event.stopPropagation();
        resolveGovernor({ action: 'mark_stale', factIds: stale.dataset.governorStale.split(',').filter(Boolean) });
        return;
      }
      if (keep) {
        event.preventDefault();
        event.stopPropagation();
        resolveGovernor({ action: 'keep_both' });
        return;
      }
      if (merge) {
        event.preventDefault();
        event.stopPropagation();
        resolveGovernor({ action: 'merge', winnerId: merge.dataset.governorMerge, loserIds: merge.dataset.governorLosers.split(',').filter(Boolean) });
        return;
      }
      if (expand) {
        event.preventDefault();
        event.stopPropagation();
        expandNeighborhood(expand.dataset.expandRecord);
        return;
      }
      if (focus) {
        event.preventDefault();
        event.stopPropagation();
        focusNeighborhood(focus.dataset.focusRecord);
        return;
      }
      if (!link) return;
      event.preventDefault();
      event.stopPropagation();
      openRecord(link.dataset.openRecord, link.dataset.openLabel || '');
    });
    document.addEventListener('mouseover', event => {
      const link = event.target.closest ? event.target.closest('[data-open-record]') : null;
      if (modalBackdrop.classList.contains('open')) return;
      if (link) showCitationPreview(link.dataset.openRecord, event);
    });
    document.addEventListener('mousemove', event => {
      if (citationPreview.classList.contains('open')) positionCitationPreview(event);
    });
    document.addEventListener('mouseout', event => {
      const link = event.target.closest ? event.target.closest('[data-open-record]') : null;
      if (link) citationPreview.classList.remove('open');
    });
    document.getElementById('zoomIn').addEventListener('click', () => zoomBy(1.2));
    document.getElementById('zoomOut').addEventListener('click', () => zoomBy(1 / 1.2));
    document.getElementById('zoomReset').addEventListener('click', resetZoom);
    document.getElementById('focusClear').addEventListener('click', () => { focusIds = null; render(); });
    svg.addEventListener('wheel', onWheel, { passive: false });
    svg.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    setupRoutes();

    async function loadGraph() {
      const data = await api('/api/graph');
      graph = { nodes: data.nodes || [], edges: data.edges || [] };
      graphState = data.state || graphState;
      if (graphState.mode) graphMode.value = graphState.mode;
      if (graphState.clusterBy) clusterBy.value = graphState.clusterBy;
      if (!Array.isArray(graphState.edgeTypes)) graphState.edgeTypes = ['contains', 'cites', 'next'];
      document.querySelectorAll('.edgeType').forEach(box => { box.checked = graphState.edgeTypes.includes(box.value); });
      render();
      updateButtonStates();
      log('Graph loaded: ' + graph.nodes.length + ' nodes, ' + graph.edges.length + ' edges');
    }

    function render() {
      const term = q.value.toLowerCase();
      const modeIds = graphModeIds(graphMode.value);
      const collapsed = new Set(graphState.collapsed || []);
      const filtered = graph.nodes.filter(n => !collapsed.has(n.id) && (!modeIds || modeIds.has(n.id)) && (!type.value || n.type === type.value) && (!term || n.label.toLowerCase().includes(term)));
      const ids = new Set(filtered.map(n => n.id));
      const allowedEdges = new Set(selectedEdgeTypes());
      const edges = graph.edges.filter(e => ids.has(e.from) && ids.has(e.to) && allowedEdges.has(e.type || 'cites'));
      const w = svg.clientWidth || 900, h = svg.clientHeight || 700;
      const pos = computeForceLayout(filtered, edges, w, h);
      if (graphState.layout) {
        for (const n of filtered) {
          if (graphState.layout[n.id]) {
            pos.set(n.id, { x: graphState.layout[n.id].x, y: graphState.layout[n.id].y });
          }
        }
      }
      svg.innerHTML = '';
      viewport = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      viewport.setAttribute('id', 'viewport');
      svg.appendChild(viewport);
      for (const e of edges) {
        const a = pos.get(e.from), b = pos.get(e.to); if (!a || !b) continue;
        viewport.insertAdjacentHTML('beforeend', '<line x1="'+a.x+'" y1="'+a.y+'" x2="'+b.x+'" y2="'+b.y+'"></line>');
      }
      for (const n of filtered) {
        const p = pos.get(n.id); if (!p) continue;
        const label = n.label.length > 28 ? n.label.slice(0, 27) + '...' : n.label;
        const selected = n.id === selectedNodeId ? ' selected' : '';
        const pin = (graphState.pinned || []).includes(n.id) ? ' *' : '';
        viewport.insertAdjacentHTML('beforeend', '<g class="node'+selected+'" data-id="'+n.id+'"><circle class="hit" cx="'+p.x+'" cy="'+p.y+'" r="14"></circle><circle cx="'+p.x+'" cy="'+p.y+'" r="8" fill="'+colors[n.type]+'"></circle><text x="'+(p.x+12)+'" y="'+(p.y+4)+'">'+escapeHtml(label + pin)+'</text></g>');
      }
      svg.querySelectorAll('g.node').forEach(el => el.addEventListener('click', (event) => { event.stopPropagation(); show(el.dataset.id); }));
      applyView();
      stats.textContent = filtered.length + ' nodes, ' + edges.length + ' visible edges / mode: ' + graphMode.value + ' / cluster: ' + (graphState.clusterBy || 'type');
      updateButtonStates();
    }

    function selectedEdgeTypes() {
      const values = Array.from(document.querySelectorAll('.edgeType')).filter(input => input.checked).map(input => input.value);
      return values.length ? values : ['contains', 'cites', 'next'];
    }

    function graphModeIds(mode) {
      if (mode === 'all') return null;
      if (mode === 'focused') return focusIds;
      const ids = new Set();
      if (mode === 'source') {
        graph.nodes.filter(n => n.type === 'source' || n.id === selectedNodeId).forEach(n => ids.add(n.id));
        for (const edge of graph.edges) {
          if (ids.has(edge.from)) ids.add(edge.to);
          if (ids.has(edge.to)) ids.add(edge.from);
        }
        return ids;
      }
      if (mode === 'failures') {
        graph.nodes.filter(n => n.type === 'failure').forEach(n => ids.add(n.id));
        for (const edge of graph.edges) {
          if (ids.has(edge.from)) ids.add(edge.to);
          if (ids.has(edge.to)) ids.add(edge.from);
        }
        return ids;
      }
      if (mode === 'decisions') {
        graph.nodes.filter(n => n.type === 'event' && /decision|decided|direction/i.test(n.label)).forEach(n => ids.add(n.id));
        for (const edge of graph.edges) {
          if (ids.has(edge.from)) ids.add(edge.to);
          if (ids.has(edge.to)) ids.add(edge.from);
        }
        return ids;
      }
      return null;
    }

    function setupRoutes() {
      const buttons = Array.from(document.querySelectorAll('[data-route]'));
      const activate = () => {
        const route = (location.hash || '#graph').replace(/^#/, '');
        buttons.forEach(button => button.classList.toggle('active', button.dataset.route === route));
        document.body.dataset.route = route;
        if (route === 'search') document.getElementById('memoryQuery').focus();
        if (route === 'search') renderSearchView();
        if (route === 'inbox') renderInboxView();
        if (route === 'proposals') renderProposalInbox();
        if (route === 'quality') renderQualityView();
        if (route === 'settings') renderSettingsView();
        updateButtonStates();
      };
      buttons.forEach(button => button.addEventListener('click', () => {
        location.hash = button.dataset.route;
      }));
      window.addEventListener('hashchange', activate);
      activate();
    }

    async function saveGraphState() {
      const layout = {};
      svg.querySelectorAll('g.node').forEach(node => {
        const circle = node.querySelector('circle:not(.hit)');
        if (!circle) return;
        layout[node.dataset.id] = {
          x: Number(circle.getAttribute('cx')),
          y: Number(circle.getAttribute('cy')),
          pinned: (graphState.pinned || []).includes(node.dataset.id)
        };
      });
      graphState = await api('/api/graph/state', {
        method: 'POST',
        body: JSON.stringify({
          mode: graphMode.value,
          layout,
          pinned: graphState.pinned || [],
          collapsed: graphState.collapsed || [],
          clusterBy: graphState.clusterBy || 'type',
          edgeTypes: selectedEdgeTypes()
        })
      });
      log('Graph state saved');
      toast('Graph layout saved');
      render();
    }

    async function pinSelectedNode() {
      if (!selectedNodeId) return;
      const pinned = new Set(graphState.pinned || []);
      if (pinned.has(selectedNodeId)) pinned.delete(selectedNodeId); else pinned.add(selectedNodeId);
      graphState = await api('/api/graph/state', { method: 'POST', body: JSON.stringify({ ...graphState, pinned: Array.from(pinned), mode: graphMode.value }) });
      log((pinned.has(selectedNodeId) ? 'Pinned ' : 'Unpinned ') + selectedNodeId);
      toast(pinned.has(selectedNodeId) ? 'Node pinned' : 'Node unpinned');
      render();
    }

    async function collapseSelectedNode() {
      if (!selectedNodeId) return;
      const collapsed = new Set(graphState.collapsed || []);
      if (collapsed.has(selectedNodeId)) collapsed.delete(selectedNodeId); else collapsed.add(selectedNodeId);
      graphState = await api('/api/graph/state', { method: 'POST', body: JSON.stringify({ ...graphState, collapsed: Array.from(collapsed), mode: graphMode.value }) });
      log((collapsed.has(selectedNodeId) ? 'Collapsed ' : 'Expanded ') + selectedNodeId);
      toast(collapsed.has(selectedNodeId) ? 'Node collapsed' : 'Node expanded');
      render();
    }

    function computeForceLayout(nodes, edges, w, h) {
      const pos = new Map();
      const vel = new Map();
      const anchors = {
        source: { x: w * .25, y: h * .28 },
        section: { x: w * .55, y: h * .35 },
        event: { x: w * .34, y: h * .72 },
        fact: { x: w * .68, y: h * .68 },
        failure: { x: w * .78, y: h * .25 }
      };
      const dynamicAnchors = anchorMap(nodes, w, h);
      nodes.forEach((node, index) => {
        const anchor = dynamicAnchors.get(clusterKey(node)) || anchors[node.type] || { x: w / 2, y: h / 2 };
        const angle = seededAngle(node.id, index);
        const radius = 48 + (index % 11) * 10;
        pos.set(node.id, { x: anchor.x + Math.cos(angle) * radius, y: anchor.y + Math.sin(angle) * radius });
        vel.set(node.id, { x: 0, y: 0 });
      });
      const linked = edges.filter(edge => pos.has(edge.from) && pos.has(edge.to));
      for (let step = 0; step < 90; step++) {
        for (let i = 0; i < nodes.length; i++) {
          for (let j = i + 1; j < nodes.length; j++) {
            const a = pos.get(nodes[i].id), b = pos.get(nodes[j].id);
            const av = vel.get(nodes[i].id), bv = vel.get(nodes[j].id);
            let dx = a.x - b.x, dy = a.y - b.y;
            const dist2 = Math.max(dx * dx + dy * dy, 24);
            const force = 1300 / dist2;
            const dist = Math.sqrt(dist2);
            dx /= dist; dy /= dist;
            av.x += dx * force; av.y += dy * force;
            bv.x -= dx * force; bv.y -= dy * force;
            const min = 34;
            if (dist < min) {
              const push = (min - dist) * .045;
              av.x += dx * push; av.y += dy * push;
              bv.x -= dx * push; bv.y -= dy * push;
            }
          }
        }
        for (const edge of linked) {
          const a = pos.get(edge.from), b = pos.get(edge.to);
          const av = vel.get(edge.from), bv = vel.get(edge.to);
          const dx = b.x - a.x, dy = b.y - a.y;
          const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
          const target = edge.type === 'contains' ? 110 : 160;
          const pull = (dist - target) * .006;
          av.x += (dx / dist) * pull; av.y += (dy / dist) * pull;
          bv.x -= (dx / dist) * pull; bv.y -= (dy / dist) * pull;
        }
        for (const node of nodes) {
          const p = pos.get(node.id), v = vel.get(node.id), anchor = dynamicAnchors.get(clusterKey(node)) || anchors[node.type] || { x: w / 2, y: h / 2 };
          v.x += (anchor.x - p.x) * .004;
          v.y += (anchor.y - p.y) * .004;
          p.x = clamp(p.x + v.x, 44, Math.max(88, w - 44));
          p.y = clamp(p.y + v.y, 44, Math.max(88, h - 44));
          v.x *= .72; v.y *= .72;
        }
      }
      return pos;
    }

    function clusterKey(node) {
      if (graphState.clusterBy === 'space') return node.space || node.type;
      if (graphState.clusterBy === 'trust') return node.trustLevel || node.type;
      if (graphState.clusterBy === 'sensitivity') return node.sensitivity || node.type;
      return node.type;
    }

    function anchorMap(nodes, w, h) {
      const keys = Array.from(new Set(nodes.map(clusterKey))).sort();
      const map = new Map();
      const cx = w / 2, cy = h / 2;
      const radiusX = Math.max(120, w * .31), radiusY = Math.max(110, h * .28);
      keys.forEach((key, index) => {
        const angle = (index / Math.max(1, keys.length)) * Math.PI * 2 - Math.PI / 2;
        map.set(key, { x: cx + Math.cos(angle) * radiusX, y: cy + Math.sin(angle) * radiusY });
      });
      return map;
    }

    function seededAngle(id, fallback) {
      let hash = fallback + 17;
      for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) % 10000;
      return (hash / 10000) * Math.PI * 2;
    }

    async function show(id) {
      const n = graph.nodes.find(x => x.id === id);
      selectedNodeId = id || '';
      render();
      if (!n) {
        openModal('Node not found', '<div class="record">Node not found.</div>');
        return;
      }
      details.innerHTML = '<div class="item"><b>'+escapeHtml(n.label)+'</b><br>'+escapeHtml(n.type)+' selected'
        + '<div class="chips"><button class="linkChip" data-open-record="'+escapeAttr(n.id)+'">Open</button><button class="linkChip" data-focus-record="'+escapeAttr(n.id)+'">Focus</button><button class="linkChip" data-expand-record="'+escapeAttr(n.id)+'">Expand</button></div>'
        + '<div class="meta">Shortcuts: / search, 1 all, 2 focused, 3 source, 4 failures, 5 decisions, f focus, e expand.</div></div>';
      await openRecord(id, n.label);
    }

    async function runSearch() {
      const query = document.getElementById('memoryQuery').value.trim();
      if (!query) return;
      const data = await mcp('memory_search', { query, limit: 8, neighbors: 1, space: 'project' });
      const list = (data.structuredContent && data.structuredContent.results) || [];
      const html = list.map(formatResult).join('') || '<div class="result">No results.</div>';
      openModal('Search Results', html);
    }
    async function proposeUpdate() {
      const source_id = document.getElementById('sourceId').value.trim() || 'latest';
      const extractor = document.getElementById('extractor').value;
      const extractor_command = document.getElementById('extractorCommand').value.trim();
      const data = await mcp('memory_propose_update', { source_id, extractor, extractor_command });
      const proposal = data.structuredContent || {};
      if (proposal.proposalId) document.getElementById('proposalId').value = proposal.proposalId;
      log('Created proposal ' + (proposal.proposalId || 'unknown'));
      toast('Proposal created');
      updateButtonStates();
      if (document.body.dataset.route === 'proposals') await renderProposalInbox();
      openProposalReview(proposal);
    }
    async function applyProposal() {
      const proposal_id = document.getElementById('proposalId').value.trim();
      if (!proposal_id) return log('Enter a proposal id first');
      const data = await mcp('memory_apply_update', { proposal_id });
      log('Applied proposal: ' + JSON.stringify(data.structuredContent || data.result || data));
      toast('Proposal applied');
      await loadGraph();
      if (document.body.dataset.route === 'proposals') await renderProposalInbox();
    }
    async function api(path, options) {
      const headers = { 'content-type': 'application/json' };
      const token = document.getElementById('token').value.trim();
      if (token) headers.authorization = 'Bearer ' + token;
      const response = await fetch(path, { ...(options || {}), headers: { ...headers, ...((options && options.headers) || {}) } });
      const data = await response.json();
      if (!response.ok || data.error) throw new Error(data.error || response.statusText);
      return data;
    }
    async function mcp(name, args) {
      const headers = { 'content-type': 'application/json' };
      const token = document.getElementById('token').value.trim();
      if (token) headers.authorization = 'Bearer ' + token;
      const response = await fetch('/mcp', {
        method: 'POST',
        headers,
        body: JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method: 'tools/call', params: { name, arguments: args } })
      });
      const data = await response.json();
      if (data.error) throw new Error(data.error.message || 'MCP error');
      return data.result;
    }
    function formatResult(r) {
      const title = r.heading || r.sourceTitle || r.id;
      const warnings = (r.relatedFailures || []).map(f => '<div class="warn"><b>Known failed path</b><br>'+escapeHtml(f.doNotRepeat)+'<br><button class="inlineLink" data-open-record="'+escapeAttr(f.id)+'" data-open-label="Failure">Open failure</button></div>').join('');
      return '<div class="result clickable" data-open-record="'+escapeAttr(r.id)+'" data-open-label="'+escapeAttr(title)+'"><b>'+escapeHtml(title)+'</b><div class="meta">'+escapeHtml(r.id)+' / score '+Number(r.score || 0).toFixed(2)+' / '+escapeHtml(r.trustLevel)+' / '+escapeHtml(r.sensitivity)+'</div><div>'+escapeHtml(r.snippet || '')+'</div>'+warnings+'</div>';
    }

    function openProposalReview(proposal) {
      openModal('Review Proposal', buildProposalReviewHtml(proposal));
      attachProposalReviewHandlers(proposal, closeModal);
    }

    function buildProposalReviewHtml(proposal) {
      const diff = proposal.diff || { events: [], facts: [], failures: [] };
      const governor = proposal.governor || { warnings: [], blocked: [] };
      currentGovernorWarnings = governor.warnings || [];
      return '<div class="record"><h3>'+escapeHtml(proposal.summary || 'Pending proposal')+'</h3>'
        + '<div class="chips"><span class="chip">'+escapeHtml(proposal.proposalId || '')+'</span><span class="chip">item-card review</span><span class="chip">'+escapeHtml((governor.blocked || []).length)+' blocked</span><span class="chip">'+escapeHtml((governor.warnings || []).length)+' warnings</span></div>'
        + '<div class="meta">Review extracted items. Uncheck anything you do not want to make durable, edit fields inline, then apply selected.</div>'
        + '<div id="extractionScore" class="meta">Extraction score loading...</div>'
        + '<div class="proposalTools"><button id="selectAllProposal" class="secondary">Select all</button><button id="selectNoneProposal" class="secondary">Select none</button><button id="selectCleanProposal" class="secondary">Apply clean items only</button></div>'
        + renderGovernorWarnings(governor)
        + '<h2>Events</h2>' + renderProposalCards('events', diff.events || [])
        + '<h2>Facts</h2>' + renderProposalCards('facts', diff.facts || [])
        + '<h2>Failures</h2>' + renderProposalCards('failures', diff.failures || [])
        + '<div style="display:flex;gap:10px;margin-top:10px;"><button id="saveProposalReview">Save Review</button><button id="applyProposalReview" class="secondary">Apply Reviewed Proposal</button></div></div>';
    }

    function attachProposalReviewHandlers(proposal, afterApply) {
      const diff = proposal.diff || { events: [], facts: [], failures: [] };
      setTimeout(() => {
        const save = document.getElementById('saveProposalReview');
        const apply = document.getElementById('applyProposalReview');
        const selectAll = document.getElementById('selectAllProposal');
        const selectNone = document.getElementById('selectNoneProposal');
        const selectClean = document.getElementById('selectCleanProposal');
        if (selectAll) selectAll.addEventListener('click', () => setProposalSelected(() => true));
        if (selectNone) selectNone.addEventListener('click', () => setProposalSelected(() => false));
        if (selectClean) selectClean.addEventListener('click', () => setProposalSelected(card => card.dataset.clean === 'true'));
        if (save) save.addEventListener('click', async () => {
          const parsed = collectReviewedDiff(diff);
          await api('/api/proposals/'+encodeURIComponent(proposal.proposalId)+'/save', { method: 'POST', body: JSON.stringify({ diff: parsed }) });
          log('Saved reviewed proposal ' + proposal.proposalId);
          toast('Proposal saved');
        });
        if (apply) apply.addEventListener('click', async () => {
          const parsed = collectReviewedDiff(diff);
          const result = await api('/api/proposals/'+encodeURIComponent(proposal.proposalId)+'/apply', { method: 'POST', body: JSON.stringify({ diff: parsed }) });
          log('Applied reviewed proposal ' + proposal.proposalId + ': ' + JSON.stringify(result.inserted || result));
          toast('Proposal applied');
          if (afterApply) afterApply();
          await loadGraph();
          if (document.body.dataset.route === 'proposals') await renderProposalInbox();
        });
        loadExtractionScore(proposal.proposalId);
      }, 0);
    }

    async function loadExtractionScore(proposalId) {
      const target = document.getElementById('extractionScore');
      if (!target || !proposalId) return;
      try {
        const result = await api('/api/proposals/'+encodeURIComponent(proposalId)+'/extraction-score');
        const score = result.score;
        if (!score) {
          target.textContent = 'Extraction score unavailable.';
          return;
        }
        target.innerHTML = '<div class="chips"><span class="chip">'+escapeHtml(score.itemCount)+' items</span><span class="chip">'+Math.round(score.citationCoverage * 100)+'% cited</span><span class="chip">'+Math.round(score.overlapWithDeterministic * 100)+'% baseline overlap</span><span class="chip">'+Math.round(score.averageConfidence * 100)+'% avg confidence</span></div>'
          + (score.warnings || []).map(w => '<div class="proposalWarn">'+escapeHtml(w)+'</div>').join('');
      } catch (error) {
        target.textContent = 'Extraction score unavailable: ' + (error.message || String(error));
      }
    }

    function renderGovernorWarnings(governor) {
      const rows = (governor.warnings || []).map(warning => '<div class="warn"><b>'+escapeHtml(warning.kind)+' / '+escapeHtml(warning.itemType)+'</b><br>'+escapeHtml(warning.message)+'<br><span class="meta">'+escapeHtml(warning.itemId)+' '+(warning.relatedIds || []).join(', ')+'</span></div>').join('');
      return rows ? '<h2>Governor</h2>'+rows : '';
    }

    function renderProposalCards(type, items) {
      if (!items || items.length === 0) return '<div class="meta">No proposed '+escapeHtml(type)+'.</div>';
      return '<table class="proposalTable"><thead><tr><th>Use</th><th>Item</th><th>Confidence</th><th>Citations</th><th>Governor</th></tr></thead><tbody>' + items.map((item, index) => renderProposalCard(type, item, index)).join('') + '</tbody></table>';
    }

    function renderProposalCard(type, item, index) {
      const citations = (item.sourceIds || []).concat(item.sectionIds || []).map(id => '<button class="linkChip" title="Open citation preview" data-open-record="'+escapeAttr(id)+'">'+escapeHtml(id)+'</button>').join('');
      const warningText = currentGovernorWarnings.filter(w => w.itemId === item.id).map(w => w.message).join(' ');
      const clean = warningText ? 'false' : 'true';
      const header = '<tr data-proposal-card="'+escapeAttr(type)+'" data-index="'+index+'" data-clean="'+clean+'"><td><input type="checkbox" data-field="selected" checked></td><td><b>'+escapeHtml(type.slice(0, -1))+' '+(index + 1)+'</b>';
      const confidence = '<label class="meta">Confidence <input type="range" min="0" max="1" step="0.05" value="'+escapeAttr(item.confidence || 0.8)+'" data-field="confidence"></label>';
      if (type === 'events') {
        return header + '<label>Summary<textarea data-field="summary">'+escapeHtml(item.summary || '')+'</textarea></label></td><td>'+confidence+'</td><td><div class="chips">'+citations+'</div></td><td>'+renderProposalWarning(warningText)+'</td></tr>';
      }
      if (type === 'facts') {
        return header + proposalInput('subject', item.subject) + proposalInput('predicate', item.predicate) + proposalInput('object', item.object) + '</td><td>'+confidence+'</td><td><div class="chips">'+citations+'</div></td><td>'+renderProposalWarning(warningText)+'</td></tr>';
      }
      return header + proposalInput('attempted', item.attempted) + proposalInput('failedBecause', item.failedBecause) + '<label>Do not repeat<textarea data-field="doNotRepeat">'+escapeHtml(item.doNotRepeat || '')+'</textarea></label></td><td>'+confidence+'</td><td><div class="chips">'+citations+'</div></td><td>'+renderProposalWarning(warningText)+'</td></tr>';
    }

    let currentGovernorWarnings = [];

    function renderProposalWarning(text) {
      return text ? '<div class="proposalWarn">'+escapeHtml(text)+'</div>' : '<span class="meta">Clean</span>';
    }

    function setProposalSelected(predicate) {
      document.querySelectorAll('[data-proposal-card]').forEach(card => {
        const checkbox = card.querySelector('[data-field="selected"]');
        if (checkbox) checkbox.checked = predicate(card);
      });
    }

    function proposalInput(field, value) {
      return '<label>'+escapeHtml(field)+'<input data-field="'+escapeAttr(field)+'" value="'+escapeAttr(value || '')+'"></label>';
    }

    function collectReviewedDiff(original) {
      const next = { events: [], facts: [], failures: [] };
      document.querySelectorAll('[data-proposal-card]').forEach(card => {
        const type = card.dataset.proposalCard;
        const index = Number(card.dataset.index);
        const originalItem = (original[type] || [])[index];
        if (!originalItem || !card.querySelector('[data-field="selected"]').checked) return;
        const item = { ...originalItem };
        card.querySelectorAll('[data-field]').forEach(input => {
          const field = input.dataset.field;
          if (field === 'selected') return;
          if (input.type === 'range') {
            item[field] = Number(input.value);
          } else {
            item[field] = input.value;
          }
        });
        next[type].push(item);
      });
      return next;
    }

    async function openRecord(id, fallbackTitle) {
      if (!id) return;
      const node = graph.nodes.find(x => x.id === id) || { id, label: fallbackTitle || id, type: 'record' };
      openModal(node.label || fallbackTitle || id, renderNodeShell(node) + '<div class="meta">Loading content...</div>');
      try {
        const data = await mcp('memory_read', { id });
        const record = data.structuredContent ? data.structuredContent.record : null;
        const title = recordTitle(record, node);
        openModal(title, renderRecord(node, record));
      } catch (error) {
        openModal(node.label || fallbackTitle || id, renderNodeShell(node) + '<div class="warn">'+escapeHtml(error.message || String(error))+'</div>');
      }
    }

    function openModal(title, html) {
      hideCitationPreview();
      modalTitle.textContent = title || 'Memory';
      modalBody.innerHTML = html || '';
      modalBackdrop.classList.add('open');
    }

    function closeModal() {
      modalBackdrop.classList.remove('open');
      hideCitationPreview();
    }

    function renderRecord(node, record) {
      if (!record) {
        return renderNodeShell(node) + '<div class="warn">No record found for this node.</div>';
      }
      const title = recordTitle(record, node);
      const chips = [
        record.recordType || node.type,
        record.space,
        record.trust_level,
        record.sensitivity,
        record.visibility
      ].filter(Boolean).map(v => '<span class="chip">'+escapeHtml(v)+'</span>').join('');
      const lines = [
        kv('id', record.id),
        record.source_id ? kv('source', '<button class="inlineLink" data-open-record="'+escapeAttr(record.source_id)+'">Open source</button>', true) : '',
        kv('uri', record.uri || ''),
        kv('captured', record.captured_at || record.created_at || record.timestamp || '')
      ].join('');
      const content = recordContent(record);
      const citations = renderCitations(record);
      return '<div class="record"><h3>'+escapeHtml(title)+'</h3><div class="chips">'+chips+'<button class="linkChip" data-focus-record="'+escapeAttr(record.id || node.id)+'">Focus graph</button><button class="linkChip" data-expand-record="'+escapeAttr(record.id || node.id)+'">Expand neighbors</button></div>'+lines+content+citations+'</div>';
    }

    function renderNodeShell(node) {
      return '<div class="record"><h3>'+escapeHtml(node.label)+'</h3><div class="chips"><span class="chip">'+escapeHtml(node.type)+'</span><span class="chip">'+escapeHtml(node.space || '')+'</span><span class="chip">'+escapeHtml(node.trustLevel || '')+'</span><span class="chip">'+escapeHtml(node.sensitivity || '')+'</span></div>'+kv('id', node.id)+'</div>';
    }

    function recordTitle(record, node) {
      return (record && (record.title || record.heading || record.summary || record.subject || record.attempted || record.id)) || node.label || node.id || 'Memory';
    }

    function recordContent(record) {
      if (record.recordType === 'source') {
        const sections = Array.isArray(record.sections) ? record.sections : [];
        const text = sections.map(section => {
          const heading = section.heading ? '# ' + section.heading + '\\n\\n' : '';
          return heading + String(section.body || '');
        }).join('\\n\\n---\\n\\n');
        return markdownBlock(text || record.raw_path || '');
      }
      if (record.recordType === 'section') {
        return markdownBlock(record.body || '');
      }
      if (record.recordType === 'event') {
        return '<pre>'+escapeHtml(record.summary || '')+'</pre>';
      }
      if (record.recordType === 'fact') {
        return '<pre>'+escapeHtml([record.subject, record.predicate, record.object].filter(Boolean).join(' '))+'</pre>';
      }
      if (record.recordType === 'failure') {
        const text = [
          'Attempted: ' + String(record.attempted || ''),
          'Failed because: ' + String(record.failed_because || ''),
          'Do not repeat: ' + String(record.do_not_repeat || ''),
          record.revisit_condition ? 'Revisit when: ' + String(record.revisit_condition) : ''
        ].filter(Boolean).join('\\n');
        return '<pre>'+escapeHtml(text)+'</pre>';
      }
      if (record.recordType === 'proposal') {
        return '<pre>'+escapeHtml(record.summary || record.diff_json || '')+'</pre>';
      }
      return '<pre>'+escapeHtml(JSON.stringify(record, null, 2))+'</pre>';
    }

    function markdownBlock(text) {
      return '<div class="markdown">'+renderMarkdown(String(text || ''))+'</div>';
    }

    function renderMarkdown(markdown) {
      const lines = markdown.replace(/\\r\\n/g, '\\n').split('\\n');
      const out = [];
      let inCode = false;
      let code = [];
      let listType = '';
      const closeList = () => {
        if (listType) {
          out.push('</' + listType + '>');
          listType = '';
        }
      };
      const flushCode = () => {
        out.push('<pre><code>' + escapeHtml(code.join('\\n')) + '</code></pre>');
        code = [];
      };
      for (const rawLine of lines) {
        const line = rawLine.replace(/\\s+$/,'');
        const tick = String.fromCharCode(96);
        if (line.startsWith(tick + tick + tick)) {
          if (inCode) {
            flushCode();
            inCode = false;
          } else {
            closeList();
            inCode = true;
            code = [];
          }
          continue;
        }
        if (inCode) {
          code.push(line);
          continue;
        }
        if (!line.trim()) {
          closeList();
          continue;
        }
        const heading = /^(#{1,3})\\s+(.+)$/.exec(line);
        if (heading) {
          closeList();
          out.push('<h' + heading[1].length + '>' + inlineMarkdown(heading[2]) + '</h' + heading[1].length + '>');
          continue;
        }
        if (/^---+$/.test(line.trim())) {
          closeList();
          out.push('<hr>');
          continue;
        }
        const bullet = /^[-*]\\s+(.+)$/.exec(line);
        if (bullet) {
          if (listType !== 'ul') {
            closeList();
            out.push('<ul>');
            listType = 'ul';
          }
          out.push('<li>' + inlineMarkdown(bullet[1]) + '</li>');
          continue;
        }
        const numbered = /^\\d+[.)]\\s+(.+)$/.exec(line);
        if (numbered) {
          if (listType !== 'ol') {
            closeList();
            out.push('<ol>');
            listType = 'ol';
          }
          out.push('<li>' + inlineMarkdown(numbered[1]) + '</li>');
          continue;
        }
        const quote = /^>\\s?(.+)$/.exec(line);
        if (quote) {
          closeList();
          out.push('<blockquote>' + inlineMarkdown(quote[1]) + '</blockquote>');
          continue;
        }
        closeList();
        out.push('<p>' + inlineMarkdown(line) + '</p>');
      }
      if (inCode) flushCode();
      closeList();
      return out.join('');
    }

    function inlineMarkdown(value) {
      let html = escapeHtml(value);
      html = html.replace(/\\[([^\\]]+)\\]\\((https?:\\/\\/[^\\s)]+)\\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>');
      html = renderInlineCode(html);
      html = html.replace(/\\*\\*([^*]+)\\*\\*/g, '<strong>$1</strong>');
      html = html.replace(/\\b_([^_]+)_\\b/g, '<em>$1</em>');
      return html;
    }

    function renderInlineCode(html) {
      const tick = String.fromCharCode(96);
      const parts = html.split(tick);
      if (parts.length < 3) return html;
      return parts.map((part, index) => index % 2 ? '<code>' + part + '</code>' : part).join('');
    }

    function renderCitations(record) {
      const sourceIds = parseJsonArray(record.source_ids_json);
      const sectionIds = parseJsonArray(record.section_ids_json);
      const chips = sourceIds.concat(sectionIds).map(id => '<button class="linkChip" title="Open citation preview" data-open-record="'+escapeAttr(id)+'">'+escapeHtml(id)+'</button>').join('');
      return chips ? '<h2>Citations</h2><div class="chips">'+chips+'</div>' : '';
    }

    async function renderSearchView() {
      const surface = document.getElementById('searchSurface');
      surface.innerHTML = '<h2>Search</h2><div class="viewGrid"><div class="viewCard"><h3>Memory Search</h3><div class="meta">Use the global search bar. Results open in a modal so the graph area stays clean.</div><button id="searchViewRun">Search in Modal</button></div><div class="viewCard"><h3>Tip</h3><div class="meta">Click citations in results for previews, or open/focus any node from the modal.</div></div></div>';
      document.getElementById('searchViewRun').addEventListener('click', event => withBusy(event.currentTarget, runSearch));
    }

    async function renderInboxView(focus) {
      const surface = document.getElementById('inboxSurface');
      surface.innerHTML = '<h2>Inbox</h2><div class="meta">Loading inbox and watcher state...</div>';
      const data = await api('/api/inbox');
      const status = await api('/api/watch/status');
      const files = data.files || [];
      const fileRows = files.map(file => '<tr><td><b>'+escapeHtml(file.name)+'</b><div class="meta">'+escapeHtml(file.path)+'</div></td><td>'+escapeHtml(file.kind)+'</td><td>'+escapeHtml(file.bytes)+'</td><td><button class="secondary" data-ingest-path="'+escapeAttr(file.path)+'" data-ingest-kind="'+escapeAttr(file.kind)+'">Ingest</button></td></tr>').join('') || '<tr><td colspan="4" class="meta">Inbox is empty. Drop markdown/session files into .umos/inbox.</td></tr>';
      const history = (status.history || []).slice().reverse().map(row => '<tr><td>'+escapeHtml(row.at)+'</td><td>'+escapeHtml(row.profileId || 'custom')+'</td><td>'+escapeHtml(row.ok ? 'ok' : 'error')+'</td><td>'+escapeHtml(row.ingested)+' ingested / '+escapeHtml(row.proposals)+' proposals</td></tr>').join('') || '<tr><td colspan="4" class="meta">No persisted watcher runs yet.</td></tr>';
      surface.innerHTML = '<h2>Inbox</h2><div class="viewGrid"><div class="viewCard"><h3>Files</h3><table class="viewTable"><thead><tr><th>File</th><th>Kind</th><th>Bytes</th><th></th></tr></thead><tbody>'+fileRows+'</tbody></table></div><div class="viewCard"><h3>Watcher</h3>'+renderWatcher(status, [])+'<h3>Run History</h3><table class="viewTable"><thead><tr><th>At</th><th>Profile</th><th>Status</th><th>Result</th></tr></thead><tbody>'+history+'</tbody></table></div></div>';
      document.querySelectorAll('[data-ingest-path]').forEach(button => button.addEventListener('click', event => withBusy(event.currentTarget, async () => {
        const result = await api('/api/ingest', { method: 'POST', body: JSON.stringify({ path: button.dataset.ingestPath, kind: button.dataset.ingestKind }) });
        toast('Ingested ' + result.sourceId);
        await loadGraph();
        await renderInboxView();
      })));
      const start = document.getElementById('startWatcher');
      const stop = document.getElementById('stopWatcher');
      if (start) start.addEventListener('click', event => withBusy(event.currentTarget, async () => { await startWatcher(); await renderInboxView('watcher'); }));
      if (stop) stop.addEventListener('click', event => withBusy(event.currentTarget, async () => { await stopWatcher(); await renderInboxView('watcher'); }));
      if (focus === 'watcher') surface.querySelector('.viewCard:nth-child(2)')?.scrollIntoView({ block: 'start' });
    }

    async function renderProposalInbox() {
      const surface = document.getElementById('proposalsSurface');
      const status = document.getElementById('proposalStatusFilter')?.value || 'pending';
      const filter = document.getElementById('proposalCleanFilter')?.value || 'all';
      surface.innerHTML = '<h2>Proposals</h2><div class="meta">Loading proposal inbox...</div>';
      const data = await api('/api/proposals?status='+encodeURIComponent(status)+'&filter='+encodeURIComponent(filter));
      const proposals = data.proposals || [];
      const rows = proposals.map(p => '<tr><td><b>'+escapeHtml(p.summary || p.id)+'</b><div class="meta">'+escapeHtml(p.id)+' / '+escapeHtml(p.createdAt || '')+'</div><div class="chips"><span class="chip">'+escapeHtml(p.counts.events)+' events</span><span class="chip">'+escapeHtml(p.counts.facts)+' facts</span><span class="chip">'+escapeHtml(p.counts.failures)+' failures</span><span class="chip">'+escapeHtml(p.warningCount)+' warnings</span><span class="chip">'+escapeHtml(p.blockedCount)+' blocked</span></div></td><td>'+escapeHtml(p.status)+'</td><td><button class="secondary" data-review-proposal="'+escapeAttr(p.id)+'">Review</button><button class="secondary" data-apply-proposal="'+escapeAttr(p.id)+'">Apply</button><button class="secondary" data-archive-proposal="'+escapeAttr(p.id)+'">Archive</button><button class="secondary" data-reject-proposal="'+escapeAttr(p.id)+'">Reject</button></td></tr>').join('') || '<tr><td colspan="3" class="meta">No proposals for this filter.</td></tr>';
      surface.innerHTML = '<h2>Proposals</h2><div class="compactGrid" style="max-width:420px;"><select id="proposalStatusFilter"><option value="pending">pending</option><option value="all">all</option><option value="applied">applied</option><option value="archived">archived</option><option value="rejected">rejected</option></select><select id="proposalCleanFilter"><option value="all">all</option><option value="clean">clean</option><option value="warnings">warnings</option><option value="blocked">blocked</option></select></div><table class="viewTable"><thead><tr><th>Proposal</th><th>Status</th><th>Actions</th></tr></thead><tbody>'+rows+'</tbody></table><div id="proposalDetail"></div>';
      document.getElementById('proposalStatusFilter').value = status;
      document.getElementById('proposalCleanFilter').value = filter;
      document.getElementById('proposalStatusFilter').addEventListener('change', renderProposalInbox);
      document.getElementById('proposalCleanFilter').addEventListener('change', renderProposalInbox);
      document.querySelectorAll('[data-review-proposal]').forEach(button => button.addEventListener('click', event => withBusy(event.currentTarget, async () => {
        const proposal = await loadProposalForReview(button.dataset.reviewProposal);
        const detail = document.getElementById('proposalDetail');
        detail.innerHTML = '<h2>Review</h2>' + buildProposalReviewHtml(proposal);
        attachProposalReviewHandlers(proposal, async () => { detail.innerHTML = ''; });
        detail.scrollIntoView({ block: 'start' });
      })));
      document.querySelectorAll('[data-apply-proposal]').forEach(button => button.addEventListener('click', event => withBusy(event.currentTarget, async () => {
        await api('/api/proposals/'+encodeURIComponent(button.dataset.applyProposal)+'/apply', { method: 'POST', body: '{}' });
        toast('Proposal applied');
        await loadGraph();
        await renderProposalInbox();
      })));
      document.querySelectorAll('[data-archive-proposal],[data-reject-proposal]').forEach(button => button.addEventListener('click', event => withBusy(event.currentTarget, async () => {
        const id = button.dataset.archiveProposal || button.dataset.rejectProposal;
        const status = button.dataset.archiveProposal ? 'archived' : 'rejected';
        await api('/api/proposals/'+encodeURIComponent(id)+'/status', { method: 'POST', body: JSON.stringify({ status }) });
        toast('Proposal ' + status);
        await renderProposalInbox();
      })));
    }

    async function loadProposalForReview(id) {
      const data = await api('/api/proposals/'+encodeURIComponent(id));
      const diff = JSON.parse(data.proposal.diff_json);
      return { proposalId: data.proposal.id, summary: data.proposal.summary, diff, governor: await api('/api/proposals/'+encodeURIComponent(data.proposal.id)+'/governor') };
    }

    async function renderQualityView() {
      const surface = document.getElementById('qualitySurface');
      surface.innerHTML = '<h2>Quality</h2><div class="meta">Loading governor report...</div>';
      const report = await api('/api/quality');
      const audit = await api('/api/governor/audit');
      const timeline = await api('/api/governor/timeline');
      const block = (title, rows, formatter) => '<div class="viewCard"><h3>'+escapeHtml(title)+'</h3>' + ((rows || []).map(formatter).join('') || '<div class="meta">None.</div>') + '</div>';
      surface.innerHTML = '<h2>Quality</h2><div class="viewGrid">'
        + block('Conflicts', report.conflictingFacts, row => '<div class="result"><b>'+escapeHtml(row.key)+'</b>'+row.values.map(v => '<div><button class="inlineLink" data-open-record="'+escapeAttr(v.factId)+'">'+escapeHtml(v.factId)+'</button>: '+escapeHtml(v.object)+' <button class="inlineLink" data-governor-merge="'+escapeAttr(v.factId)+'" data-governor-losers="'+escapeAttr(row.values.filter(x => x.factId !== v.factId).map(x => x.factId).join(','))+'">winner</button></div>').join('')+'<div class="chips"><button class="linkChip" data-governor-keep="1">Keep both</button><button class="linkChip" data-governor-stale="'+escapeAttr(row.values.map(v => v.factId).join(','))+'">Mark stale</button></div></div>')
        + block('Stale Review Queue', report.staleFacts, row => '<div class="result"><button class="inlineLink" data-open-record="'+escapeAttr(row.factId)+'">'+escapeHtml(row.factId)+'</button><div class="meta">'+escapeHtml(row.subject+' '+row.predicate+' review after '+row.reviewAfter)+'</div></div>')
        + block('Duplicates', report.duplicateFacts, row => '<div class="result"><b>'+escapeHtml(row.key)+'</b><div class="chips">'+row.factIds.map(id => '<button class="linkChip" data-open-record="'+escapeAttr(id)+'">'+escapeHtml(id)+'</button>').join('')+'<button class="linkChip" data-governor-stale="'+escapeAttr(row.factIds.join(','))+'">Mark stale</button></div></div>')
        + block('Supersede Timeline', timeline.timeline, row => '<div class="result"><button class="inlineLink" data-open-record="'+escapeAttr(row.id)+'">'+escapeHtml(row.id)+'</button><div class="meta">'+escapeHtml(row.subject+' '+row.predicate+' -> '+row.object)+'</div><div class="meta">supersedes '+escapeHtml((row.supersedes || []).join(', '))+'</div></div>')
        + block('Undo History', audit.entries, row => '<div class="result"><b>'+escapeHtml(row.action)+' '+escapeHtml(row.createdAt)+'</b><div class="meta">'+escapeHtml((row.targetIds || []).join(', '))+'</div>'+(row.undoable ? '<button class="secondary" data-governor-undo="'+escapeAttr(row.id)+'">Undo</button>' : '')+'</div>')
        + '</div>';
    }

    async function renderSettingsView() {
      const surface = document.getElementById('settingsSurface');
      const data = await api('/api/self-policy');
      const reports = await api('/api/extraction/reports');
      const policy = data.policy || {};
      const section = (title, rows) => '<div class="viewCard"><h3>'+escapeHtml(title)+'</h3>' + ((rows || []).map(row => '<div class="result">'+escapeHtml(row)+'</div>').join('') || '<div class="meta">None.</div>') + '</div>';
      const evalRows = (reports.reports || []).map(row => '<tr><td>'+escapeHtml(row.createdAt)+'</td><td>'+escapeHtml(row.proposalId)+'</td><td>'+escapeHtml(row.sourceId || '')+'</td><td>'+Math.round((row.score?.citationCoverage || 0) * 100)+'% cited / '+Math.round((row.score?.overlapWithDeterministic || 0) * 100)+'% overlap</td></tr>').join('') || '<tr><td colspan="4" class="meta">No extraction eval reports yet.</td></tr>';
      surface.innerHTML = '<h2>Settings</h2><div class="viewGrid">'
        + section('Auto Index Only', policy.autoIndexOnly)
        + section('Durable Auto-Apply', policy.durableAutoApply)
        + section('Queued Only', policy.queuedOnly)
        + section('Never Save', policy.neverSave)
        + section('Heartbeat / Session Close', policy.closeLoop)
        + '<div class="viewCard"><h3>Extraction Eval Reports</h3><table class="viewTable"><thead><tr><th>At</th><th>Proposal</th><th>Source</th><th>Score</th></tr></thead><tbody>'+evalRows+'</tbody></table></div>'
        + '</div>';
    }

    async function showInbox() {
      const data = await api('/api/inbox');
      const files = data.files || [];
      const html = files.map(file => '<div class="result"><b>'+escapeHtml(file.name)+'</b><div class="meta">'+escapeHtml(file.path)+' / '+escapeHtml(file.kind)+' / '+escapeHtml(file.bytes)+' bytes</div><button class="secondary" data-ingest-path="'+escapeAttr(file.path)+'" data-ingest-kind="'+escapeAttr(file.kind)+'">Ingest</button></div>').join('') || '<div class="result">Inbox is empty. Drop markdown/session files into .umos/inbox.</div>';
      openModal('Ingestion Inbox', html);
      setTimeout(() => {
        document.querySelectorAll('[data-ingest-path]').forEach(button => button.addEventListener('click', async () => {
          const result = await api('/api/ingest', { method: 'POST', body: JSON.stringify({ path: button.dataset.ingestPath, kind: button.dataset.ingestKind }) });
          log('Ingested ' + result.sourceId + (result.skipped ? ' (already known)' : ''));
          closeModal();
          await loadGraph();
        }));
      }, 0);
    }

    async function autoIngest() {
      openModal('Auto-Ingest Queue', '<div class="record"><div class="meta">Scanning inbox files and creating pending proposals...</div></div>');
      const result = await api('/api/auto-ingest', { method: 'POST', body: '{}' });
      const proposals = result.proposals || [];
      const html = '<div class="record"><h3>Auto-Ingest Complete</h3><div class="chips"><span class="chip">'+escapeHtml((result.ingested || []).length)+' ingested</span><span class="chip">'+escapeHtml(proposals.length)+' proposals</span></div>'
        + proposals.map(proposal => '<div class="result"><b>'+escapeHtml(proposal.proposalId)+'</b><div class="meta">'+escapeHtml(proposal.summary || '')+'</div><button class="secondary" data-open-proposal="'+escapeAttr(proposal.proposalId)+'">Review</button></div>').join('')
        + '</div>';
      openModal('Auto-Ingest Queue', html);
      setTimeout(() => {
        document.querySelectorAll('[data-open-proposal]').forEach(button => button.addEventListener('click', async () => {
          const data = await api('/api/proposals/'+encodeURIComponent(button.dataset.openProposal));
          const diff = JSON.parse(data.proposal.diff_json);
          openProposalReview({ proposalId: data.proposal.id, summary: data.proposal.summary, diff, governor: await api('/api/proposals/'+encodeURIComponent(data.proposal.id)+'/governor') });
        }));
      }, 0);
      await loadGraph();
      if (document.body.dataset.route === 'inbox') await renderInboxView();
      if (document.body.dataset.route === 'proposals') await renderProposalInbox();
    }

    async function showWatcher() {
      const status = await api('/api/watch/status');
      const profileData = await api('/api/watch/profiles');
      openModal('Auto-Ingestion Watcher', renderWatcher(status, profileData.profiles || []));
      setTimeout(() => {
        const start = document.getElementById('startWatcher');
        const stop = document.getElementById('stopWatcher');
        if (start) start.addEventListener('click', startWatcher);
        if (stop) stop.addEventListener('click', stopWatcher);
      }, 0);
    }

    function renderWatcher(status, profiles) {
      const folders = (status.folders || []).join('\\n');
      const last = status.lastResult ? '<pre>'+escapeHtml(JSON.stringify(status.lastResult, null, 2))+'</pre>' : '<div class="meta">No watcher run yet.</div>';
      const profileOptions = ['<option value="">Custom / Inbox</option>'].concat(profiles.map(profile => '<option value="'+escapeAttr(profile.id)+'" '+(status.profileId === profile.id ? 'selected' : '')+'>'+escapeHtml(profile.label)+' ('+escapeHtml(profile.folders.length)+' folders)</option>')).join('');
      return '<div class="record"><h3>Background Folder Watch</h3>'
        + '<div class="chips"><span class="chip">'+(status.running ? 'running' : 'stopped')+'</span><span class="chip">'+escapeHtml(status.runCount || 0)+' runs</span></div>'
        + '<div class="meta">Profiles recursively import approved local folders into proposals. Nothing is applied directly.</div>'
        + '<label>Profile<select id="watcherProfile">'+profileOptions+'</select></label>'
        + '<label><input id="watcherRecursive" type="checkbox" '+(status.recursive ? 'checked' : '')+' style="width:auto;margin-right:6px;">Recursive scan</label>'
        + '<label>Folders<textarea id="watcherFolders" style="min-height:72px;width:100%;box-sizing:border-box;background:#111417;color:#f4f1ea;border:1px solid #30363b;border-radius:6px;padding:8px;">'+escapeHtml(folders)+'</textarea></label>'
        + '<label>Debounce ms<input id="watcherDebounce" value="'+escapeAttr(status.debounceMs || 1500)+'"></label>'
        + '<div style="display:flex;gap:8px;"><button id="startWatcher">Start Watcher</button><button class="secondary" id="stopWatcher">Stop Watcher</button></div>'
        + (status.lastError ? '<div class="warn">'+escapeHtml(status.lastError)+'</div>' : '')
        + '<h2>Last Run</h2>'+last+'</div>';
    }

    async function startWatcher() {
      const raw = document.getElementById('watcherFolders').value || '';
      const folders = raw.split(/\\r?\\n|,/).map(x => x.trim()).filter(Boolean);
      const debounceMs = Number(document.getElementById('watcherDebounce').value || 1500);
      const profileId = document.getElementById('watcherProfile').value || undefined;
      const recursive = document.getElementById('watcherRecursive').checked;
      await api('/api/watch/start', { method: 'POST', body: JSON.stringify({ folders, debounceMs, profileId, recursive }) });
      log('Watcher started');
      toast('Watcher started');
      if (document.body.dataset.route !== 'inbox') await showWatcher();
    }

    async function stopWatcher() {
      await api('/api/watch/stop', { method: 'POST', body: '{}' });
      log('Watcher stopped');
      toast('Watcher stopped');
      if (document.body.dataset.route !== 'inbox') await showWatcher();
    }

    async function writeSummary() {
      openModal('Write Workspace Summary', '<div class="record"><div class="meta">Writing today\\'s workspace memory summary into NeuraKeep inbox...</div></div>');
      const result = await api('/api/write-summary', { method: 'POST', body: '{}' });
      const proposal = result.proposal;
      const html = '<div class="record"><h3>Workspace Summary Written</h3><div class="meta">'+escapeHtml(result.summaryPath || '')+'</div>'
        + (proposal ? '<button data-open-proposal="'+escapeAttr(proposal.proposalId)+'">Review Proposal</button>' : '<div class="meta">Summary was already ingested.</div>') + '</div>';
      openModal('Write Workspace Summary', html);
      setTimeout(() => {
        document.querySelectorAll('[data-open-proposal]').forEach(button => button.addEventListener('click', async () => {
          const data = await api('/api/proposals/'+encodeURIComponent(button.dataset.openProposal));
          const diff = JSON.parse(data.proposal.diff_json);
          openProposalReview({ proposalId: data.proposal.id, summary: data.proposal.summary, diff, governor: await api('/api/proposals/'+encodeURIComponent(data.proposal.id)+'/governor') });
        }));
      }, 0);
      await loadGraph();
    }

    async function showSelfPolicy() {
      const data = await api('/api/self-policy');
      const policy = data.policy || {};
      const section = (title, rows) => '<h2>'+escapeHtml(title)+'</h2>' + ((rows || []).map(row => '<div class="result">'+escapeHtml(row)+'</div>').join('') || '<div class="meta">None.</div>');
      const html = '<div class="record"><h3>NeuraKeep Self-Memory Policy</h3><div class="chips"><span class="chip">v'+escapeHtml(policy.version || 1)+'</span><span class="chip">queue-first</span></div>'
        + section('Auto Index Only', policy.autoIndexOnly)
        + section('Durable Auto-Apply', policy.durableAutoApply)
        + section('Queued Only', policy.queuedOnly)
        + section('Never Save', policy.neverSave)
        + section('Heartbeat / Session Close', policy.closeLoop)
        + '</div>';
      openModal('Self-Memory Policy', html);
    }

    async function showQuality() {
      const report = await api('/api/quality');
      const audit = await api('/api/governor/audit');
      const timeline = await api('/api/governor/timeline');
      const block = (title, rows, formatter) => '<h2>'+escapeHtml(title)+'</h2>' + ((rows || []).map(formatter).join('') || '<div class="meta">None.</div>');
      const html = '<div class="record">'
        + block('Duplicate Facts', report.duplicateFacts, row => '<div class="result"><b>'+escapeHtml(row.key)+'</b><div class="chips">'+row.factIds.map(id => '<button class="linkChip" data-open-record="'+escapeAttr(id)+'">'+escapeHtml(id)+'</button>').join('')+'<button class="linkChip" data-governor-stale="'+escapeAttr(row.factIds.join(','))+'">Mark stale</button></div></div>')
        + block('Conflicting Facts', report.conflictingFacts, row => '<div class="result"><b>'+escapeHtml(row.key)+'</b>'+row.values.map(v => '<div><button class="inlineLink" data-open-record="'+escapeAttr(v.factId)+'">'+escapeHtml(v.factId)+'</button>: '+escapeHtml(v.object)+' <button class="inlineLink" data-governor-merge="'+escapeAttr(v.factId)+'" data-governor-losers="'+escapeAttr(row.values.filter(x => x.factId !== v.factId).map(x => x.factId).join(','))+'">winner</button></div>').join('')+'<div class="chips"><button class="linkChip" data-governor-keep="1">Keep both</button><button class="linkChip" data-governor-stale="'+escapeAttr(row.values.map(v => v.factId).join(','))+'">Mark stale</button></div></div>')
        + block('Stale Facts', report.staleFacts, row => '<div class="result"><button class="inlineLink" data-open-record="'+escapeAttr(row.factId)+'">'+escapeHtml(row.factId)+'</button> '+escapeHtml(row.subject+' '+row.predicate+' review after '+row.reviewAfter)+'</div>')
        + block('Duplicate Failures', report.duplicateFailures, row => '<div class="result"><b>'+escapeHtml(row.key)+'</b><div class="chips">'+row.failureIds.map(id => '<button class="linkChip" data-open-record="'+escapeAttr(id)+'">'+escapeHtml(id)+'</button>').join('')+'</div></div>')
        + block('Supersede / Stale Timeline', timeline.timeline, row => '<div class="result"><button class="inlineLink" data-open-record="'+escapeAttr(row.id)+'">'+escapeHtml(row.id)+'</button><div class="meta">'+escapeHtml(row.subject+' '+row.predicate+' -> '+row.object)+'</div><div class="meta">valid_until '+escapeHtml(row.valid_until || '')+' / review_after '+escapeHtml(row.review_after || '')+' / supersedes '+escapeHtml((row.supersedes || []).join(', '))+'</div></div>')
        + block('Governor Audit', audit.entries, row => '<div class="result"><b>'+escapeHtml(row.action)+' '+escapeHtml(row.createdAt)+'</b><div class="meta">'+escapeHtml((row.targetIds || []).join(', '))+'</div>'+(row.undoable ? '<button class="secondary" data-governor-undo="'+escapeAttr(row.id)+'">Undo</button>' : '')+'</div>')
        + '</div>';
      openModal('Memory Quality', html);
    }

    async function resolveGovernor(body) {
      const result = await api('/api/governor/resolve', { method: 'POST', body: JSON.stringify(body) });
      log('Governor action: ' + result.action);
      toast('Governor action saved');
      if (document.body.dataset.route === 'quality') await renderQualityView(); else await showQuality();
      await loadGraph();
    }

    async function undoGovernor(auditId) {
      const result = await api('/api/governor/undo', { method: 'POST', body: JSON.stringify({ auditId }) });
      log('Governor undo restored ' + result.restored + ' rows');
      toast('Governor undo restored ' + result.restored + ' rows');
      if (document.body.dataset.route === 'quality') await renderQualityView(); else await showQuality();
      await loadGraph();
    }

    function focusNeighborhood(id) {
      if (!id) return;
      const ids = new Set([id]);
      for (const edge of graph.edges) {
        if (edge.from === id) ids.add(edge.to);
        if (edge.to === id) ids.add(edge.from);
      }
      focusIds = ids;
      graphMode.value = 'focused';
      selectedNodeId = id;
      render();
      closeModal();
    }

    function expandNeighborhood(id) {
      if (!id) return;
      const ids = focusIds ? new Set(focusIds) : new Set([id]);
      ids.add(id);
      for (const edge of graph.edges) {
        if (edge.from === id) ids.add(edge.to);
        if (edge.to === id) ids.add(edge.from);
        if (ids.has(edge.from)) ids.add(edge.to);
        if (ids.has(edge.to)) ids.add(edge.from);
      }
      focusIds = ids;
      graphMode.value = 'focused';
      selectedNodeId = id;
      render();
      closeModal();
    }

    async function showCitationPreview(id, event) {
      if (!id) return;
      if (modalBackdrop.classList.contains('open')) return;
      citationPreview.innerHTML = '<div class="meta">Loading citation...</div>';
      positionCitationPreview(event);
      citationPreview.classList.add('open');
      try {
        const data = await api('/api/citations/'+encodeURIComponent(id)+'/preview');
        const preview = data.preview || {};
        citationPreview.innerHTML = '<b>'+escapeHtml(preview.title || id)+'</b><div class="meta">'+escapeHtml(preview.type || '')+' / '+escapeHtml(preview.subtitle || preview.id || '')+'</div>'
          + '<div class="markdown" style="max-height:170px;padding:8px;margin-top:8px;">'+renderMarkdown(String(preview.markdown || preview.snippet || '').slice(0, 1600))+'</div>'
          + '<div class="chips"><button class="linkChip" data-open-record="'+escapeAttr(id)+'">Open node</button><button class="linkChip" data-focus-record="'+escapeAttr(id)+'">Focus graph</button></div>';
      } catch (error) {
        citationPreview.innerHTML = '<div class="warn">'+escapeHtml(error.message || String(error))+'</div>';
      }
    }

    function positionCitationPreview(event) {
      const x = Math.min(event.clientX + 14, window.innerWidth - citationPreview.offsetWidth - 12);
      const y = Math.min(event.clientY + 14, window.innerHeight - citationPreview.offsetHeight - 12);
      citationPreview.style.left = Math.max(12, x) + 'px';
      citationPreview.style.top = Math.max(12, y) + 'px';
    }

    function hideCitationPreview() {
      citationPreview.classList.remove('open');
      citationPreview.innerHTML = '';
    }

    function updateButtonStates() {
      document.getElementById('pinSelected').disabled = !selectedNodeId;
      document.getElementById('collapseSelected').disabled = !selectedNodeId;
      document.getElementById('apply').disabled = !document.getElementById('proposalId').value.trim();
    }

    async function withBusy(button, fn) {
      if (!button || button.disabled) return;
      const old = button.textContent;
      button.disabled = true;
      button.textContent = '...';
      try {
        return await fn();
      } catch (error) {
        toast(error.message || String(error), 'error');
        throw error;
      } finally {
        button.textContent = old;
        button.disabled = false;
        updateButtonStates();
      }
    }

    function toast(message, type) {
      const node = document.createElement('div');
      node.className = 'toast ' + (type || '');
      node.textContent = message;
      toastStack.appendChild(node);
      setTimeout(() => node.remove(), 3600);
    }

    function parseJsonArray(value) {
      try {
        const parsed = JSON.parse(String(value || '[]'));
        return Array.isArray(parsed) ? parsed.map(String) : [];
      } catch {
        return [];
      }
    }

    function kv(label, value, html) {
      if (!value) return '';
      return '<div class="kv"><span>'+escapeHtml(label)+'</span><span>'+(html ? String(value) : escapeHtml(String(value)))+'</span></div>';
    }

    function zoomBy(multiplier, anchor) {
      const rect = svg.getBoundingClientRect();
      const point = anchor || { x: rect.width / 2, y: rect.height / 2 };
      setZoom(view.scale * multiplier, point);
    }

    function setZoom(nextScale, anchor) {
      const oldScale = view.scale;
      const newScale = clamp(nextScale, 0.35, 4);
      if (newScale === oldScale) return;
      view.x = anchor.x - ((anchor.x - view.x) * newScale) / oldScale;
      view.y = anchor.y - ((anchor.y - view.y) * newScale) / oldScale;
      view.scale = newScale;
      applyView();
    }

    function resetZoom() {
      view.x = 0;
      view.y = 0;
      view.scale = 1;
      applyView();
    }

    function applyView() {
      if (viewport) {
        viewport.setAttribute('transform', 'translate('+view.x+' '+view.y+') scale('+view.scale+')');
      }
      zoomStatus.textContent = Math.round(view.scale * 100) + '%';
    }

    function onWheel(event) {
      event.preventDefault();
      const point = svgPoint(event);
      zoomBy(event.deltaY < 0 ? 1.12 : 1 / 1.12, point);
    }

    function onMouseDown(event) {
      const node = event.target.closest && event.target.closest('g.node');
      if (node && event.altKey) {
        event.preventDefault();
        const point = graphPoint(event);
        nodeDrag = { id: node.dataset.id, start: point };
        selectedNodeId = node.dataset.id;
        return;
      }
      if (event.shiftKey) {
        const point = svgPoint(event);
        const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        rect.setAttribute('class', 'lasso');
        rect.setAttribute('x', String(point.x));
        rect.setAttribute('y', String(point.y));
        rect.setAttribute('width', '0');
        rect.setAttribute('height', '0');
        svg.appendChild(rect);
        lasso = { start: point, current: point, rect };
        return;
      }
      if (node) return;
      dragging = { x: event.clientX, y: event.clientY, startX: view.x, startY: view.y };
      svg.classList.add('dragging');
    }

    function onMouseMove(event) {
      if (nodeDrag) {
        const point = graphPoint(event);
        graphState.layout = graphState.layout || {};
        graphState.layout[nodeDrag.id] = { x: point.x, y: point.y, pinned: true };
        const pinned = new Set(graphState.pinned || []);
        pinned.add(nodeDrag.id);
        graphState.pinned = Array.from(pinned);
        render();
        return;
      }
      if (lasso) {
        const point = svgPoint(event);
        lasso.current = point;
        const x = Math.min(lasso.start.x, point.x), y = Math.min(lasso.start.y, point.y);
        const width = Math.abs(point.x - lasso.start.x), height = Math.abs(point.y - lasso.start.y);
        lasso.rect.setAttribute('x', String(x));
        lasso.rect.setAttribute('y', String(y));
        lasso.rect.setAttribute('width', String(width));
        lasso.rect.setAttribute('height', String(height));
        return;
      }
      if (!dragging) return;
      view.x = dragging.startX + event.clientX - dragging.x;
      view.y = dragging.startY + event.clientY - dragging.y;
      applyView();
    }

    function onMouseUp() {
      if (nodeDrag) {
        saveGraphState();
        nodeDrag = null;
        toast('Node pinned');
        return;
      }
      if (lasso) {
        const svgRect = svg.getBoundingClientRect();
        const x1 = Math.min(lasso.start.x, lasso.current.x) + svgRect.left;
        const x2 = Math.max(lasso.start.x, lasso.current.x) + svgRect.left;
        const y1 = Math.min(lasso.start.y, lasso.current.y) + svgRect.top;
        const y2 = Math.max(lasso.start.y, lasso.current.y) + svgRect.top;
        const picked = new Set();
        svg.querySelectorAll('g.node').forEach(node => {
          const circle = node.querySelector('circle:not(.hit)');
          const box = circle.getBoundingClientRect();
          const cx = box.left + box.width / 2, cy = box.top + box.height / 2;
          if (cx >= x1 && cx <= x2 && cy >= y1 && cy <= y2) picked.add(node.dataset.id);
        });
        lasso.rect.remove();
        lasso = null;
        if (picked.size > 0) {
          focusIds = picked;
          render();
        }
        return;
      }
      dragging = null;
      svg.classList.remove('dragging');
    }

    function svgPoint(event) {
      const rect = svg.getBoundingClientRect();
      return { x: event.clientX - rect.left, y: event.clientY - rect.top };
    }

    function graphPoint(event) {
      const point = svgPoint(event);
      return { x: (point.x - view.x) / view.scale, y: (point.y - view.y) / view.scale };
    }

    function clamp(value, min, max) {
      return Math.max(min, Math.min(max, value));
    }

    function log(message) { actionLog.textContent = message; }
    function escapeHtml(s) { return String(s || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
    function escapeAttr(s) { return escapeHtml(s); }
  </script>
  <script src="app-shell.js"></script>
</body>
</html>`;
}

export function appShellCss(): string {
  return `/* NeuraKeep routed app shell asset. */
:root { --neurakeep-accent: #4b9f88; --neurakeep-danger: #ff6b6b; --neurakeep-panel: #171a1d; }
.modal textarea { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 12px; line-height: 1.45; }
body[data-route="search"] .toolbar { outline: 1px solid var(--neurakeep-accent); }
body[data-route="quality"] #quality,
body[data-route="inbox"] #inbox,
body[data-route="settings"] #selfPolicy { border-color: var(--neurakeep-accent); }
.routeStatus { position: fixed; right: 12px; bottom: 12px; z-index: 10; background: rgba(23,26,29,.86); border: 1px solid #30363b; border-radius: 8px; padding: 7px 10px; color: #a8b0b8; font-size: 12px; pointer-events: none; }
`;
}

export function appShellJs(): string {
  return `// NeuraKeep small routed TS app companion, emitted as browser JS.
(() => {
  const state = { version: 2, route: 'graph' };
  const status = document.createElement('div');
  status.className = 'routeStatus';
  document.addEventListener('DOMContentLoaded', () => {
    document.body.appendChild(status);
    updateRouteStatus();
  });
  window.addEventListener('hashchange', updateRouteStatus);
  function updateRouteStatus() {
    state.route = (location.hash || '#graph').replace(/^#/, '') || 'graph';
    status.textContent = 'Route: ' + state.route;
    window.__NEURAKEEP_APP_SHELL__ = state;
  }
})();
`;
}

