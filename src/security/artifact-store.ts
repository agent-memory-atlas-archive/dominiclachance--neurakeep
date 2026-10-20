import { readFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import { decryptEnvelope, encryptEnvelope, type EncryptionPurpose } from "./encryption.js";
import { secureAtomicWrite } from "./filesystem.js";

export interface ArtifactSecurityContext {
  root: string;
  tenantId: string;
  spaceId: string;
  key: Buffer;
  keyVersion: number;
}

export class EncryptedArtifactStore {
  constructor(readonly context: ArtifactSecurityContext) {}

  write(path: string, value: Buffer | string, purpose: Extract<EncryptionPurpose, "raw" | "wiki" | "state">): string {
    const resolved = this.assertPath(path);
    const encryptedPath = resolved.endsWith(".nkenc") ? resolved : `${resolved}.nkenc`;
    const envelope = encryptEnvelope(Buffer.isBuffer(value) ? value : Buffer.from(value, "utf8"), this.context.key, this.encryptionContext(encryptedPath, purpose));
    secureAtomicWrite(encryptedPath, envelope);
    return encryptedPath;
  }

  read(path: string, purpose: Extract<EncryptionPurpose, "raw" | "wiki" | "state">): Buffer {
    const resolved = this.assertPath(path);
    return decryptEnvelope(readFileSync(resolved), this.context.key, this.encryptionContext(resolved, purpose));
  }

  encryptedPath(path: string): string {
    const resolved = this.assertPath(path);
    return resolved.endsWith(".nkenc") ? resolved : `${resolved}.nkenc`;
  }

  private encryptionContext(path: string, purpose: "raw" | "wiki" | "state") {
    return { tenantId: this.context.tenantId, spaceId: this.context.spaceId, purpose, keyVersion: this.context.keyVersion, path: relative(resolve(this.context.root), resolve(path)).replaceAll("\\", "/") } as const;
  }

  private assertPath(path: string): string {
    const root = resolve(this.context.root);
    const target = resolve(path);
    if (target !== root && !target.startsWith(`${root}\\`) && !target.startsWith(`${root}/`)) throw new Error("Encrypted artifact path escaped its hosted vault.");
    return target;
  }
}

const hostedStores = new Map<string, EncryptedArtifactStore>();

export function registerHostedArtifactStore(root: string, store: EncryptedArtifactStore): void {
  hostedStores.set(resolve(root), store);
}

export function unregisterHostedArtifactStore(root: string): void {
  hostedStores.delete(resolve(root));
}

export function hostedArtifactStore(root: string): EncryptedArtifactStore | undefined {
  return hostedStores.get(resolve(root));
}
