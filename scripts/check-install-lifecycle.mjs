#!/usr/bin/env node
// Real-CLI install/uninstall/upgrade lifecycle check for the htp-pi package.
//
// Uses an isolated PI_CODING_AGENT_DIR so it never touches the user's settings.
// Skips (exit 0 with a notice) when the `pi` CLI is not available.
//
// Run: node scripts/check-install-lifecycle.mjs

import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const piBin = process.env.PI_BIN || "pi";

const version = spawnSync(piBin, ["--version"], { encoding: "utf8" });
if (version.error || version.status !== 0) {
  console.log(`install lifecycle skipped: ${piBin} is not available (${version.error?.message ?? version.status})`);
  process.exit(0);
}

const agentDir = mkdtempSync(join(tmpdir(), "htp-pi-install-"));
const env = { ...process.env, PI_CODING_AGENT_DIR: agentDir, PI_OFFLINE: "1" };
const errors = [];

function run(args, label) {
  const result = spawnSync(piBin, args, { env, encoding: "utf8" });
  if (result.status !== 0) {
    errors.push(`${label} failed (exit ${result.status}): ${result.stderr || result.stdout}`);
  }
  return result;
}

function settingsPackages() {
  try {
    return JSON.parse(readFileSync(join(agentDir, "settings.json"), "utf8")).packages ?? [];
  } catch {
    return [];
  }
}

try {
  run(["install", root], "install");
  const installed = settingsPackages();
  // Pi records the resolved checkout path (relative to the settings file), not
  // the package name, so assert against this checkout's own root. This keeps
  // the check valid in any worktree/CI checkout.
  const resolvedInstalled = installed
    .filter((p) => typeof p === "string")
    .map((p) => (p.startsWith("/") ? p : resolve(agentDir, p)));
  if (!resolvedInstalled.includes(root)) {
    errors.push(`install did not record this checkout (${root}): ${JSON.stringify(installed)}`);
  }

  const list = run(["list"], "list");
  if (!list.stdout.includes(root)) errors.push(`list did not show the installed checkout path (${root})`);

  run(["update", "--extensions"], "update");

  run(["remove", root], "remove");
  if (settingsPackages().length !== 0) {
    errors.push(`remove left packages behind: ${JSON.stringify(settingsPackages())}`);
  }
} finally {
  rmSync(agentDir, { recursive: true, force: true });
}

if (errors.length) {
  console.error(`Install lifecycle FAILED (${errors.length} error${errors.length === 1 ? "" : "s"}):`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(`Install lifecycle OK: ${piBin} install/list/update/remove in an isolated agent dir (${version.stdout.trim()}).`);
