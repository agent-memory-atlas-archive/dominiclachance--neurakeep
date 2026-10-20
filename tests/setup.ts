import { rmSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll } from "vitest";

const keyPath = join(tmpdir(), `neurakeep-vitest-master-${process.pid}-${randomBytes(6).toString("hex")}.key`);
writeFileSync(keyPath, `${randomBytes(32).toString("base64url")}\n`, { mode: 0o600, flag: "wx" });
process.env.NEURAKEEP_MASTER_KEY_FILE = keyPath;
afterAll(() => rmSync(keyPath, { force: true }));
