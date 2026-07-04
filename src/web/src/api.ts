import type { GraphPayload, GraphState, ProposalDiff, ProposalReview, ProposalSummary } from "./types.js";

export interface AuthSettings {
  mode: "local" | "remote";
  provider?: "local";
  tokenRequired: boolean;
  readOnly: boolean;
  hasToken: boolean;
  endpoint: string;
  user: {
    displayName: string;
    role: "owner" | "operator" | "viewer";
    allowWrites: boolean;
    actor?: Record<string, unknown>;
  };
}

export class ApiClient {
  private token = localStorage.getItem("neurakeep_token") ?? "";

  setToken(token: string): void {
    this.token = token.trim();
    if (this.token) localStorage.setItem("neurakeep_token", this.token);
    else localStorage.removeItem("neurakeep_token");
  }

  getToken(): string {
    return this.token;
  }

  async api<T>(path: string, init: RequestInit = {}): Promise<T> {
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (this.token) headers.authorization = `Bearer ${this.token}`;
    const response = await fetch(path, { ...init, headers: { ...headers, ...(init.headers as Record<string, string> | undefined) } });
    const data = await response.json();
    if (!response.ok || data.error) {
      throw new Error(data.error ?? response.statusText);
    }
    return data as T;
  }

  async mcp<T>(name: string, args: Record<string, unknown>): Promise<T> {
    const result = await this.api<{ result?: { structuredContent?: T }; error?: { message?: string } }>("/mcp", {
      method: "POST",
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: Date.now(),
        method: "tools/call",
        params: { name, arguments: args }
      })
    });
    if (result.error) throw new Error(result.error.message ?? "MCP error");
    return (result.result?.structuredContent ?? result.result ?? {}) as T;
  }
}

export const apiClient = new ApiClient();

export async function loadGraph(options: { focusId?: string; depth?: number; limit?: number } = {}): Promise<GraphPayload> {
  const params = new URLSearchParams();
  if (options.focusId) params.set("focus", options.focusId);
  if (options.depth) params.set("depth", String(options.depth));
  if (options.limit) params.set("limit", String(options.limit));
  const suffix = params.toString() ? `?${params.toString()}` : "";
  return apiClient.api<GraphPayload>(`/api/graph${suffix}`);
}

export async function saveGraphState(state: GraphState): Promise<GraphState> {
  return apiClient.api<GraphState>("/api/graph/state", { method: "POST", body: JSON.stringify(state) });
}

export async function loadProposal(id: string): Promise<ProposalReview> {
  const data = await apiClient.api<{ proposal: { id: string; summary: string; diff_json: string } }>(`/api/proposals/${encodeURIComponent(id)}`);
  const governor = await apiClient.api<ProposalReview["governor"]>(`/api/proposals/${encodeURIComponent(id)}/governor`);
  return {
    proposalId: data.proposal.id,
    summary: data.proposal.summary,
    diff: JSON.parse(data.proposal.diff_json) as ProposalDiff,
    governor
  };
}

export async function listProposals(status: string, filter: string): Promise<ProposalSummary[]> {
  const data = await apiClient.api<{ proposals: ProposalSummary[] }>(`/api/proposals?status=${encodeURIComponent(status)}&filter=${encodeURIComponent(filter)}`);
  return data.proposals;
}

export async function authSettings(): Promise<AuthSettings> {
  return apiClient.api<AuthSettings>("/api/auth/settings");
}
