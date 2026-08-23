export interface FirebaseClientState { token: string; user?: { email?: string | null; displayName?: string | null }; }
export function firebaseConfigured(): boolean { return false; }
export async function signInWithFirebase(): Promise<FirebaseClientState> { throw new Error("Google sign-in is available through the managed NeuraKeep service."); }
export async function signInWithEnterpriseProvider(..._args: any[]): Promise<FirebaseClientState> { throw new Error("Enterprise SSO is available through the managed NeuraKeep service."); }
export async function signOutOfFirebase(): Promise<void> {}
export function currentFirebaseUser(): null { return null; }