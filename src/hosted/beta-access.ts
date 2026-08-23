import type { HostedActor } from "./firebase-auth.js";
export interface BetaAccessPolicy { enabled: boolean; allowedEmails: string[]; allowedDomains: string[]; }
export function betaAccessPolicyFromEnv(..._args: any[]): BetaAccessPolicy { return { enabled: false, allowedEmails: [], allowedDomains: [] }; }
export function betaAccessStatus(_actor: HostedActor, policy = betaAccessPolicyFromEnv()): Record<string, unknown> { return { ...policy, allowed: true, reason: "general_availability" }; }