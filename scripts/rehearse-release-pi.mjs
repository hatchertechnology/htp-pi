#!/usr/bin/env node
// Disposable-home release rehearsal for the htp-pi package.
//
// Installs the anchor baseline (baseline-pre-r5-46f6b81a, commit 46f6b81a…),
// upgrades to the release target, and rolls back to the anchor, all against the
// real `pi` CLI in an isolated HOME/PI_CODING_AGENT_DIR. The git source is a
// local bare mirror reached through a throwaway `insteadOf` mapping, so the run
// is offline and never touches the owner's ~/.pi/agent. No tags are created: the
// anchor and the target are pinned by their full commit SHAs.
//
// Skips (exit 0 with a notice) when the `pi` CLI is not available.
//
// Usage:
//   node scripts/rehearse-release-pi.mjs --target <full-40-hex-sha> [--anchor <sha>] [--log <file>]
//
// The anchor defaults to the Wave 1 R5 anchor commit 46f6b81a90c50a97c5f6c3b73a3eed67a7ee9b39.
// The target must be the full SHA of the release commit whose tree is being rehearsed.

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");

const ANCHOR = "46f6b81a90c50a97c5f6c3b73a3eed67a7ee9b39";
const SOURCE = "git:github.com/hatchertechnology/htp-pi";
const GIT_URL = "https://github.com/hatchertechnology/htp-pi";
const CHECKOUT = ["git", "github.com", "hatchertechnology", "htp-pi"];
const FULL_SHA = /^[0-9a-f]{40}$/;

const args = process.argv.slice(2);
function argValue(name) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}
const target = argValue("--target");
if (!target || !FULL_SHA.test(target)) {
  console.error("usage: node scripts/rehearse-release-pi.mjs --target <full-40-hex-sha> [--anchor <sha>] [--log <file>]");
  process.exit(2);
}
const anchor = argValue("--anchor") ?? ANCHOR;
if (!FULL_SHA.test(anchor)) {
  console.error("--anchor must be a full 40-hex commit SHA");
  process.exit(2);
}
const logFile = argValue("--log");
const logLines = [];
function log(line) {
  logLines.push(line);
  console.log(line);
}

const piBin = process.env.PI_BIN || "pi";
const version = spawnSync(piBin, ["--version"], { encoding: "utf8" });
if (version.error || version.status !== 0) {
  console.log(`rehearsal skipped: ${piBin} CLI is not available`);
  process.exit(0);
}

// Never touch the owner's ~/.pi/agent. Read-only hash before and after; the
// child processes always run with HOME and PI_CODING_AGENT_DIR inside the
// disposable root, and the script refuses a root that resolves there.
const realHome = homedir();
const realAgentDir = join(realHome, ".pi", "agent");
const realSettings = join(realAgentDir, "settings.json");
const sha256 = (path) => createHash("sha256").update(readFileSync(path)).digest("hex");
const realSettingsBefore = existsSync(realSettings) ? sha256(realSettings) : "(absent)";

const work = mkdtempSync(join(tmpdir(), "htp-pi-rehearsal-"));
if (resolve(work).startsWith(realAgentDir)) {
  console.error("refusing to run inside the owner's agent directory");
  process.exit(2);
}
const home = join(work, "home");
const agentDir = join(home, ".pi", "agent");
const mirror = join(work, "mirror.git");
const gitConfig = join(home, ".gitconfig");
const checkout = join(agentDir, ...CHECKOUT);
const sentinel = join(agentDir, "rehearsal-sentinel.txt");
const results = [];
const errors = [];

function run(cmd, cmdArgs, env, label) {
  const r = spawnSync(cmd, cmdArgs, { cwd: work, env, encoding: "utf8" });
  log(`$ ${cmd} ${cmdArgs.join(" ")}  # ${label} -> exit ${r.status}`);
  if (r.stdout.trim()) log(`  stdout: ${r.stdout.trim().split("\n").join(" | ").slice(0, 400)}`);
  if (r.stderr.trim()) log(`  stderr: ${r.stderr.trim().split("\n").join(" | ").slice(0, 400)}`);
  return r;
}
function check(name, ok, detail = "") {
  results.push({ name, ok, detail });
  log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) errors.push(`${name}${detail ? ` — ${detail}` : ""}`);
}
function settingsPackages() {
  try {
    return JSON.parse(readFileSync(join(agentDir, "settings.json"), "utf8")).packages ?? [];
  } catch {
    return [];
  }
}

const baseEnv = {
  ...process.env,
  HOME: home,
  PI_CODING_AGENT_DIR: agentDir,
  GIT_CONFIG_GLOBAL: gitConfig,
  GIT_CONFIG_NOSYSTEM: "1",
  GIT_TERMINAL_PROMPT: "0",
  TERM: "dumb",
};

