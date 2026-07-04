import Database from "better-sqlite3";
import { dirname } from "node:path";
import { mkdirSync } from "node:fs";
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
    "eval_cases"
  ];
  const counts: Record<string, number> = {};

  for (const table of tables) {
    const row = db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as { count: number };
    counts[table] = row.count;
  }

  return counts;
}
