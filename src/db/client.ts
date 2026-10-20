import Database from "better-sqlite3";
import { dirname } from "node:path";
import { chmodSync, closeSync, mkdirSync, openSync, readSync } from "node:fs";
import { schemaSql } from "./schema.js";

export type UmosDatabase = Database.Database;

export function openDatabase(dbPath: string, readonly = false): UmosDatabase {
  mkdirSync(dirname(dbPath), { recursive: true });
  const db = new Database(dbPath, {
    readonly,
    fileMustExist: readonly
  });
  db.pragma("foreign_keys = ON");
  return db;
}

export function openEncryptedDatabase(dbPath: string, key: Buffer, readonly = false): UmosDatabase {
  if (key.length !== 32) throw new Error("A hosted database key must contain exactly 32 bytes.");
  mkdirSync(dirname(dbPath), { recursive: true, mode: 0o700 });
  const db = new Database(dbPath, { readonly, fileMustExist: readonly });
  try {
    db.pragma("cipher='sqlcipher'");
    db.pragma("legacy=4");
    if (db.pragma("cipher", { simple: true }) !== "sqlcipher") throw new Error("SQLite did not activate SQLCipher compatibility mode.");
    const keyed = db as UmosDatabase & { key?: (value: Buffer) => void };
    if (typeof keyed.key !== "function") throw new Error("The installed SQLite driver does not provide encryption key support.");
    keyed.key(key);
    db.prepare("SELECT count(*) AS count FROM sqlite_master").get();
    db.pragma("foreign_keys = ON");
    if (process.platform !== "win32") chmodSync(dbPath, 0o600);
    return db;
  } catch (error) {
    db.close();
    throw new Error(`Hosted encrypted database could not be opened: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export function assertEncryptedDatabaseFile(dbPath: string): void {
  const header = readDatabaseHeader(dbPath);
  if (header === "SQLite format 3\u0000") throw new Error(`Hosted database has a plaintext SQLite header: ${dbPath}`);
}

export function readDatabaseHeader(dbPath: string): string {
  const descriptor = openSync(dbPath, "r");
  try {
    const header = Buffer.alloc(16);
    const bytesRead = readSync(descriptor, header, 0, header.length, 0);
    return header.subarray(0, bytesRead).toString("ascii");
  } finally {
    closeSync(descriptor);
  }
}

export function migrateDatabase(db: UmosDatabase): void {
  try {
    db.exec(schemaSql);
  } catch (error) {
    if (!isAdditiveMigrationError(error)) {
      throw error;
    }
    ensureSchemaV2Columns(db);
    db.exec(schemaSql);
  }
  ensureSchemaV2Columns(db);
}

function isAdditiveMigrationError(error: unknown): boolean {
  return error instanceof Error && /no such column/i.test(error.message);
}

function ensureSchemaV2Columns(db: UmosDatabase): void {
  addColumnIfMissing(db, "sources", "episode_id", "TEXT");
  addColumnIfMissing(db, "sources", "space", "TEXT NOT NULL DEFAULT 'personal'");
  addColumnIfMissing(db, "sources", "trust_level", "TEXT NOT NULL DEFAULT 'observed'");
  addColumnIfMissing(db, "sources", "source_origin", "TEXT NOT NULL DEFAULT 'local_file'");
  addColumnIfMissing(db, "sources", "sensitivity", "TEXT NOT NULL DEFAULT 'normal'");

  addColumnIfMissing(db, "sections", "previous_section_id", "TEXT");
  addColumnIfMissing(db, "sections", "next_section_id", "TEXT");
  addColumnIfMissing(db, "sections", "space", "TEXT NOT NULL DEFAULT 'personal'");
  addColumnIfMissing(db, "sections", "trust_level", "TEXT NOT NULL DEFAULT 'observed'");
  addColumnIfMissing(db, "sections", "source_origin", "TEXT NOT NULL DEFAULT 'local_file'");
  addColumnIfMissing(db, "sections", "visibility", "TEXT NOT NULL DEFAULT 'private'");
  addColumnIfMissing(db, "sections", "sensitivity", "TEXT NOT NULL DEFAULT 'normal'");

  for (const table of ["events", "facts", "failures"]) {
    addColumnIfMissing(db, table, "section_ids_json", "TEXT NOT NULL DEFAULT '[]'");
    addColumnIfMissing(db, table, "space", "TEXT NOT NULL DEFAULT 'personal'");
    addColumnIfMissing(db, table, "trust_level", "TEXT NOT NULL DEFAULT 'observed'");
    addColumnIfMissing(db, table, "source_origin", "TEXT NOT NULL DEFAULT 'agent'");
    addColumnIfMissing(db, table, "visibility", "TEXT NOT NULL DEFAULT 'private'");
    addColumnIfMissing(db, table, "sensitivity", "TEXT NOT NULL DEFAULT 'normal'");
    addColumnIfMissing(db, table, "graph_subjects_json", "TEXT NOT NULL DEFAULT '[]'");
  }

  addColumnIfMissing(db, "proposals", "section_ids_json", "TEXT NOT NULL DEFAULT '[]'");
  addColumnIfMissing(db, "proposals", "space", "TEXT NOT NULL DEFAULT 'personal'");
  addColumnIfMissing(db, "proposals", "trust_level", "TEXT NOT NULL DEFAULT 'observed'");
  addColumnIfMissing(db, "proposals", "source_origin", "TEXT NOT NULL DEFAULT 'agent'");
  addColumnIfMissing(db, "proposals", "visibility", "TEXT NOT NULL DEFAULT 'private'");
  addColumnIfMissing(db, "proposals", "sensitivity", "TEXT NOT NULL DEFAULT 'normal'");
  addColumnIfMissing(db, "hosted_access_tokens", "email", "TEXT");
  addColumnIfMissing(db, "hosted_access_tokens", "space_id", "TEXT NOT NULL DEFAULT 'personal'");
  addColumnIfMissing(db, "hosted_access_tokens", "scopes_json", "TEXT NOT NULL DEFAULT '[\"memory:read\",\"memory:propose\"]'");
  addColumnIfMissing(db, "hosted_access_tokens", "rotation_family_id", "TEXT");
  addColumnIfMissing(db, "hosted_access_tokens", "rotated_from_id", "TEXT");
}

function addColumnIfMissing(
  db: UmosDatabase,
  table: string,
  column: string,
  definition: string
): void {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (rows.some((row) => row.name === column)) {
    return;
  }

  db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}

export function tableCounts(db: UmosDatabase): Record<string, number> {
  const tables = [
    "episodes",
    "sources",
    "sections",
    "events",
    "facts",
    "failures",
    "proposals",
    "eval_cases",
    "hosted_tenants",
    "hosted_spaces",
    "hosted_memberships",
    "hosted_organizations",
    "hosted_org_memberships",
    "hosted_org_spaces",
    "hosted_org_invitations",
    "hosted_audit_events",
    "hosted_access_tokens"
  ];
  const counts: Record<string, number> = {};

  for (const table of tables) {
    const row = db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as { count: number };
    counts[table] = row.count;
  }

  return counts;
}
