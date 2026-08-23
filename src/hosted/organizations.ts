import type { HostedActor } from "./firebase-auth.js";
export function listOrganizationsForUser(..._args: any[]): any[] { return []; }
export function resolveOrganizationActor(_db: unknown, actor: HostedActor, ..._args: any[]): HostedActor { return actor; }
export function createOrganization(..._args: any[]): any { throw new Error("Managed Team organizations are available through the hosted service."); }
export function deletePendingOrganization(..._args: any[]): boolean { return false; }
export function listOrganizationSpaces(..._args: any[]): any[] { return []; }
export function createOrganizationSpace(..._args: any[]): any { throw new Error("Managed Team spaces are available through the hosted service."); }
export function listOrganizationMembers(..._args: any[]): any[] { return []; }
export function inviteOrganizationMember(..._args: any[]): any { throw new Error("Managed Team invitations are available through the hosted service."); }
export function acceptOrganizationInvitation(..._args: any[]): any { throw new Error("Managed Team invitations are available through the hosted service."); }
export function updateOrganizationMember(..._args: any[]): boolean { return false; }
export function organizationPolicy(..._args: any[]): Record<string, unknown> { return {}; }
export function updateOrganizationPolicy(..._args: any[]): Record<string, unknown> { return {}; }