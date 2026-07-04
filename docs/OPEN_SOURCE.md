# NeuraKeep Open Source Core

NeuraKeep's public repository is the local-install core.

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

The public repo intentionally excludes:

- Private vault data under `.umos`
- Deployment keys
- Production bundles and tarballs
- Managed-service credentials, infrastructure, and private planning notes

## License

The local core is Apache-2.0.

## Safe Publishing Checklist

Before pushing a release:

- Run `rg "BEGIN .*PRIVATE|API_KEY|SECRET|PASSWORD"`.
- Confirm `.umos`, `dist`, `web-dist`, `*.pem`, `*.tgz`, and `.env*` are ignored.
- Run `npm run typecheck`, `npm run build:all`, `npm test`, and `npm run e2e`.
- Publish from the `projects/universal-memory-os` repo, not the dirty parent workspace.
