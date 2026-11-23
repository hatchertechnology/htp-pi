#!/usr/bin/env node
// Offline package/discovery check for the installable htp-pi Pi package.
//
// Validates package metadata, the `pi` manifest, that every declared resource
// exists, that skills are well-formed and match contract/wave1/host.json, and
// that published text files do not leak local absolute paths.
//
// Run: node scripts/check-package.mjs

import { readFileSync, existsSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const errors = [];
const fail = (msg) => errors.push(msg);
const readJson = (p) => JSON.parse(readFileSync(p, "utf8"));

// Published text files must not leak local absolute paths / usernames.
const ABS_PATH = /(?:\/home\/|\/mnt\/|\/Users\/|\/root\/|\/private\/|\/var\/folders\/|\/tmp\/|[A-Za-z]:\\|\\\\)/;
function scanText(rel) {
  let text;
  try {
    text = readFileSync(join(root, rel), "utf8");
  } catch {
    return;
  }
  text.split("\n").forEach((line, i) => {
    if (ABS_PATH.test(line)) fail(`${rel}:${i + 1}: absolute local path leaked`);
  });
}
// ---------- package.json ----------
let pkg;
try {
  pkg = readJson(join(root, "package.json"));
} catch (err) {
  fail(`package.json: cannot read/parse: ${err.message}`);
}
if (pkg) {
  if (!/^[a-z0-9][a-z0-9._-]*$/.test(pkg.name ?? "")) fail("package.json: invalid name");
  if (!/^\d+\.\d+\.\d+/.test(pkg.version ?? "")) fail("package.json: version must be semver");
  if (!pkg.pi || typeof pkg.pi !== "object") fail("package.json: missing pi manifest");
  if (pkg.private === true) fail("package.json: installable package must not be private");
  for (const [key, paths] of Object.entries(pkg.pi ?? {})) {
    if (!Array.isArray(paths)) {
      fail(`package.json: pi.${key} must be an array`);
      continue;
    }
    for (const p of paths) {
      if (typeof p !== "string") {
        fail(`package.json: pi.${key} entries must be strings`);
        continue;
      }
      if (!existsSync(join(root, p))) fail(`package.json: pi.${key} path missing: ${p}`);
    }
  }
  if (!pkg.peerDependencies?.["@earendil-works/pi-coding-agent"]) {
    fail("package.json: host package must be a peerDependency");
  }
  if (pkg.dependencies?.["@earendil-works/pi-coding-agent"] || pkg.dependencies?.typebox) {
    fail("package.json: host-provided packages must not be in dependencies");
  }
  scanText("package.json");
}

// ---------- extension entry ----------
const entry = "extensions/htp-pi/index.ts";
if (!existsSync(join(root, entry))) fail(`missing extension entry ${entry}`);
const entryText = existsSync(join(root, entry)) ? readFileSync(join(root, entry), "utf8") : "";
for (const needle of ["registerTool", "registerMcpServer", "pi.exec"]) {
  if (!entryText.includes(needle)) fail(`extension entry must use ${needle}`);
}

// ---------- skills ----------
const wave1Host = readJson(join(root, "contract", "wave1", "host.json"));
const declaredSkills = new Set(wave1Host.skills ?? []);
const skillsDir = join(root, "skills");
const skillDirs = existsSync(skillsDir)
  ? readdirSync(skillsDir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name)
  : [];
if (skillDirs.length === 0) fail("skills/: no skill directories found");
const names = new Set();
for (const dir of skillDirs) {
  const skillPath = join("skills", dir, "SKILL.md");
  if (!existsSync(join(root, skillPath))) {
    fail(`${skillPath}: missing SKILL.md`);
    continue;
  }
  const text = readFileSync(join(root, skillPath), "utf8");
  const match = text.match(/^---\n([\s\S]*?)\n---/);
  if (!match) {
    fail(`${skillPath}: missing frontmatter`);
    continue;
  }
  const fm = match[1];
  const name = fm.match(/^name:\s*(.+)$/m)?.[1]?.trim();
  const description = fm.match(/^description:\s*(.+)$/m)?.[1]?.trim();
  if (!name) fail(`${skillPath}: missing name`);
  if (!description || description.length > 1024) fail(`${skillPath}: missing or oversized description`);
  if (name && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name)) fail(`${skillPath}: invalid skill name "${name}"`);
  if (name && name !== dir) fail(`${skillPath}: declared name "${name}" must match directory "${dir}"`);
  if (name) {
    if (names.has(name)) fail(`${skillPath}: duplicate skill name "${name}"`);
    names.add(name);
    if (!declaredSkills.has(name)) fail(`${skillPath}: skill "${name}" missing from contract/wave1/host.json skills`);
  }
  scanText(skillPath);
}
for (const declared of declaredSkills) {
  if (!names.has(declared)) fail(`contract/wave1/host.json lists skill "${declared}" with no skills/${declared}/SKILL.md`);
}

