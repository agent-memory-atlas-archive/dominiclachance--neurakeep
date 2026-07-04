export interface IngestSection {
  heading: string | null;
  body: string;
  ordinal: number;
  tokenEstimate: number;
}

const maxFallbackChars = 2400;

export function splitContentIntoSections(kind: string, content: string): IngestSection[] {
  if (kind === "session") {
    return splitTranscript(content);
  }

  return splitMarkdown(content);
}

function splitMarkdown(content: string): IngestSection[] {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const sections: Array<{ heading: string | null; lines: string[] }> = [];
  let current: { heading: string | null; lines: string[] } = { heading: null, lines: [] };

  for (const line of lines) {
    const headingMatch = /^(#{1,6})\s+(.+?)\s*$/.exec(line);
    if (headingMatch) {
      pushSection(sections, current);
      current = { heading: headingMatch[2] ?? null, lines: [line] };
      continue;
    }

    current.lines.push(line);
  }

  pushSection(sections, current);

  const markdownSections = sections
    .map((section) => ({
      heading: section.heading,
      body: section.lines.join("\n").trim()
    }))
    .filter((section) => section.body.length > 0);

  if (markdownSections.length === 0) {
    return [];
  }

  if (markdownSections.length === 1 && markdownSections[0] && markdownSections[0].body.length > maxFallbackChars) {
    return chunkText(markdownSections[0].body);
  }

  return markdownSections.map((section, index) => toIngestSection(section, index));
}

function splitTranscript(content: string): IngestSection[] {
  const normalized = content.replace(/\r\n/g, "\n");
  const blocks = normalized
    .split(/\n(?=(?:user|assistant|system|tool|developer|agent|human)\s*:)/i)
    .map((block) => block.trim())
    .filter(Boolean);

  if (blocks.length > 1) {
    return blocks.map((block, index) => {
      const headingMatch = /^([A-Za-z][\w -]{0,30})\s*:/.exec(block);
      return toIngestSection(
        {
          heading: headingMatch ? headingMatch[1] ?? null : null,
          body: block
        },
        index
      );
    });
  }

  return splitMarkdown(content);
}

function pushSection(
  sections: Array<{ heading: string | null; lines: string[] }>,
  section: { heading: string | null; lines: string[] }
): void {
  if (section.lines.join("\n").trim().length > 0) {
    sections.push(section);
  }
}

function chunkText(content: string): IngestSection[] {
  const chunks: IngestSection[] = [];
  let start = 0;
  while (start < content.length) {
    const end = Math.min(content.length, start + maxFallbackChars);
    chunks.push(
      toIngestSection(
        {
          heading: `Chunk ${chunks.length + 1}`,
          body: content.slice(start, end).trim()
        },
        chunks.length
      )
    );
    start = end;
  }
  return chunks;
}

function toIngestSection(
  section: { heading: string | null; body: string },
  index: number
): IngestSection {
  return {
    heading: section.heading,
    body: section.body,
    ordinal: index,
    tokenEstimate: estimateTokens(section.body)
  };
}

function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}
