import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { randomBytes } from "node:crypto";
import { secureAtomicWrite, secureDirectory } from "./filesystem.js";

export interface RecoveryKeyProvider {
  readonly id: string;
  getKey(): Buffer;
}

export class ProtectedFileKeyProvider implements RecoveryKeyProvider {
  readonly id: string;
  constructor(readonly path: string, id = "file:v1") {
    this.path = resolve(path);
    this.id = id;
  }

  getKey(): Buffer {
    if (!existsSync(this.path)) throw new Error(`NeuraKeep recovery key file is missing: ${this.path}`);
    if (process.platform !== "win32" && (statSync(this.path).mode & 0o077) !== 0) {
      throw new Error(`NeuraKeep recovery key file must use mode 0600 or stricter: ${this.path}`);
    }
    return decodeKey(readFileSync(this.path, "utf8"));
  }
}

export function recoveryKeyProviderFromEnv(): RecoveryKeyProvider {
  const path = process.env.NEURAKEEP_MASTER_KEY_FILE?.trim();
  if (!path) throw new Error("Hosted encryption requires NEURAKEEP_MASTER_KEY_FILE; plaintext fallback is disabled.");
  return new ProtectedFileKeyProvider(path, process.env.NEURAKEEP_MASTER_KEY_ID?.trim() || "file:v1");
}

export function initializeRecoveryKeyFile(path: string): void {
  const resolved = resolve(path);
  if (existsSync(resolved)) throw new Error(`Refusing to overwrite existing recovery key file: ${resolved}`);
  secureDirectory(dirname(resolved));
  secureAtomicWrite(resolved, `${randomBytes(32).toString("base64url")}\n`);
}

function decodeKey(value: string): Buffer {
  const cleaned = value.trim();
  const key = /^[a-f0-9]{64}$/i.test(cleaned) ? Buffer.from(cleaned, "hex") : Buffer.from(cleaned, "base64url");
  if (key.length !== 32) throw new Error("NeuraKeep recovery key must decode to exactly 32 bytes.");
  return key;
}