try {
  log(`rehearsal root: ${work}`);
  log(`pi version: ${version.stdout.trim()}`);
  log(`anchor: ${anchor} (baseline-pre-r5-46f6b81a; no tag is created)`);
  log(`target: ${target}`);
  log(`owner settings.json sha256 before: ${realSettingsBefore}`);

  mkdirSync(home, { recursive: true });
  mkdirSync(agentDir, { recursive: true });
  writeFileSync(sentinel, "survives every step\n");

  // 1. Local bare mirror of this checkout (offline; no network, no tags).
  const clone = run("git", ["clone", "--bare", "--quiet", root, mirror], baseEnv, "bare mirror of this checkout");
  check("bare mirror cloned", clone.status === 0);
  // Fetch-by-SHA support for the pinned install/update/rollback steps.
  run("git", ["--git-dir", mirror, "config", "uploadpack.allowReachableSHA1InWant", "true"], baseEnv, "mirror fetch-by-SHA (reachable)");
  run("git", ["--git-dir", mirror, "config", "uploadpack.allowAnySHA1InWant", "true"], baseEnv, "mirror fetch-by-SHA (any)");
  const mirrorHas = (sha) => spawnSync("git", ["--git-dir", mirror, "cat-file", "-t", sha], { encoding: "utf8" }).stdout.trim() === "commit";
  check("mirror has the anchor commit", mirrorHas(anchor));
  check("mirror has the target commit", mirrorHas(target));

  // 2. insteadOf mapping: the real git: source resolves to the local mirror.
  writeFileSync(gitConfig, `[url "file://${mirror}"]\n\tinsteadOf = ${GIT_URL}\n`);

  // 3. Install the anchor baseline and verify the installed tree.
  let r = run(piBin, ["install", `${SOURCE}@${anchor}`], baseEnv, "install anchor");
  check("install anchor exits 0", r.status === 0);
  check("settings record the anchor pin", settingsPackages().includes(`${SOURCE}@${anchor}`), JSON.stringify(settingsPackages()));
  const anchorHead = spawnSync("git", ["rev-parse", "HEAD"], { cwd: checkout, encoding: "utf8" }).stdout.trim();
  check("checkout HEAD is the anchor", anchorHead === anchor, anchorHead);
  // npm leaves an untracked package-lock.json in the checkout (the dependency
  // step recreates it after Pi removes the tracked one), so the tree check
  // verifies tracked files only; the pinned tree must match the commit.
  const anchorDirty = spawnSync("git", ["status", "--porcelain", "--untracked-files=no"], { cwd: checkout, encoding: "utf8" }).stdout.trim();
  const anchorUntracked = spawnSync("git", ["status", "--porcelain"], { cwd: checkout, encoding: "utf8" }).stdout.trim();
  check("anchor checkout tree matches the commit", anchorDirty === "", anchorDirty || "clean");
  log(`  anchor untracked leftovers: ${anchorUntracked || "none"}`);
  const anchorManifest = JSON.parse(readFileSync(join(checkout, "package.json"), "utf8"));
  check("anchor package version is 1.0.0", anchorManifest.version === "1.0.0", anchorManifest.version);
  check("anchor has no lifecycle-remediation skill", !existsSync(join(checkout, "skills", "lifecycle-remediation")));
  check("anchor has no parity-reads-1.4 tree", !existsSync(join(checkout, "contract", "parity-reads-1.4")));
  check("sentinel survives install", readFileSync(sentinel, "utf8").startsWith("survives"));

  // 4. Upgrade to the release target and verify the installed tree.
  r = run(piBin, ["install", `${SOURCE}@${target}`], baseEnv, "upgrade to target");
  check("upgrade to target exits 0", r.status === 0);
  check("settings record the target pin", settingsPackages().includes(`${SOURCE}@${target}`), JSON.stringify(settingsPackages()));
  const targetHead = spawnSync("git", ["rev-parse", "HEAD"], { cwd: checkout, encoding: "utf8" }).stdout.trim();
  check("checkout HEAD is the target", targetHead === target, targetHead);
  const targetDirty = spawnSync("git", ["status", "--porcelain", "--untracked-files=no"], { cwd: checkout, encoding: "utf8" }).stdout.trim();
  const targetUntracked = spawnSync("git", ["status", "--porcelain"], { cwd: checkout, encoding: "utf8" }).stdout.trim();
  check("target checkout tree matches the commit", targetDirty === "", targetDirty || "clean");
  log(`  target untracked leftovers: ${targetUntracked || "none"}`);
  const targetManifest = JSON.parse(readFileSync(join(checkout, "package.json"), "utf8"));
  check("target package version is 1.1.0", targetManifest.version === "1.1.0", targetManifest.version);
  check("target ships the lifecycle-remediation skill", existsSync(join(checkout, "skills", "lifecycle-remediation", "SKILL.md")));
  check("target ships the vendored 1.4 contract", existsSync(join(checkout, "contract", "parity-reads-1.4", "docs/plugin-contract/v1.4/parity-reads.json")));
  check("target capability version is 1.1.0", readFileSync(join(checkout, "extensions/htp-pi/lib/capabilities.mjs"), "utf8").includes('PACKAGE_VERSION = "1.1.0"'));
  check("sentinel survives upgrade", readFileSync(sentinel, "utf8").startsWith("survives"));

  // 5. The installed target behaves like the rehearsed tree: run the host smoke
  // from the installed checkout against the real Pi runtime.
  const releasesRoot = join(realHome, ".pi", "agent", "install", "releases");
  let hostModule;
  try {
    const { readdirSync } = await import("node:fs");
    for (const release of readdirSync(releasesRoot).sort().reverse()) {
      const candidate = join(releasesRoot, release, "node_modules", "@earendil-works", "pi-coding-agent", "dist", "index.js");
      if (existsSync(candidate)) { hostModule = candidate; break; }
    }
  } catch { /* no installed runtime: the smoke step is skipped below */ }
  if (hostModule) {
    const smoke = run(process.execPath, [join(checkout, "scripts", "host-smoke.mjs")], { ...baseEnv, HTP_PI_HOST_MODULE: hostModule }, "host smoke from the installed target");
    check("host smoke passes from the installed target", smoke.status === 0);
  } else {
    log("host smoke skipped: no installed Pi runtime module found");
  }

  // 6. Rollback to the anchor and verify the installed tree.
  r = run(piBin, ["install", `${SOURCE}@${anchor}`], baseEnv, "rollback to anchor");
  check("rollback to anchor exits 0", r.status === 0);
  check("settings record the anchor pin again", settingsPackages().includes(`${SOURCE}@${anchor}`), JSON.stringify(settingsPackages()));
  const rollbackHead = spawnSync("git", ["rev-parse", "HEAD"], { cwd: checkout, encoding: "utf8" }).stdout.trim();
  check("rollback checkout HEAD is the anchor", rollbackHead === anchor, rollbackHead);
  const rollbackDirty = spawnSync("git", ["status", "--porcelain", "--untracked-files=no"], { cwd: checkout, encoding: "utf8" }).stdout.trim();
  const rollbackUntracked = spawnSync("git", ["status", "--porcelain"], { cwd: checkout, encoding: "utf8" }).stdout.trim();
  check("rollback checkout tree matches the commit", rollbackDirty === "", rollbackDirty || "clean");
  log(`  rollback untracked leftovers: ${rollbackUntracked || "none"}`);
  const rollbackManifest = JSON.parse(readFileSync(join(checkout, "package.json"), "utf8"));
  check("rollback package version is 1.0.0", rollbackManifest.version === "1.0.0", rollbackManifest.version);
  check("rollback removed the lifecycle-remediation skill", !existsSync(join(checkout, "skills", "lifecycle-remediation")));
  check("rollback removed the parity-reads-1.4 tree", !existsSync(join(checkout, "contract", "parity-reads-1.4")));
  check("sentinel survives rollback", readFileSync(sentinel, "utf8").startsWith("survives"));

  // 7. Uninstall leaves nothing behind; the sentinel still survives.
  r = run(piBin, ["remove", SOURCE], baseEnv, "uninstall");
  check("uninstall exits 0", r.status === 0);
  check("no packages remain", settingsPackages().length === 0, JSON.stringify(settingsPackages()));
  check("sentinel survives uninstall", readFileSync(sentinel, "utf8").startsWith("survives"));

  // 8. The owner's ~/.pi/agent settings are byte-identical.
  const realSettingsAfter = existsSync(realSettings) ? sha256(realSettings) : "(absent)";
  check("owner settings.json untouched", realSettingsAfter === realSettingsBefore, `${realSettingsBefore} -> ${realSettingsAfter}`);
} finally {
  rmSync(work, { recursive: true, force: true });
}

if (logFile) {
  writeFileSync(logFile, logLines.join("\n") + "\n");
}
const passed = results.filter((r) => r.ok).length;
log(`rehearsal summary: ${passed}/${results.length} steps passed${errors.length ? `; failures: ${errors.join("; ")}` : ""}`);
if (errors.length) {
  console.error(`Rehearsal FAILED (${errors.length} of ${results.length} steps)`);
  process.exit(1);
}
console.log(`Rehearsal OK: ${passed}/${results.length} steps passed (anchor ${anchor.slice(0, 8)} -> target ${target.slice(0, 8)} -> anchor, disposable home, no tags).`);
