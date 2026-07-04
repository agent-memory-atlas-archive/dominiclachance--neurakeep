# NeuraKeep MCP Integrations

NeuraKeep exposes the same memory tools over stdio MCP and local HTTP MCP.

## Tools

- `memory_search` - ranked search with citations, confidence guidance, related failures, and neighbor context.
- `memory_read` - read a source, section, event, fact, failure, or proposal.
- `memory_explain_sources` - inspect citation provenance.
- `memory_propose_update` - create a pending proposal from an ingested source.
- `memory_apply_update` - apply a reviewed pending proposal.

## Local Diagnostics

When `umos serve --ui` is running, use:

```http
GET /api/integrations/status
GET /api/workflow/daily-loop
```

`/api/integrations/status` reports the local HTTP endpoint, stdio command, known client config files, available tools, and smoke-test prompts.
`/api/workflow/daily-loop` combines integration status, watcher status, import/OCR support, quality backlog, and recommended next actions.

To queue a session-close summary and sync workspace memory without applying durable facts:

```http
POST /api/workflow/daily-loop
{
  "queueSummary": true,
  "reason": "session-close"
}
```

The workflow loop is queue-first. It indexes raw sources and creates proposals; it does not auto-apply durable memory.

## OpenClaw

Use stdio MCP for local agent memory. The command should point at the built CLI:

```json
{
  "mcpServers": {
    "neurakeep": {
      "command": "node",
      "args": ["C:/Users/macro/.openclaw/workspace/projects/universal-memory-os/dist/cli/index.js", "mcp", "--root", "C:/Users/macro/.openclaw/workspace/projects/universal-memory-os/.umos"]
    }
  }
}
```

Keep write behavior queue-first: agents may call `memory_propose_update`, but durable application should stay review-gated.

## Claude Code

Use:

```powershell
claude mcp add neurakeep node C:/Users/macro/.openclaw/workspace/projects/universal-memory-os/dist/cli/index.js mcp --root C:/Users/macro/.openclaw/workspace/projects/universal-memory-os/.umos
claude mcp get neurakeep
```

Smoke expectation: `claude mcp get neurakeep` reports connected, and `tools/list` includes the five NeuraKeep tools above.

## Claude Desktop

Add the same stdio command to `claude_desktop_config.json`. Restart Claude Desktop after editing. Prefer stdio locally; use HTTP only for browser/tunnel testing.

## Codex

For local Codex workflows, expose NeuraKeep through the same MCP stdio command when the MCP host supports it. If using HTTP, run:

```powershell
node dist/cli/index.js serve --root .umos --ui --read-write --host 127.0.0.1 --port 8765
```

Then call `/mcp` with JSON-RPC. Read-only mode disables proposal/apply tools; read-write mode still produces proposals first.

## Smoke Test

1. Build: `npm run build:all`
2. Stdio initialize: send JSON-RPC `initialize`
3. Tool list: send JSON-RPC `tools/list`
4. Search: call `memory_search` for `do not repeat`
5. Read: call `memory_read` for one result ID

Do not mark an integration healthy unless the search response includes structured content, citation IDs, and `guidance.recommendedNextStep`.
