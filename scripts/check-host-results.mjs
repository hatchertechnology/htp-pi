#!/usr/bin/env node
// Local Pi host test against the PINNED canonical contract fixtures.
//
// Uses the vendored canonical validator (contract/vendor/plugin-contract/
// plugin-contract.mjs) to validate a Pi results envelope for the pinned
// fixtures. By default it builds the envelope from the fixtures' `expected`
// values (a host profile-projection conformance run, NOT a live adapter). Pass
// `--results <file.json>` to validate observations produced by a real adapter.
//
// Run: node scripts/check-host-results.mjs [--results file.json]

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { readJson, validateResults } from "../contract/vendor/plugin-contract/plugin-contract.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const vendor = join(here, "..", "contract", "vendor", "plugin-contract", "v1");

const fixtures = readJson(join(vendor, "conformance.json"));
const capabilities = readJson(join(vendor, "capabilities.json"));
const ops = capabilities.operations;

const args = process.argv.slice(2);
let envelope;
let mode;
if (args[0] === "--results") {
  if (!args[1]) {
    console.error("usage: node scripts/check-host-results.mjs [--results file.json]");
    process.exit(2);
  }
  envelope = JSON.parse(readFileSync(args[1], "utf8"));
  mode = "adapter observations";
} else if (args.length) {
  console.error("usage: node scripts/check-host-results.mjs [--results file.json]");
  process.exit(2);
} else {
  // Host profile projection: every fixture's documented expected result is what
  // the Pi adapter must produce. No live side effects are claimed.
  envelope = {
    contractVersion: fixtures.contractVersion,
    host: "pi",
    observations: fixtures.scenarios.map((s) => ({ id: s.id, result: s.expected })),
  };
  mode = "profile projection (not live)";
}

validateResults(fixtures, envelope, ops);
console.log(
  `Pi host results OK (${mode}): ${envelope.observations.length} observations for ` +
    `contractVersion ${fixtures.contractVersion}, ${ops.length} canonical operations.`,
);
