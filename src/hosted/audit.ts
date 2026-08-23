import type { UmosDatabase } from "../db/client.js";
import type { HostedActor } from "./firebase-auth.js";

export interface HostedAuditInput { actor: HostedActor; action: string; targetType: string; targetId?: string; status: "ok" | "denied" | "error"; metadata?: Record<string, unknown>; }
export function recordHostedAudit(..._args: any[]): void {}
export function ensureHostedDefaults(..._args: any[]): void {}
export function listHostedSpaces(_db: UmosDatabase, tenantId: string, ..._args: any[]): Array<Record<string, unknown>> { return [{ id: "personal", tenantId, name: "personal", kind: "personal" }]; }
export function listHostedAudit(..._args: any[]): Array<Record<string, unknown>> { return []; }
export function listHostedAuditSummary(..._args: any[]): Array<Record<string, unknown>> { return []; }
export function listHostedMembers(..._args: any[]): Array<Record<string, unknown>> { return []; }
export function listRecentDeniedBetaAccess(..._args: any[]): Array<Record<string, unknown>> { return []; }