export interface SelfMemoryPolicy {
  version: number;
  autoIndexOnly: string[];
  durableAutoApply: string[];
  queuedOnly: string[];
  neverSave: string[];
  closeLoop: string[];
}

export const selfMemoryPolicy: SelfMemoryPolicy = {
  version: 2,
  autoIndexOnly: [
    "Local raw sources can be indexed for search when imported from approved folders.",
    "Workspace daily memory files can be synced on heartbeat/session-close.",
    "Manual PDF/markdown uploads can be copied into raw episodes and indexed immediately."
  ],
  durableAutoApply: [
    "None. Events, facts, failures, decisions, and do-not-repeat guidance stay proposal-reviewed until Dominic explicitly changes this policy."
  ],
  queuedOnly: [
    "All extracted durable memory candidates, including low-risk local notes.",
    "Raw OpenClaw, Codex, Claude, or browser sessions.",
    "Screenshots, QA artifacts, code diffs, and command logs.",
    "Conversation summaries that mention people, clients, or private project details."
  ],
  neverSave: [
    "Secrets, credentials, API keys, bearer tokens, private keys, and auth cookies.",
    "Full unredacted third-party messages unless Dominic explicitly asks to preserve them.",
    "Public outreach drafts, emails, or social messages before explicit approval.",
    "Production access details beyond high-level operational notes."
  ],
  closeLoop: [
    "Heartbeat/session-close integrations may write only a short summary file to inbox.",
    "The summary must be proposed for review before becoming durable memory.",
    "Governor checks must block or warn on duplicates, conflicts, stale facts, and sensitivity."
  ]
};
