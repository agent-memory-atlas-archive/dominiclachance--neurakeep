import Database from "better-sqlite3";
import { randomBytes } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { assertEncryptedDatabaseFile, openEncryptedDatabase } from "../src/db/client.js";
import { EncryptedArtifactStore } from "../src/security/artifact-store.js";
import { createEncryptedBackup, restoreEncryptedBackup, verifyEncryptedBackupRestore } from "../src/security/backup.js";
import { migratePlaintextDatabaseInPlace } from "../src/security/migration.js";

describe("hosted encrypted storage", () => {
  const roots: string[] = [];
  afterEach(() => roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })));

  it("encrypts a database and rejects missing, wrong, and cross-space keys", () => {
    const root = makeRoot(); const dbPath = join(root, "memory.sqlite"); const key = randomBytes(32);
    const db = openEncryptedDatabase(dbPath, key); db.exec("CREATE TABLE secret(value TEXT); INSERT INTO secret VALUES ('marker-owl')"); db.close();
    assertEncryptedDatabaseFile(dbPath);
    expect(readFileSync(dbPath).includes(Buffer.from("marker-owl"))).toBe(false);
    expect(() => openEncryptedDatabase(dbPath, randomBytes(32), true)).toThrow(/could not be opened/);
    const reopened = openEncryptedDatabase(dbPath, key, true);
    expect(reopened.prepare("SELECT value FROM secret").pluck().get()).toBe("marker-owl"); reopened.close();
  });

  it("migrates a plaintext SQLite database through a verified encrypted cutover", () => {
    const root = makeRoot(); const dbPath = join(root, "memory.sqlite"); const rollback = join(root, "rollback", "memory.sqlite.nkrollback");
    const plain = new Database(dbPath); plain.exec("CREATE TABLE secret(value TEXT); INSERT INTO secret VALUES ('migration-fox')"); plain.close();
    const key = randomBytes(32); const result = migratePlaintextDatabaseInPlace(dbPath, key, rollback);
    expect(result.tableCount).toBeGreaterThan(0); expect(existsSync(rollback)).toBe(true); assertEncryptedDatabaseFile(dbPath);
    expect(readdirSync(root).filter((name) => name.startsWith("memory.sqlite.encrypting-") && /-(wal|shm)$/.test(name))).toEqual([]);
    const encrypted = openEncryptedDatabase(dbPath, key, true);
    expect(encrypted.prepare("SELECT value FROM secret").pluck().get()).toBe("migration-fox"); encrypted.close();
  });

  it("checkpoints committed WAL data before encrypted migration", () => {
    const root = makeRoot();
    const livePath = join(root, "live.sqlite");
    const dbPath = join(root, "memory.sqlite");
    const rollback = join(root, "rollback", "memory.sqlite.nkrollback");
    const live = new Database(livePath);
    live.pragma("journal_mode = WAL");
    live.pragma("wal_autocheckpoint = 0");
    live.exec("CREATE TABLE wal_secret(value TEXT); INSERT INTO wal_secret VALUES ('wal-otter')");
    expect(existsSync(`${livePath}-wal`)).toBe(true);
    copyFileSync(livePath, dbPath);
    copyFileSync(`${livePath}-wal`, `${dbPath}-wal`);
    live.close();

    const key = randomBytes(32);
    migratePlaintextDatabaseInPlace(dbPath, key, rollback);
    expect(existsSync(`${dbPath}-wal`)).toBe(false);
    expect(existsSync(`${dbPath}-shm`)).toBe(false);
    const encrypted = openEncryptedDatabase(dbPath, key, true);
    expect(encrypted.prepare("SELECT value FROM wal_secret").pluck().get()).toBe("wal-otter");
    encrypted.close();
  });

  it("encrypts and authenticates raw and wiki artifacts", () => {
    const root = makeRoot(); const key = randomBytes(32);
    const store = new EncryptedArtifactStore({ root, tenantId: "user_11111111111111111111111111111111", spaceId: "personal", key, keyVersion: 1 });
    const raw = store.write(join(root, "raw", "episode.txt"), "private-raven", "raw");
    const wiki = store.write(join(root, "wiki", "index.md"), "private-wiki", "wiki");
    expect(raw.endsWith(".nkenc")).toBe(true); expect(readFileSync(raw).includes(Buffer.from("private-raven"))).toBe(false);
    expect(store.read(raw, "raw").toString()).toBe("private-raven"); expect(store.read(wiki, "wiki").toString()).toBe("private-wiki");
    const tampered = readFileSync(raw); tampered[tampered.length - 1] ^= 1; writeFileSync(raw, tampered);
    expect(() => store.read(raw, "raw")).toThrow(/authentication failed/);
  });

  it("creates an encrypted backup and passes an isolated restore drill", () => {
    const source = makeRoot(); mkdirSync(join(source, "nested")); writeFileSync(join(source, "nested", "data.txt"), "backup-lynx");
    const backup = makeRoot(); rmSync(backup, { recursive: true }); const restore = makeRoot(); rmSync(restore, { recursive: true });
    const key = randomBytes(32); const context = { tenantId: "system", spaceId: "all", keyVersion: 1 };
    createEncryptedBackup(source, backup, key, context);
    expect(readFileSync(join(backup, "nested", "data.txt.nkenc")).includes(Buffer.from("backup-lynx"))).toBe(false);
    let callbackVerified = false;
    expect(verifyEncryptedBackupRestore(backup, makeRoot(), key, context, (restoredRoot) => {
      callbackVerified = readFileSync(join(restoredRoot, "nested", "data.txt"), "utf8") === "backup-lynx";
    }).files).toHaveLength(1);
    expect(callbackVerified).toBe(true);
    restoreEncryptedBackup(backup, restore, key, context);
    expect(readFileSync(join(restore, "nested", "data.txt"), "utf8")).toBe("backup-lynx");
    expect(() => restoreEncryptedBackup(backup, join(source, "wrong-restore"), randomBytes(32), context)).toThrow(/authentication failed/);
  });

  it("refuses live SQLite sidecars and leaves no partial backup destination", () => {
    const source = makeRoot();
    writeFileSync(join(source, "memory.sqlite"), "database");
    writeFileSync(join(source, "memory.sqlite-wal"), "live-wal");
    const destination = join(tmpdir(), `nk-backup-${process.pid}-${randomBytes(6).toString("hex")}`);
    roots.push(destination);
    expect(() => createEncryptedBackup(source, destination, randomBytes(32), { tenantId: "system", spaceId: "all", keyVersion: 1 })).toThrow(/offline, checkpointed vault/);
    expect(existsSync(destination)).toBe(false);
  });

  function makeRoot(): string { const root = join(tmpdir(), `nk-security-${process.pid}-${randomBytes(6).toString("hex")}`); mkdirSync(root, { recursive: true }); roots.push(root); return root; }
});
