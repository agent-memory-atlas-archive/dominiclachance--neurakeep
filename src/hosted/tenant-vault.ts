import type { VaultPaths } from "../core/paths.js";
import type { UmosDatabase } from "../db/client.js";
import type { HostedActor } from "./firebase-auth.js";
export interface HostedVaultContext { db: UmosDatabase; paths: VaultPaths; close: () => void; }
export function isolateHostedActor(actor: HostedActor): HostedActor { return actor; }
export function openHostedVault(..._args: any[]): HostedVaultContext { throw new Error("Managed tenant vaults are not enabled in the self-hosted build."); }