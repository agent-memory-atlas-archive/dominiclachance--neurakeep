import { createHash, randomBytes } from "node:crypto";
import { existsSync, readFileSync, readdirSync, renameSync, rmSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { decryptEnvelope, encryptEnvelope } from "./encryption.js";
import { hardenTree, secureAtomicWrite, secureDirectory } from "./filesystem.js";

export interface BackupContext { tenantId: string; spaceId: string; keyVersion: number; }
export interface BackupManifest {
  format: "neurakeep-encrypted-backup-v1";
  createdAt: string;
  context: BackupContext;
  files: Array<{ path: string; bytes: number; sha256: string }>;
}

export function createEncryptedBackup(sourceRoot: string, destination: string, backupKey: Buffer, context: BackupContext): BackupManifest {
  const source = resolve(sourceRoot);
  const target = resolve(destination);
  if (target === source || target.startsWith(`${source}\\`) || target.startsWith(`${source}/`)) throw new Error("Encrypted backup destination must be outside the source tree.");
  if (existsSync(target)) throw new Error(`Refusing to overwrite backup destination: ${target}`);
  const sourceFiles = listFiles(source);
  const liveSidecar = sourceFiles.find((path) => /-(?:wal|shm)$/i.test(path));
  if (liveSidecar) throw new Error(`Backup requires an offline, checkpointed vault; SQLite sidecar is present: ${liveSidecar}`);
  const staging = `${target}.partial-${randomBytes(6).toString("hex")}`;
  secureDirectory(dirname(staging));
  secureDirectory(staging);
  try {
    const files = sourceFiles.map((sourcePath) => {
      const path = relative(source, sourcePath).replaceAll("\\", "/");
      const plaintext = readFileSync(sourcePath);
      const envelope = encryptEnvelope(plaintext, backupKey, { ...context, purpose: "backup", path });
      const backupPath = join(staging, `${path}.nkenc`);
      secureDirectory(dirname(backupPath));
      secureAtomicWrite(backupPath, envelope);
      return { path, bytes: plaintext.length, sha256: sha256(plaintext) };
    });
    const manifest: BackupManifest = { format: "neurakeep-encrypted-backup-v1", createdAt: new Date().toISOString(), context, files };
    secureAtomicWrite(join(staging, "manifest.nkenc"), encryptEnvelope(Buffer.from(JSON.stringify(manifest), "utf8"), backupKey,
      { ...context, purpose: "backup", path: "manifest.json" }));
    hardenTree(staging);
    renameSync(staging, target);
    return manifest;
  } catch (error) {
    rmSync(staging, { recursive: true, force: true });
    throw error;
  }
}

export function restoreEncryptedBackup(backupRoot: string, restoreRoot: string, backupKey: Buffer, expected?: BackupContext): BackupManifest {
  const backup = resolve(backupRoot);
  const restore = resolve(restoreRoot);
  if (existsSync(restore)) throw new Error(`Refusing to overwrite restore destination: ${restore}`);
  const candidateContexts = expected ? [expected] : inferContextsNotAllowed();
  const context = candidateContexts[0];
  const manifestBytes = decryptEnvelope(readFileSync(join(backup, "manifest.nkenc")), backupKey,
    { ...context, purpose: "backup", path: "manifest.json" });
  const manifest = JSON.parse(manifestBytes.toString("utf8")) as BackupManifest;
  if (manifest.format !== "neurakeep-encrypted-backup-v1" || JSON.stringify(manifest.context) !== JSON.stringify(context)) throw new Error("Encrypted backup manifest context is invalid.");
  secureDirectory(restore);
  try {
    for (const entry of manifest.files) {
      const restoredPath = safeChild(restore, entry.path);
      const envelopePath = safeChild(backup, `${entry.path}.nkenc`);
      const plaintext = decryptEnvelope(readFileSync(envelopePath), backupKey, { ...context, purpose: "backup", path: entry.path });
      if (plaintext.length !== entry.bytes || sha256(plaintext) !== entry.sha256) throw new Error(`Restored backup hash mismatch: ${entry.path}`);
      secureDirectory(dirname(restoredPath));
      secureAtomicWrite(restoredPath, plaintext);
    }
    hardenTree(restore);
    return manifest;
  } catch (error) {
    rmSync(restore, { recursive: true, force: true });
    throw error;
  }
}

export function verifyEncryptedBackupRestore(backupRoot: string, scratchRoot: string, backupKey: Buffer, context: BackupContext, verify?: (restoreRoot: string, manifest: BackupManifest) => void): BackupManifest {
  const restore = join(resolve(scratchRoot), `restore-${Date.now()}-${process.pid}`);
  const manifest = restoreEncryptedBackup(backupRoot, restore, backupKey, context);
  try {
    for (const entry of manifest.files) {
      const value = readFileSync(safeChild(restore, entry.path));
      if (sha256(value) !== entry.sha256) throw new Error(`Restore verification failed: ${entry.path}`);
    }
    verify?.(restore, manifest);
    return manifest;
  } finally { rmSync(restore, { recursive: true, force: true }); }
}

function listFiles(root: string): string[] {
  const files: string[] = [];
  const stack = [root];
  while (stack.length) {
    const current = stack.pop()!;
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const path = join(current, entry.name);
      if (entry.isSymbolicLink()) throw new Error(`Backups refuse symbolic links: ${path}`);
      if (entry.isDirectory()) stack.push(path);
      else if (entry.isFile() && statSync(path).isFile()) files.push(path);
    }
  }
  return files.sort();
}

function safeChild(root: string, relativePath: string): string {
  const base = resolve(root);
  const path = resolve(base, relativePath);
  if (!path.startsWith(`${base}\\`) && !path.startsWith(`${base}/`)) throw new Error("Backup path escaped its root.");
  return path;
}

function inferContextsNotAllowed(): BackupContext[] {
  throw new Error("Restore requires the expected tenant, space, and key version context.");
}

function sha256(value: Buffer): string { return createHash("sha256").update(value).digest("hex"); }
