export interface AuthorizationRequest { clientId: string; clientName: string; redirectUri: string; codeChallenge: string; state?: string; scopes: Array<"memory:read" | "memory:propose" | "memory:apply">; resource: string; }
export class OAuthError extends Error { constructor(readonly error: string, description: string, readonly status = 400) { super(description); } }
const unavailable = (): never => { throw new OAuthError("unsupported_grant_type", "Hosted OAuth is available through the managed NeuraKeep service.", 404); };
export function registerOAuthClient(..._args: any[]): Record<string, unknown> { return unavailable(); }
export function validateAuthorizationRequest(..._args: any[]): AuthorizationRequest { return unavailable(); }
export function issueAuthorizationCode(..._args: any[]): { redirectTo: string } { return unavailable(); }
export function authorizationDenied(..._args: any[]): { redirectTo: string } { return unavailable(); }
export function exchangeOAuthToken(..._args: any[]): Record<string, unknown> { return unavailable(); }