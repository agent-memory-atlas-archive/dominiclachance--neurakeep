export function authenticateScimToken(..._args: any[]): null { return null; }
export function discoverEnterpriseProviders(..._args: any[]): any[] { return []; }
export function issueScimToken(..._args: any[]): any { throw new Error("SCIM is available through the managed NeuraKeep service."); }
export function organizationSsoStatus(..._args: any[]): Record<string, unknown> { return { enabled: false, providers: [] }; }
export function updateOrganizationSso(..._args: any[]): Record<string, unknown> { return { enabled: false, providers: [] }; }