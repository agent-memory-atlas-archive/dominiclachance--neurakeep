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

## Remote MCP For Hosted NeuraKeep

Hosted deployments expose JSON-RPC over HTTPS at `/mcp`.

Authentication options:

- Browser/user sessions: `Authorization: Bearer <Google ID token verified by Firebase Auth>`
- Customer agent sessions: `Authorization: Bearer <tenant-bound token created in Settings>`
- Deployment health/admin sessions: `Authorization: Bearer <system service token>`

Customer MCP tokens are stored only as SHA-256 hashes, inherit the owner's Stripe entitlement, and
resolve to the same isolated tenant vault as the owner's Firebase session. Revocation takes effect on
the next request. A token from one account cannot select or read another account's vault.

Start a hosted server with Google sign-in/Firebase Auth, Stripe entitlements, and service-token auth:

```powershell
$env:NEURAKEEP_PUBLIC_URL = "https://app.neurakeep.com"
$env:NEURAKEEP_SERVICE_TOKENS = "sha256:<sha256-of-issued-token>"
node dist/cli/index.js serve --root .umos --host 127.0.0.1 --port 8765 --hosted --firebase-project <project-id>
```

Discovery endpoints:

```http
GET /.well-known/oauth-protected-resource/mcp
GET /.well-known/oauth-authorization-server
GET /api/billing/status
GET /api/hosted/storage
```

Smithery and other registries can read the public, metadata-only server card without authenticating to a memory vault:

```http
GET /.well-known/mcp/server-card.json
```

The card is generated from the same manifest as MCP `tools/list`, declares OAuth2 authentication, and contains only server metadata and tool input schemas. It must never include credentials, user identifiers, source content, or example memory records.

The OAuth metadata is for connector discovery. Signed-in hosted customers create and revoke their
own tenant-bound MCP tokens in Settings. The raw value is displayed once and must never be committed
to a repository.

## Codex

For local Codex workflows, expose NeuraKeep through the same MCP stdio command when the MCP host supports it. If using HTTP, run:

```powershell
node dist/cli/index.js serve --root .umos --ui --read-write --host 127.0.0.1 --port 8765
```

Then call `/mcp` with JSON-RPC. Read-only mode disables proposal/apply tools; read-write mode still produces proposals first.

For remote Codex/OpenClaw/Claude connectors, configure the HTTPS `/mcp` URL and pass the customer's
tenant-bound token as a bearer token. `NEURAKEEP_SERVICE_TOKENS` is reserved for deployment health
and administration, not shared customer access.

## Smoke Test

1. Build: `npm run build:all`
2. Stdio initialize: send JSON-RPC `initialize`
3. Tool list: send JSON-RPC `tools/list`
4. Search: call `memory_search` for `do not repeat`
5. Read: call `memory_read` for one result ID

Do not mark an integration healthy unless the search response includes structured content, citation IDs, and `guidance.recommendedNextStep`.
