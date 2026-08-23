export const NEURAKEEP_VERSION = "0.2.0";

export const NEURAKEEP_SERVER_INFO = {
  name: "neurakeep",
  version: NEURAKEEP_VERSION
} as const;

const toolDefinitions: Array<Record<string, unknown>> = [
  {
    name: "memory_search",
    description: "Search NeuraKeep memory with citations, confidence guidance, related failure warnings, and optional neighbor context.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string" },
        limit: { type: "number" },
        neighbors: { type: "number" },
        space: { type: "string" },
        project: { type: "string" },
        include_secret: { type: "boolean" }
      },
      required: ["query"]
    }
  },
  {
    name: "memory_read",
    description: "Read a source, section, fact, event, failure, or proposal by ID.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"]
    }
  },
  {
    name: "memory_explain_sources",
    description: "Explain source citations, hashes, paths, timestamps, and snippets.",
    inputSchema: {
      type: "object",
      properties: { source_ids: { type: "array", items: { type: "string" } } },
      required: ["source_ids"]
    }
  },
  {
    name: "memory_propose_update",
    description: "Create a pending cited structured-memory proposal from an ingested source.",
    inputSchema: {
      type: "object",
      properties: {
        source_id: { type: "string" },
        extractor: { type: "string" },
        extractor_command: { type: "string" }
      },
      required: ["source_id"]
    }
  },
  {
    name: "memory_apply_update",
    description: "Apply a pending proposal into durable memory and compile the wiki.",
    inputSchema: {
      type: "object",
      properties: { proposal_id: { type: "string" } },
      required: ["proposal_id"]
    }
  }
];

export function neurakeepTools(): Array<Record<string, unknown>> {
  return structuredClone(toolDefinitions);
}

export function neurakeepServerCard(): Record<string, unknown> {
  return {
    serverInfo: { ...NEURAKEEP_SERVER_INFO },
    authentication: {
      required: true,
      schemes: ["oauth2"]
    },
    tools: neurakeepTools(),
    resources: [],
    prompts: []
  };
}
