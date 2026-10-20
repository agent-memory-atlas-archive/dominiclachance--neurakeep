import Database from "better-sqlite3";
import { copyFileSync, existsSync, readFileSync, readdirSync, renameSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { randomBytes } from "node:crypto";
import { assertEncryptedDatabaseFile, openEncryptedDatabase, readDatabaseHeader } from "../db/client.js";
import { secureDirectory, secureFile } from "./filesystem.js";
import { EncryptedArtifactStore } from "./artifact-store.js";

export interface DatabaseMigrationResult { dbPath: string; encryptedRollbackPath: string; tableCount: number; }

export function migratePlaintextDatabaseInPlace(dbPath: string, key: Buffer, encryptedRollbackPath: string): DatabaseMigrationResult {
  if (!existsSync(dbPath)) throw new Error(`Database does not exist: ${dbPath}`);
  if (readDatabaseHeader(dbPath) !== "SQLite format 3\u0000") throw new Error(`Database is not a plaintext SQLite file or is already encrypted: ${dbPath}`);
  if (existsSync(encryptedRollbackPath)) throw new Error(`Refusing to overwrite rollback database: ${encryptedRollbackPath}`);
  const temporary = `${dbPath}.encrypting-${randomBytes(6).toString("hex")}`;
  secureDirectory(dirname(encryptedRollbackPath));
  const source = new Database(dbPath);
  let sourceLocked = false;
  let database: Database.Database | undefined;
  try {
    source.pragma("busy_timeout = 5000");
    const checkpoint = source.pragma("wal_checkpoint(TRUNCATE)") as Array<{ busy: number; log: number; checkpointed: number }>;
    if (checkpoint.some((row) => row.busy !== 0 || row.log !== row.checkpointed)) {
      throw new Error("Database migration requires the vault to be offline; WAL checkpoint could not complete.");
    }
    if (source.pragma("quick_check", { simple: true }) !== "ok") throw new Error(`Plaintext database integrity check failed: ${dbPath}`);
    const sourceTables = tableNames(source);
    source.exec("BEGIN EXCLUSIVE");
    sourceLocked = true;
    copyFileSync(dbPath, temporary);
    secureFile(temporary);
    database = new Database(temporary);
    database.pragma("cipher='sqlcipher'");
    database.pragma("legacy=4");
    const keyed = database as Database.Database & { rekey?: (value: Buffer) => void };
    if (typeof keyed.rekey !== "function") throw new Error("The installed SQLite driver cannot rekey a database.");
    keyed.rekey(key);
    database.close(); database = undefined;
    assertEncryptedDatabaseFile(temporary);
    const verified = openEncryptedDatabase(temporary, key, true);
    const tableCount = (verified.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'table'").get() as { count: number }).count;
    if (verified.pragma("quick_check", { simple: true }) !== "ok") throw new Error(`Encrypted database integrity check failed: ${temporary}`);
    if (JSON.stringify(tableNames(verified)) !== JSON.stringify(sourceTables)) throw new Error("Encrypted database schema verification failed after migration.");
    verified.close();
    let wrongKeyRejected = false;
    try {
      openEncryptedDatabase(temporary, randomBytes(32), true).close();
    } catch {
      wrongKeyRejected = true;
    }
    if (!wrongKeyRejected) throw new Error(`Encrypted database unexpectedly opened with the wrong key: ${dbPath}`);
    removeMigrationSidecars(temporary);
    copyFileSync(temporary, encryptedRollbackPath);
    secureFile(encryptedRollbackPath);
    source.exec("ROLLBACK");
    sourceLocked = false;
    source.close();
    removeMigrationSidecars(dbPath);
    renameSync(temporary, dbPath);
    secureFile(dbPath);
    return { dbPath, encryptedRollbackPath, tableCount };
  } catch (error) {
    database?.close();
    if (sourceLocked) {
      try { source.exec("ROLLBACK"); } catch { /* preserve the original migration error */ }
    }
    if (source.open) source.close();
    removeMigrationSidecars(temporary);
    rmSync(temporary, { force: true });
    throw error;
  }
}

function tableNames(database: Database.Database): string[] {
  return (database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all() as Array<{ name: string }>).map((row) => row.name);
}

function removeMigrationSidecars(path: string): void {
  rmSync(`${path}-wal`, { force: true });
  rmSync(`${path}-shm`, { force: true });
}

export function migratePlaintextArtifacts(root: string, store: EncryptedArtifactStore, confirmed: boolean): string[] {
  if (!confirmed) throw new Error("Plaintext artifact removal requires explicit confirmation after a verified encrypted backup.");
  const migrated: string[] = [];
  for (const [directory, purpose] of [[join(root, "raw"), "raw"], [join(root, "wiki"), "wiki"]] as const) {
    if (!existsSync(directory)) continue;
    for (const path of listPlaintextFiles(directory)) {
      const encrypted = store.write(path, readFileSync(path), purpose);
      if (!store.read(encrypted, purpose).equals(readFileSync(path))) throw new Error(`Encrypted artifact verification failed: ${path}`);
      rmSync(path, { force: true });
      migrated.push(encrypted);
    }
  }
  for (const path of [join(root, "app", "graph.json"), join(root, "logs", "governor-audit.jsonl")]) {
    if (!existsSync(path)) continue;
    const encrypted = store.write(path, readFileSync(path), "state");
    if (!store.read(encrypted, "state").equals(readFileSync(path))) throw new Error(`Encrypted state verification failed: ${path}`);
    rmSync(path, { force: true });
    migrated.push(encrypted);
  }
  return migrated;
}

function listPlaintextFiles(root: string): string[] {
  const result: string[] = [];
  const stack = [root];
  while (stack.length) {
    const current = stack.pop()!;
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const path = join(current, entry.name);
      if (entry.isSymbolicLink()) throw new Error(`Migration refuses symbolic links: ${path}`);
      if (entry.isDirectory()) stack.push(path);
      else if (entry.isFile() && !entry.name.endsWith(".nkenc")) result.push(path);
    }
  }
  return result;
}
