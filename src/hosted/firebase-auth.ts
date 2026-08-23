import type { IncomingMessage } from "node:http";

export interface FirebaseAuthConfig { enabled: boolean; projectId?: string; serviceAccountJson?: string; }
export interface HostedActor { provider: "local" | "firebase" | "service_token"; uid: string; email?: string; name?: string; tenantId: string; spaceId: string; roles: string[]; organizationId?: string; organizationName?: string; membershipRole?: string; identityProvider?: string; }
export function hostedAuthConfigFromEnv(): FirebaseAuthConfig { return { enabled: false }; }
export function localActor(): HostedActor { return { provider: "local", uid: "local", tenantId: "local", spaceId: "personal", roles: ["owner"] }; }
export async function verifyFirebaseRequest(_req: IncomingMessage, _config: FirebaseAuthConfig): Promise<HostedActor | null> { return null; }