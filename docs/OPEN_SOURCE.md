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

Before pushing a public release:

- Run `npm ci` on Node.js 22 or newer.
- Run `npm run check:secrets`.
- Run `npm run release:check`.
- Run `npm run typecheck`, `npm run build:all`, `npm test`, and `npm run e2e`.
- Run `npm pack --dry-run` and confirm the manifest contains both `dist/` and `web-dist/`.
- Publish only from a freshly verified clean clone.

The release check refuses `.umos`, `.env*`, raw memory, private hosted docs, tracked build/test
artifacts, and Firebase implementation imports. Generated `dist/` and `web-dist/` directories are
allowed only as untracked package outputs and are scanned before publishing.
