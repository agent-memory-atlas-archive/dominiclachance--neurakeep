export type HostedCapability = "read" | "propose" | "apply" | "manage_spaces" | "manage_members" | "manage_billing" | "manage_policy" | "read_audit";
export function assertHostedCapability(..._args: any[]): void {}
export function capabilityForApi(..._args: any[]): HostedCapability { return "read"; }
export function capabilityForMcpTool(..._args: any[]): HostedCapability { return "read"; }