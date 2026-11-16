#!/usr/bin/env node
// Bounded, offline re-verification of the Pi capabilities claimed in
// docs/pi-host-compatibility.md and contract/v1/host.json.
//
// Runs only the installed `pi` CLI's version/help output. No network, no
// session, no MCP connection. Exits 1 if the host no longer advertises the
// flags/commands the contract depends on.
//
// Run: node scripts/probe-pi-capabilities.mjs

import { execFileSync } from "node:child_process";

const checks = [];
const run = (args) =>
  execFileSync("pi", args, { encoding: "utf8", timeout: 30000, stdio: ["ignore", "pipe", "pipe"] });

function expect(name, text, needles) {
  const missing = needles.filter((n) => !text.includes(n));
  checks.push({ name, ok: missing.length === 0, detail: missing.length ? `missing: ${missing.join(", ")}` : "ok" });
}

try {
  const version = run(["--version"]).trim();
  checks.push({ name: "pi --version", ok: /^\d+\.\d+\.\d+/.test(version), detail: version });

  const root = run(["--help"]);
  expect("pi --help resources", root, ["--extension", "--skill", "--no-mcp", "--tools"]);

  const mcp = run(["mcp", "--help"]);
  expect("pi mcp --help", mcp, [
    "add", "remove", "login", "logout",
    "--url", "--header", "--bearer-token-env-var", "--oauth-client-registration",
  ]);

  const auth = run(["auth", "--help"]);
  expect("pi auth --help", auth, ["login", "logout", "print-bearer-token", "check"]);

  const install = run(["install", "--help"]);
  expect("pi install --help", install, ["git:"]);
} catch (err) {
  checks.push({ name: "pi CLI available", ok: false, detail: err.message });
}

let failed = 0;
for (const c of checks) {
  if (!c.ok) failed += 1;
  console.log(`${c.ok ? "PASS" : "FAIL"}  ${c.name}  (${c.detail})`);
}
console.log(`\n${checks.length - failed}/${checks.length} probes passed`);

if (failed) {
  console.error("Pi capability probe failed; contract claims may be stale.");
  process.exit(1);
}
console.log("Pi capability probe OK.");
