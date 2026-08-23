export function tenantIdForServiceTokenHash(hash: string): string { return `service_${hash.slice(0, 32)}`; }
export function assertCanonicalHostedTenantId(..._args: any[]): void {}
export function assertCanonicalHostedSpaceId(..._args: any[]): void {}