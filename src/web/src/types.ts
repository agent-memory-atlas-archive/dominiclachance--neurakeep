export type RouteName = "graph" | "search" | "inbox" | "proposals" | "quality" | "settings";

export interface GraphNode {
  id: string;
  label: string;
  type: "root" | "source" | "section" | "event" | "fact" | "failure";
  space?: string;
  trustLevel?: string;
  sensitivity?: string;
}

export interface GraphEdge {
  from: string;
  to: string;
  type: "root" | "contains" | "cites" | "next";
}

export interface GraphState {
  mode?: string;
  clusterBy?: string;
  edgeTypes?: string[];
  layout?: Record<string, { x: number; y: number; pinned?: boolean }>;
  pinned?: string[];
  collapsed?: string[];
  collapsedBranches?: string[];
  physics?: {
    repulsion: number;
    linkDistance: number;
    clusterStrength: number;
    collisionRadius: number;
    iterations: number;
  };
}

export interface GraphPayload {
  nodes: GraphNode[];
  edges: GraphEdge[];
  state: GraphState;
  hiddenNeighbors?: Record<string, number>;
  meta?: {
    totalNodes: number;
    totalEdges: number;
    visibleNodes: number;
    visibleEdges: number;
    focusId: string | null;
    depth: number;
    limit: number;
    truncated: boolean;
  };
}

export interface ProposalSummary {
  id: string;
  createdAt: string;
  status: string;
  kind: string;
  summary: string;
  sourceIds?: string[];
  sectionIds?: string[];
  space?: string;
  trustLevel?: string;
  sensitivity?: string;
  counts: { events: number; facts: number; failures: number };
  warningCount: number;
  blockedCount: number;
  clean: boolean;
}

export interface ProposalReview {
  proposalId: string;
  summary: string;
  diff: ProposalDiff;
  governor?: { warnings: GovernorWarning[]; blocked: GovernorWarning[] };
}

export interface ProposalDiff {
  events: ProposalEvent[];
  facts: ProposalFact[];
  failures: ProposalFailure[];
}

export interface ProposalItemBase {
  id?: string;
  confidence?: number;
  sourceIds?: string[];
  sectionIds?: string[];
}

export interface ProposalEvent extends ProposalItemBase {
  summary?: string;
}

export interface ProposalFact extends ProposalItemBase {
  subject?: string;
  predicate?: string;
  object?: string;
}

export interface ProposalFailure extends ProposalItemBase {
  attempted?: string;
  failedBecause?: string;
  doNotRepeat?: string;
}

export interface GovernorWarning {
  severity: "warn" | "block";
  kind: string;
  itemType: string;
  itemId: string;
  message: string;
  relatedIds: string[];
}

export interface Toast {
  id: string;
  message: string;
  type?: "ok" | "error";
}
