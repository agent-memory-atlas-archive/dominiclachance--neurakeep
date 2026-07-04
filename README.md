# NeuraKeep

NeuraKeep is a local-first memory system for AI agents.

It gives Claude Desktop, Claude Code, Codex, OpenClaw, Cursor-style tools, and other MCP clients
a shared, source-cited memory layer that runs on your own machine.

## What It Does

- Imports Markdown, text, JSONL, and PDFs into a local vault
- Preserves raw sources and extracts cited memory proposals
- Lets you review memory before it becomes durable
- Searches across sources, facts, events, failures, and decisions
- Shows a graph of related memory with progressive expansion
- Exposes MCP tools for agents:
  - `memory_search`
  - `memory_read`
  - `memory_explain_sources`
  - `memory_propose_update`
  - `memory_apply_update`

The core rule is simple: agents can propose memory, but durable memory should be reviewable and
source-cited.

## Local Install

Requirements:

- Node.js 20+
- npm

```bash
npm install
npm run build:all
node dist/cli/index.js init --root .umos
node dist/cli/index.js serve --root .umos --host 127.0.0.1 --port 8765 --ui --read-write
```

Open:

```text
http://127.0.0.1:8765/index.html
```

## CLI Examples

```bash
node dist/cli/index.js ingest README.md --root .umos --kind markdown --space personal --trust-level trusted --origin manual --sensitivity internal
node dist/cli/index.js search "what should my agents remember?" --root .umos --space personal --neighbors 1
node dist/cli/index.js propose latest --root .umos
node dist/cli/index.js apply <proposal-id> --root .umos
node dist/cli/index.js mcp --root .umos
```

## Local MCP Setup

Example stdio MCP config:

```json
{
  "command": "node",
  "args": [
    "C:/path/to/neurakeep/dist/cli/index.js",
    "mcp",
    "--root",
    "C:/path/to/neurakeep/.umos"
  ]
}
```

Local HTTP mode:

```bash
node dist/cli/index.js serve --root .umos --host 127.0.0.1 --port 8765 --ui
```

Use `--token` or `NEURAKEEP_MCP_TOKEN` before exposing any HTTP endpoint outside your machine.

## Open Source Scope

This repository is the local, self-managed NeuraKeep core: CLI, local vault, local UI,
local MCP, imports, search, graph, proposal review, and memory quality tools.

## Docs

- [Manual Imports](docs/MANUAL_IMPORTS.md)
- [MCP Integrations](docs/MCP_INTEGRATIONS.md)
- [Open Source Core](docs/OPEN_SOURCE.md)

## Development Checks

```bash
npm run typecheck
npm run build:all
npm test
npm run e2e
```

## License

Apache-2.0
