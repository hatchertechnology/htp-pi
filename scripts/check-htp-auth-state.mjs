#!/usr/bin/env node
// Real-host auth-required state check for the HTP MCP endpoint.
//
// In an isolated PI_CODING_AGENT_DIR, configures the HTP server with the real
// `pi mcp add` and confirms `pi mcp list` reports it needs sign-in. This uses no
// credentials and never signs in. Skips when the `pi` CLI is unavailable or
// HTP_PI_ALLOW_OFFLINE=1.
//
// Run: node scripts/check-htp-auth-state.mjs

import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { resolveHtpMcpUrl } from "../extensions/htp-pi/lib/htp-connection.mjs";

const piBin = process.env.PI_BIN || "pi";
const version = spawnSync(piBin, ["--version"], { encoding: "utf8" });
if (version.error || version.status !== 0) {
  console.log(`HTP auth-state check skipped: ${piBin} not available.`);
  process.exit(0);
}
if (process.env.HTP_PI_ALLOW_OFFLINE === "1") {
  console.log("HTP auth-state check skipped: offline mode requested.");
  process.exit(0);
}

const agentDir = mkdtempSync(join(tmpdir(), "htp-pi-auth-state-"));
const env = { ...process.env, PI_CODING_AGENT_DIR: agentDir };
const url = resolveHtpMcpUrl();
const errors = [];

try {
  const add = spawnSync(piBin, ["mcp", "add", "htp", "--url", url], { env, encoding: "utf8" });
  if (add.status !== 0) errors.push(`pi mcp add failed: ${add.stderr || add.stdout}`);

  const list = spawnSync(piBin, ["mcp", "list"], { env, encoding: "utf8", timeout: 60_000 });
  const output = `${list.stdout}\n${list.stderr}`;
  if (!/needs sign-in/i.test(output)) {
    errors.push(`pi mcp list did not report the HTP server as needing sign-in:\n${output}`);
  } else {
    console.log("pi mcp list -> htp: needs sign-in (fail-closed, no credential used)");
  }
} finally {
  rmSync(agentDir, { recursive: true, force: true });
}

if (errors.length) {
  console.error(`HTP auth-state check FAILED (${errors.length}):`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log("HTP auth-state check OK: the real host requires sign-in before HTP tools connect.");
