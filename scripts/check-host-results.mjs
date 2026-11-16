#!/usr/bin/env node
// Local Pi host check against the PINNED canonical contract fixtures.
//
// Uses the vendored canonical validator (contract/vendor/plugin-contract/
// plugin-contract.mjs). Pass `--results <file.json>` to validate observations
// produced by a real adapter (size-capped at 1 MiB by the vendored readJson).
//
// WITHOUT --results this is a SELF-TEST: it validates the fixtures' own
// documented `expected` values, proving the Pi files carry the canonical
// contract shape. It is NOT Pi conformance evidence and NOT a live adapter test.
//
// Run: node scripts/check-host-results.mjs [--results file.json]

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
  envelope = readJson(args[1]); // 1 MiB cap, same as the canonical validator
  mode = "adapter observations";
} else if (args.length) {
  console.error("usage: node scripts/check-host-results.mjs [--results file.json]");
  process.exit(2);
} else {
  envelope = {
    contractVersion: fixtures.contractVersion,
    host: "pi",
    observations: fixtures.scenarios.map((s) => ({ id: s.id, result: s.expected })),
  };
  mode = "SELF-TEST of fixture expected values (not Pi conformance evidence)";
}

validateResults(fixtures, envelope, ops);
console.log(
  `Pi host results OK (${mode}): ${envelope.observations.length} observations for ` +
    `contractVersion ${fixtures.contractVersion}, ${ops.length} canonical operations.`,
);
