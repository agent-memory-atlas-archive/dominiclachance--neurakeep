export function billingConfigFromEnv(..._args: any[]): any { return { enabled: false, publicUrl: "http://127.0.0.1:8765" }; }
export function billingAccessStatus(..._args: any[]): any { return { enabled: false, authenticated: true, entitled: true, plan: "local", status: "active", reason: "self_hosted", plans: [], launchOffer: { configured: false } }; }
export async function createCheckout(..._args: any[]): Promise<any> { throw new Error("Stripe Checkout is available through the managed NeuraKeep service."); }
export async function createBillingPortal(..._args: any[]): Promise<any> { throw new Error("Stripe billing is available through the managed NeuraKeep service."); }
export function constructStripeEvent(..._args: any[]): any { throw new Error("Stripe webhooks are not enabled in the self-hosted build."); }
export function applyStripeEvent(..._args: any[]): any { return { processed: false }; }