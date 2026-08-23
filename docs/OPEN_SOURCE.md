# NeuraKeep Open Source Core

NeuraKeep has a free open-source local core and a commercial hosted path.

## Free OSS Core

The open-source version is meant to be useful by itself:

- Local SQLite vault
- Markdown/PDF/text imports
- Source-cited search
- Graph UI
- Proposal review
- Memory Governor
- Local HTTP MCP
- Stdio MCP for Claude Desktop, Claude Code, Codex, OpenClaw, and other agents

The OSS repo intentionally excludes:

- Private vault data under `.umos`
- Deployment keys
- Production bundles and tarballs
- Hosted service credentials
- Hosted/Firebase/team implementation files

## Commercial Hosted Layer

The hosted product adds:

- Google sign-in secured by Firebase Auth
- Tenants and spaces
- Shared/team memory
- Remote MCP over HTTPS
- Hosted audit logs
- Managed storage and backups
- Connector workers
- Admin policies
- Support and implementation

## License

The core is Apache-2.0. The commercial hosted service, managed connectors, deployment infrastructure,
and enterprise policy packs can remain proprietary while the local core stays free and forkable.

## Safe Publishing Checklist

Install the local guardrails once:

```powershell
git config core.hooksPath .githooks
```

Before pushing a public release:

- Run `npm run check:secrets`.
- Run `npm run typecheck`, `npm run build:all`, `npm test`, and `npm run e2e`.
- Run `npm run package:oss`.
- Run `node scripts/release-check.mjs release/oss`.
- Publish only from `release/oss` or from a freshly verified clean clone.

The release check refuses `.umos`, `.env*`, raw memory, generated build/test artifacts,
private hosted docs, and Firebase implementation imports.
