import { mkdtempSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { initCommand } from "../src/cli/commands/init.js";
import { getVaultPaths } from "../src/core/paths.js";
import { openDatabase, tableCounts } from "../src/db/client.js";

const tempRoots: string[] = [];

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("umos init", () => {
  it("creates a local vault with config, database, folders, and wiki templates", () => {
    const projectDir = mkdtempSync(join(tmpdir(), "umos-init-"));
    tempRoots.push(projectDir);

    const root = join(projectDir, ".umos");
    initCommand({ root });
    const paths = getVaultPaths(root);

    expect(existsSync(paths.configPath)).toBe(true);
    expect(existsSync(paths.dbPath)).toBe(true);
    expect(existsSync(join(paths.rawDir, "sessions"))).toBe(true);
    expect(existsSync(join(paths.rawDir, "episodes"))).toBe(true);
    expect(existsSync(paths.eventsDir)).toBe(true);
    expect(existsSync(join(paths.wikiDir, "index.md"))).toBe(true);
    expect(existsSync(paths.pendingUpdatesDir)).toBe(true);

    const db = openDatabase(paths.dbPath, true);
    try {
      expect(tableCounts(db)).toEqual({
        episodes: 0,
        sources: 0,
        sections: 0,
        events: 0,
        facts: 0,
        failures: 0,
        proposals: 0,
        eval_cases: 0,
        hosted_tenants: 0,
        hosted_spaces: 0,
        hosted_memberships: 0,
        hosted_organizations: 0,
        hosted_org_memberships: 0,
        hosted_org_spaces: 0,
        hosted_org_invitations: 0,
        hosted_audit_events: 0,
        hosted_access_tokens: 0
      });
    } finally {
      db.close();
    }
  });
});
