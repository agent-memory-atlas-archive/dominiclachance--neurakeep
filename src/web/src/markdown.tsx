import React from "react";

export function Markdown({ text }: { text: string }): React.ReactElement {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const nodes: React.ReactNode[] = [];
  let list: React.ReactNode[] = [];
  let listType: "ul" | "ol" | "" = "";
  let code: string[] | null = null;

  const flushList = (): void => {
    if (!listType) return;
    const key = `list-${nodes.length}`;
    nodes.push(listType === "ul" ? <ul key={key}>{list}</ul> : <ol key={key}>{list}</ol>);
    list = [];
    listType = "";
  };

  const flushCode = (): void => {
    if (!code) return;
    nodes.push(
      <pre key={`code-${nodes.length}`}>
        <code>{code.join("\n")}</code>
      </pre>
    );
    code = null;
  };

  for (const raw of lines) {
    const line = raw.replace(/\s+$/, "");
    if (line.startsWith("```")) {
      if (code) flushCode();
      else {
        flushList();
        code = [];
      }
      continue;
    }
    if (code) {
      code.push(line);
      continue;
    }
    if (!line.trim()) {
      flushList();
      continue;
    }
    const heading = /^(#{1,3})\s+(.+)$/.exec(line);
    if (heading) {
      flushList();
      const level = heading[1].length;
      const children = inline(heading[2]);
      if (level === 1) nodes.push(<h1 key={`h-${nodes.length}`}>{children}</h1>);
      if (level === 2) nodes.push(<h2 key={`h-${nodes.length}`}>{children}</h2>);
      if (level === 3) nodes.push(<h3 key={`h-${nodes.length}`}>{children}</h3>);
      continue;
    }
    if (/^---+$/.test(line.trim())) {
      flushList();
      nodes.push(<hr key={`hr-${nodes.length}`} />);
      continue;
    }
    const bullet = /^[-*]\s+(.+)$/.exec(line);
    if (bullet) {
      if (listType !== "ul") {
        flushList();
        listType = "ul";
      }
      list.push(<li key={`li-${list.length}`}>{inline(bullet[1])}</li>);
      continue;
    }
    const numbered = /^\d+[.)]\s+(.+)$/.exec(line);
    if (numbered) {
      if (listType !== "ol") {
        flushList();
        listType = "ol";
      }
      list.push(<li key={`li-${list.length}`}>{inline(numbered[1])}</li>);
      continue;
    }
    const quote = /^>\s?(.+)$/.exec(line);
    if (quote) {
      flushList();
      nodes.push(<blockquote key={`q-${nodes.length}`}>{inline(quote[1])}</blockquote>);
      continue;
    }
    flushList();
    nodes.push(<p key={`p-${nodes.length}`}>{inline(line)}</p>);
  }
  flushCode();
  flushList();
  return <div className="markdown">{nodes}</div>;
}

function inline(value: string): React.ReactNode[] {
  const chunks: React.ReactNode[] = [];
  const pattern = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\(https?:\/\/[^\s)]+\))/g;
  let last = 0;
  for (const match of value.matchAll(pattern)) {
    if (match.index !== undefined && match.index > last) chunks.push(value.slice(last, match.index));
    const token = match[0];
    if (token.startsWith("**")) chunks.push(<strong key={chunks.length}>{token.slice(2, -2)}</strong>);
    else if (token.startsWith("`")) chunks.push(<code key={chunks.length}>{token.slice(1, -1)}</code>);
    else {
      const link = /^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/.exec(token);
      if (link) {
        chunks.push(
          <a key={chunks.length} href={link[2]} target="_blank" rel="noreferrer">
            {link[1]}
          </a>
        );
      }
    }
    last = (match.index ?? 0) + token.length;
  }
  if (last < value.length) chunks.push(value.slice(last));
  return chunks;
}
