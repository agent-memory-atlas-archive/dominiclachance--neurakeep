#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve, join } from "node:path";

const requiredAbsent = [
  ".env",
  ".env.local",
  ".env.production",
  "marketing-site",
  "docs/HOSTED_ARCHITECTURE.md",
  "docs/HOSTED_FIREBASE_MVP.md",
  "docs/REMOTE_TEAM_ARCHITECTURE.md",
  "docs/FEATURE_MATRIX.md"
];
const forbiddenTracked = [...requiredAbsent, ".umos", "dist", "web-dist", "test-results", "playwright-report", "blob-report"];

const root = resolve(process.cwd(), process.argv[2] ?? ".");
const errors = [];

run("node", ["scripts/security-scan.mjs", "--release", root]);

for (const path of requiredAbsent) {
  if (existsSync(join(root, path))) {
    errors.push(`Release tree still contains forbidden artifact: ${path}`);
  }
}

const tracked = execFileSync("git", ["ls-files"], { cwd: root, encoding: "utf8" }).split(/\r?\n/);
for (const path of forbiddenTracked) {
  if (tracked.some((file) => file === path || file.startsWith(`${path}/`))) errors.push(`Forbidden artifact is tracked: ${path}`);
}

if (!existsSync(join(root, "LICENSE"))) {
  errors.push("LICENSE is missing.");
}
if (!existsSync(join(root, "docs", "OPEN_SOURCE.md"))) {
  errors.push("docs/OPEN_SOURCE.md is missing.");
}

if (errors.length > 0) {
  console.error("NeuraKeep release check failed:");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log("NeuraKeep release check passed.");

function run(command, args) {
  execFileSync(command, args, { cwd: root, stdio: "inherit" });
}
