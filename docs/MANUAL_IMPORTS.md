# Manual Memory Imports

NeuraKeep can manually ingest local files as cited raw sources. Ingestion makes the source searchable immediately and can create a pending proposal for durable structured memory.

## Supported Files

- Markdown: `.md`, `.markdown`
- Notes/text: `.txt`
- Session transcripts: `.jsonl`
- PDFs: `.pdf`

PDF imports preserve the original PDF in `.umos/raw/episodes` and index extracted text as sections.
If a PDF has no embedded text, NeuraKeep attempts local OCR with Poppler `pdftoppm` and `tesseract`.
OCR is local-only, indexes the first 12 rendered pages, and queues the extracted text for proposal review like any other import.

## CLI

```powershell
node dist/cli/index.js ingest "C:\path\to\note.md" --root .umos --space project --trust-level observed --origin manual --sensitivity internal
node dist/cli/index.js ingest "C:\path\to\paper.pdf" --root .umos --kind pdf --space project --trust-level observed --origin manual --sensitivity internal
node dist/cli/index.js propose latest --root .umos
```

Use `--json` for scripts. Use `umos apply <proposal-id>` only after reviewing the proposal.

## Local App

Open the Inbox route and use `Manual Import` with the local file path. Paths are allowed from the workspace, the NeuraKeep vault, or the user home directory, so downloaded PDFs in `Downloads` are supported.

You can also drag/drop PDFs, Markdown, text, or JSONL session files into the Inbox `Manual Import` drop zone. Dropped files are copied into `.umos/inbox/manual-uploads`, indexed as raw sources, and queued as proposals for durable memory review.

You can also drop a file into `.umos/inbox`, open the Inbox route, then click `Ingest`.

For downloaded PDFs, putting the PDF in `.umos/inbox` is enough; NeuraKeep detects `.pdf` automatically.

## HTTP API

Check supported import types, approved roots, queue policy, and OCR status:

```http
GET /api/import/supported
GET /api/import/ocr-health
```

```http
POST /api/import
{
  "path": "C:\\path\\to\\paper.pdf",
  "kind": "auto"
}
```

The response includes the ingestion result plus a pending proposal when extraction produced new durable-memory candidates.

Drag/drop uploads use:

```http
POST /api/import/upload
{
  "fileName": "paper.pdf",
  "kind": "pdf",
  "contentBase64": "..."
}
```

## Policy

- Manual imports can be searched after ingestion.
- Durable facts/events/failures are still proposal-reviewed.
- Secrets and prompt-injection markers are scanned during ingestion.
- Watcher/session imports are queue-first and may be redacted before indexing.
