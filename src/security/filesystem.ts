import { chmodSync, closeSync, existsSync, fsyncSync, lstatSync, mkdirSync, openSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { randomBytes } from "node:crypto";

export function secureDirectory(path: string): void {
  mkdirSync(path, { recursive: true, mode: 0o700 });
  rejectSymlink(path);
  chmodSync(path, 0o700);
  assertMode(path, 0o700);
}

export function secureFile(path: string): void {
  rejectSymlink(path);
  chmodSync(path, 0o600);
  assertMode(path, 0o600);
}

export function secureAtomicWrite(path: string, value: Buffer | string): void {
  secureDirectory(dirname(path));
  const temporary = `${path}.tmp-${process.pid}-${randomBytes(6).toString("hex")}`;
  try {
    writeFileSync(temporary, value, { mode: 0o600, flag: "wx" });
    secureFile(temporary);
    const descriptor = openSync(temporary, "r+");
    try { fsyncSync(descriptor); } finally { closeSync(descriptor); }
    renameSync(temporary, path);
    secureFile(path);
  } catch (error) {
    try { if (existsSync(temporary)) { chmodSync(temporary, 0o600); rmSync(temporary, { force: true }); } } catch { /* best effort */ }
    throw error;
  }
}

export function hardenTree(root: string): void {
  secureDirectory(root);
  const stack = [resolve(root)];
  while (stack.length > 0) {
    const current = stack.pop()!;
    const entries = requireDirectoryEntries(current);
    for (const entry of entries) {
      const path = resolve(current, entry.name);
      if (!path.startsWith(`${resolve(root)}\\`) && !path.startsWith(`${resolve(root)}/`)) throw new Error("Permission walk escaped its root.");
      if (entry.isSymbolicLink()) throw new Error(`Hosted storage cannot contain symbolic links: ${path}`);
      if (entry.isDirectory()) { secureDirectory(path); stack.push(path); }
      else if (entry.isFile()) secureFile(path);
    }
  }
}

function requireDirectoryEntries(path: string) {
  return readdirSync(path, { withFileTypes: true });
}

function rejectSymlink(path: string): void {
  if (existsSync(path) && lstatSync(path).isSymbolicLink()) throw new Error(`Hosted storage path cannot be a symbolic link: ${path}`);
}

function assertMode(path: string, expected: number): void {
  if (process.platform === "win32") return;
  const actual = statSync(path).mode & 0o777;
  if (actual !== expected) throw new Error(`Hosted storage permissions for ${path} are ${actual.toString(8)}; expected ${expected.toString(8)}.`);
}
