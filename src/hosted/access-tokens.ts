export function authenticateHostedAccessToken(..._args: any[]): null { return null; }
export function issueHostedAccessToken(..._args: any[]): any { throw new Error("Managed access tokens are not enabled in the self-hosted build."); }
export function listHostedAccessTokens(..._args: any[]): Array<Record<string, unknown>> { return []; }
export function rotateHostedAccessToken(..._args: any[]): Record<string, unknown> { throw new Error("Managed access-token rotation is not enabled in the self-hosted build."); }
export function revokeHostedAccessToken(..._args: any[]): boolean { return false; }