import { existsSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import type { VaultPaths } from "../core/paths.js";

export interface WatcherProfile {
  id: string;
  label: string;
  folders: string[];
  recursive: boolean;
  policy: {
    space: "personal" | "project" | "system";
    trustLevel: "untrusted" | "observed" | "trusted" | "verified";
    sourceOrigin: "manual" | "local_file" | "session" | "agent" | "connector" | "import" | "system";
    visibility: "private" | "space" | "team" | "client" | "public";
    sensitivity: "normal" | "internal" | "confidential" | "secret";
    queueOnly: boolean;
  };
}

export function watcherProfiles(paths: VaultPaths): WatcherProfile[] {
  const workspaceRoot = resolve(paths.root, "..", "..", "..");
  const userHome = homedir();
  return [
    {
      id: "inbox",
      label: "NeuraKeep Inbox",
      folders: [paths.inboxDir],
      recursive: false,
      policy: basePolicy("project", "manual", "normal")
    },
    {
      id: "openclaw",
      label: "OpenClaw Workspace Memory",
      folders: [join(workspaceRoot, "memory"), join(workspaceRoot, "state", "sessions")],
      recursive: true,
      policy: basePolicy("system", "agent", "internal")
    },
    {
      id: "codex",
      label: "Codex Sessions",
      folders: [join(userHome, ".codex", "sessions"), join(workspaceRoot, "state", "codex")],
      recursive: true,
      policy: basePolicy("project", "session", "internal")
    },
    {
      id: "claude",
      label: "Claude Sessions",
      folders: [join(userHome, ".claude", "projects"), join(workspaceRoot, "claude")],
      recursive: true,
      policy: basePolicy("project", "session", "internal")
    }
  ].map((profile) => ({
    ...profile,
    folders: profile.folders.map((folder) => resolve(folder)).filter((folder) => existsSync(folder))
  }));
}

export function resolveWatcherProfile(paths: VaultPaths, id: string | undefined): WatcherProfile | undefined {
  return watcherProfiles(paths).find((profile) => profile.id === id);
}

export function listProfileFiles(
  paths: VaultPaths,
  folders: string[],
  recursive: boolean,
  limit = 250
): Array<{ path: string; name: string; bytes: number; kind: "markdown" | "session" | "pdf" }> {
  const roots = approvedRoots(paths);
  const files: Array<{ path: string; name: string; bytes: number; kind: "markdown" | "session" | "pdf" }> = [];
  for (const folder of folders) {
    const resolved = resolve(folder);
    if (!roots.some((root) => resolved === root || resolved.startsWith(`${root}\\`) || resolved.startsWith(`${root}/`))) {
      continue;
    }
    collectFiles(resolved, resolved, recursive, files, limit);
    if (files.length >= limit) {
      break;
    }
  }
  return files;
}

function collectFiles(
  root: string,
  current: string,
  recursive: boolean,
  files: Array<{ path: string; name: string; bytes: number; kind: "markdown" | "session" | "pdf" }>,
  limit: number
): void {
  if (!existsSync(current) || files.length >= limit) {
    return;
  }
  for (const name of readdirSync(current)) {
    if (files.length >= limit) {
      return;
    }
    const path = join(current, name);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      if (recursive && !name.startsWith(".") && name !== "node_modules") {
        collectFiles(root, path, recursive, files, limit);
      }
      continue;
    }
    const lower = name.toLowerCase();
    if (lower.endsWith(".md") || lower.endsWith(".markdown") || lower.endsWith(".txt")) {
      files.push({ path, name: path.slice(root.length + 1), bytes: stat.size, kind: "markdown" });
    } else if (lower.endsWith(".jsonl")) {
      files.push({ path, name: path.slice(root.length + 1), bytes: stat.size, kind: "session" });
    } else if (lower.endsWith(".pdf")) {
      files.push({ path, name: path.slice(root.length + 1), bytes: stat.size, kind: "pdf" });
    }
  }
}

function approvedRoots(paths: VaultPaths): string[] {
  return [resolve(paths.root), resolve(paths.root, "..", "..", ".."), homedir()];
}

function basePolicy(
  space: WatcherProfile["policy"]["space"],
  sourceOrigin: WatcherProfile["policy"]["sourceOrigin"],
  sensitivity: WatcherProfile["policy"]["sensitivity"]
): WatcherProfile["policy"] {
  return {
    space,
    trustLevel: "observed",
    sourceOrigin,
    visibility: "private",
    sensitivity,
    queueOnly: true
  };
}