// ---------- wave1 host profile shape ----------
for (const key of ["host", "displayName", "observedVersion", "packageStatus", "transports", "auth", "distribution", "readiness", "gates"]) {
  if (!(key in wave1Host)) fail(`contract/wave1/host.json: missing "${key}"`);
}
if (wave1Host.host !== "pi") fail('contract/wave1/host.json: host must be "pi"');
if (!["not-implemented", "fixture-defined", "implemented"].includes(wave1Host.packageStatus)) {
  fail("contract/wave1/host.json: invalid packageStatus");
}
for (const key of ["install", "upgrade", "rollback"]) {
  if (typeof wave1Host.distribution?.[key] !== "string" || wave1Host.distribution[key] === "") {
    fail(`contract/wave1/host.json: distribution.${key} required`);
  }
}
// The contract's rollback example must pin a complete, immutable git ref and the
// published docs must mirror that exact example. Pi supports tags, so this
// checks only the contract's rollback example and does not ban tags elsewhere.
// The ref must be exactly 40 hex with full-token termination, so a suffixed ref
// such as @<40hex>-not-a-commit cannot pass. Offline: shape/agreement only, no
// remote lookup.
const rollback = wave1Host.distribution?.rollback ?? "";
const PIN_RE = /git:[^\s"'`@]+@[0-9a-f]{40}(?![0-9A-Za-z._/-])/g;
const contractPins = [...rollback.matchAll(PIN_RE)].map((m) => m[0]);
if (contractPins.length === 0) {
  fail("contract/wave1/host.json: distribution.rollback must show a full git source pin (git:<source>@<40-hex-commit>)");
}
const packageDoc = existsSync(join(root, "docs", "package.md"))
  ? readFileSync(join(root, "docs", "package.md"), "utf8")
  : "";
const docPins = new Set([...packageDoc.matchAll(PIN_RE)].map((m) => m[0]));
for (const pin of contractPins) {
  if (!docPins.has(pin)) {
    fail(`docs/package.md: rollback example must use the exact pin shown in contract/wave1/host.json (${pin})`);
  }
}
scanText("contract/wave1/host.json");
scanText("contract/wave1/operations.json");
scanText("contract/wave1/overrides.json");

// ---------- published docs ----------
for (const rel of ["README.md", "docs/pi-host-compatibility.md", "docs/package.md", "docs/oauth-verification.md"]) {
  if (existsSync(join(root, rel))) scanText(rel);
}

// ---------- report ----------
if (errors.length) {
  console.error(`Pi package check FAILED (${errors.length} error${errors.length === 1 ? "" : "s"}):`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(
  `Pi package OK: ${pkg.name}@${pkg.version} skills=${names.size} ` +
    `entry=${entry} packageStatus=${wave1Host.packageStatus} observedVersion=${wave1Host.observedVersion}`,
);
