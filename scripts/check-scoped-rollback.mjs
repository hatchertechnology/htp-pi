#!/usr/bin/env node
// Mixed-scope rollback check for the htp-pi guidance.
//
// Installs the same git source at different revisions in the user (global) and
// project-local scopes from a disposable LOCAL git fixture, then verifies the
// documented project-local remove/install path moves only the project scope and
// leaves the global checkout at its exact revision. The git source is a local
// bare repository reached through a throwaway per-run git
// `insteadOf` mapping, and HOME/PI_CODING_AGENT_DIR/git config are isolated, so
// the check is offline and never touches the network or the user's profile.
//
// Skips (exit 0 with a notice) when the `pi` CLI is unavailable.
//
// Run: node scripts/check-scoped-rollback.mjs

import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const fixture = join(root, "scripts", "fixtures", "scoped-rollback");
const piBin = process.env.PI_BIN || "pi";

const version = spawnSync(piBin, ["--version"], { encoding: "utf8" });
if (version.error || version.status !== 0) {
  console.log(`scoped rollback skipped: ${piBin} is not available (${version.error?.message ?? version.status})`);
  process.exit(0);
}

const work = mkdtempSync(join(tmpdir(), "htp-pi-scoped-"));
const home = join(work, "home");
const agentDir = join(home, ".pi", "agent");
const project = join(work, "project");
const srcDir = join(work, "src");
const bareRoot = join(work, "bare");
const bareRepo = join(bareRoot, "hatchertechnology", "scoped-pi");
const gitConfig = join(home, ".gitconfig");
const source = "git:scoped.local/hatchertechnology/scoped-pi";
const errors = [];

mkdirSync(agentDir, { recursive: true });
mkdirSync(project, { recursive: true });
mkdirSync(dirname(bareRepo), { recursive: true });

const baseEnv = {
  ...process.env,
  HOME: home,
  TERM: "dumb",
  GIT_TERMINAL_PROMPT: "0",
  GIT_CONFIG_GLOBAL: gitConfig,
  GIT_CONFIG_NOSYSTEM: "1",
  PI_CODING_AGENT_DIR: agentDir,
};

function run(args, cwd, label) {
  const result = spawnSync(piBin, args, { cwd, env: baseEnv, encoding: "utf8" });
  if (result.status !== 0) {
    errors.push(`${label} failed (exit ${result.status}): ${(result.stderr || result.stdout).trim()}`);
  }
  return result;
}
function git(args, cwd) {
  const result = spawnSync("git", args, { cwd, env: baseEnv, encoding: "utf8" });
  if (result.status !== 0) {
    errors.push(`git ${args.join(" ")} failed: ${(result.stderr || result.stdout).trim()}`);
  }
  return result;
}
function packages(file) {
  try {
    return JSON.parse(readFileSync(file, "utf8")).packages ?? [];
  } catch {
    return [];
  }
}
function has(matches, needle) {
  return matches.some((m) => (typeof m === "string" ? m : m?.source) === needle);
}

const globalSettings = join(agentDir, "settings.json");
const projectSettings = join(project, ".pi", "settings.json");
const globalCheckout = join(agentDir, "git", "scoped.local", "hatchertechnology", "scoped-pi");
const projectCheckout = join(project, ".pi", "git", "scoped.local", "hatchertechnology", "scoped-pi");

try {
  // 1. Build the disposable local git fixture with three real revisions.
  cpSync(fixture, srcDir, { recursive: true });
  git(["init", "-q", "-b", "main"], srcDir);
  const commit = (label) => {
    writeFileSync(join(srcDir, "REV.txt"), `${label}\n`);
    git(["add", "-A"], srcDir);
    git(["-c", "user.email=scoped@example.invalid", "-c", "user.name=scoped", "commit", "-q", "-m", label], srcDir);
    return git(["rev-parse", "HEAD"], srcDir).stdout.trim();
  };
  const revA = commit("rev A");
  const revB = commit("rev B");
  const revC = commit("rev C");
  git(["clone", "--bare", srcDir, bareRepo], work);
  writeFileSync(gitConfig, `[url "file://${bareRepo}"]\n\tinsteadOf = https://scoped.local/hatchertechnology/scoped-pi\n`);

  // 2. Install different real revisions in each scope: global=revB, project=revC.
  run(["install", `${source}@${revB}`], home, "global install");
  run(["install", `${source}@${revC}`, "--local", "--approve"], project, "project install");
  if (!has(packages(globalSettings), `${source}@${revB}`)) errors.push("global install did not record revB");
  if (!has(packages(projectSettings), `${source}@${revC}`)) errors.push("project install did not record revC");
  if (git(["rev-parse", "HEAD"], globalCheckout).stdout.trim() !== revB) {
    errors.push("global checkout is not at revB");
  }
  if (git(["rev-parse", "HEAD"], projectCheckout).stdout.trim() !== revC) {
    errors.push("project checkout is not at revC");
  }

  // 3. Documented project-local rollback: remove only the project package.
  run(["remove", source, "--local", "--approve"], project, "project remove");
  if (has(packages(projectSettings), source)) errors.push("project remove left the project package");
  if (!has(packages(globalSettings), `${source}@${revB}`)) errors.push("project remove changed the global package");
  if (!existsSync(globalCheckout)) errors.push("project remove deleted the global checkout");
  if (git(["rev-parse", "HEAD"], globalCheckout).stdout.trim() !== revB) {
    errors.push("project remove moved the global checkout");
  }

  // 4. Roll the project back to revA; the global scope must not move.
  run(["install", `${source}@${revA}`, "--local", "--approve"], project, "project pinned reinstall");
  if (!has(packages(projectSettings), `${source}@${revA}`)) {
    errors.push("project reinstall did not record revA");
  }
  if (git(["rev-parse", "HEAD"], projectCheckout).stdout.trim() !== revA) {
    errors.push("project checkout is not at revA");
  }
  if (has(packages(globalSettings), `${source}@${revA}`)) {
    errors.push("project reinstall changed the global package");
  }
  if (git(["rev-parse", "HEAD"], globalCheckout).stdout.trim() !== revB) {
    errors.push("global checkout SHA changed after local reinstall");
  }
} finally {
  rmSync(work, { recursive: true, force: true });
}

if (errors.length) {
  console.error(`Scoped rollback FAILED (${errors.length} error${errors.length === 1 ? "" : "s"}):`);
  for (const error of errors) console.error(`  - ${error}`);
  process.exit(1);
}
console.log(
  `Scoped rollback OK: project-local remove/reinstall kept the global package at its exact revision while the project moved (${piBin} ${version.stdout.trim()}).`,
);
