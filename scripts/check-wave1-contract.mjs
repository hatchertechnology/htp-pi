#!/usr/bin/env node
// Wave 1 host-binding contract check.
//
// Resolves the Wave 0 all-gated projection (contract/v1/operations.json) with
// the explicit Wave 1 overrides (contract/wave1/overrides.json) and validates
// that every canonical operation has a truthful adapter/hostSupport state.
//
// Run: node scripts/check-wave1-contract.mjs [--write]
//   --write also regenerates contract/wave1/operations.json.

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const readJson = (p) => JSON.parse(readFileSync(p, "utf8"));

const errors = [];
const fail = (msg) => errors.push(msg);
const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

const projection = readJson(join(root, "contract", "v1", "operations.json"));
const overrides = readJson(join(root, "contract", "wave1", "overrides.json"));
const canonical = readJson(join(root, "contract", "vendor", "plugin-contract", "v1", "capabilities.json"));
const canonicalById = new Map(canonical.operations.map((o) => [o.id, o]));

const ADAPTERS = ["mcp-passthrough", "local-cli", "not-implemented"];
const HOST_SUPPORT = ["supported", "gated", "unsupported"];

function expectedHostCapability(canon) {
  if (canon.transport !== null && canon.transport !== undefined) return "reachable";
  const primitive = canon.primitiveBinding?.transport;
  if (primitive === "cli") return "reachable";
  if (primitive === "private-http") return "gated";
  return "unreachable";
}

const ops = [];
for (const op of projection.operations) {
  const canon = canonicalById.get(op.id);
  if (!canon) {
    fail(`v1 projection has ${op.id} which is not canonical`);
    continue;
  }
  const override = overrides.overrides[op.id];
  if (!override) {
    fail(`wave1 overrides missing ${op.id}`);
    continue;
  }
  const { adapter, hostSupport, gate } = override;
  if (!ADAPTERS.includes(adapter)) fail(`${op.id}: invalid adapter ${adapter}`);
  if (!HOST_SUPPORT.includes(hostSupport)) fail(`${op.id}: invalid hostSupport ${hostSupport}`);
  const implemented = adapter !== "not-implemented";
  if (hostSupport === "supported" && !implemented) {
    fail(`${op.id}: hostSupport=supported requires an implemented adapter`);
  }
  if (implemented && hostSupport !== "supported") {
    fail(`${op.id}: adapter=${adapter} must be hostSupport=supported`);
  }
  ops.push({
    id: op.id,
    service: op.service,
    binding: op.binding,
    effect: op.effect,
    backend: op.backend,
    package: op.package,
    transport: op.transport,
    primitiveBinding: op.primitiveBinding,
    hostCapability: expectedHostCapability(canon),
    hostSupport,
    adapter,
    gate: gate ?? null,
    note: op.notes ?? null,
  });
}

for (const id of canonicalById.keys()) {
  if (!overrides.overrides[id]) fail(`canonical operation ${id} has no Wave 1 override`);
}
for (const id of Object.keys(overrides.overrides)) {
  if (!canonicalById.has(id)) fail(`override ${id} is not a canonical operation`);
}

// Package-level invariants: the local CLI adapter binds exactly the five
// SEOsmith lifecycle operations; feature-flagged HTP writes stay gated.
const local = ops.filter((o) => o.adapter === "local-cli").map((o) => o.id).sort();
const expectedLocal = ["seosmith.cancel", "seosmith.export", "seosmith.report", "seosmith.start", "seosmith.status"];
if (JSON.stringify(local) !== JSON.stringify(expectedLocal)) {
  fail(`local-cli adapter set must be exactly the SEOsmith lifecycle operations (got ${local.join(", ")})`);
}
for (const o of ops) {
  if (o.hostSupport === "supported" && !o.adapter) fail(`${o.id}: supported operation needs an adapter`);
  if (o.hostSupport === "gated" && !o.gate) fail(`${o.id}: gated operation needs a gate reason`);
}

// Every supported operation must have host-specific evidence linked from the
// smoke test, so a skill can never advertise an operation by itself.
const smoke = readFileSync(join(root, "scripts", "host-smoke.mjs"), "utf8");
for (const o of ops) {
  if (o.hostSupport !== "supported") continue;
  if (o.adapter === "local-cli") {
    const tool = `seosmith_${o.id.split(".")[1]}`;
    if (!smoke.includes(`call("${tool}"`)) fail(`${o.id}: scripts/host-smoke.mjs must exercise ${tool}`);
  } else if (o.adapter === "mcp-passthrough") {
    if (!smoke.includes("extension registers the htp MCP server")) {
      fail(`${o.id}: scripts/host-smoke.mjs must verify the htp MCP server registration`);
    }
    if (!o.binding) fail(`${o.id}: mcp-passthrough operation needs a canonical binding name`);
  }
}

if (errors.length) {
  console.error(`Wave 1 contract check FAILED (${errors.length} error${errors.length === 1 ? "" : "s"}):`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}

const resolved = {
  contractVersion: overrides.contractVersion,
  host: overrides.host,
  wave: overrides.wave,
  package: overrides.package,
  packageVersion: overrides.packageVersion,
  source: overrides.source,
  notes: overrides.notes,
  operations: ops,
};
if (process.argv.includes("--write")) {
  writeFileSync(join(root, "contract", "wave1", "operations.json"), `${JSON.stringify(resolved, null, 2)}\n`);
  console.log("Wrote contract/wave1/operations.json");
}

const supported = ops.filter((o) => o.hostSupport === "supported").length;
const gated = ops.filter((o) => o.hostSupport === "gated").length;
console.log(
  `Wave 1 contract OK: host=${resolved.host} package=${resolved.package}@${resolved.packageVersion} ` +
    `operations=${ops.length} supported=${supported} gated=${gated} ` +
    `(mcp-passthrough=${ops.filter((o) => o.adapter === "mcp-passthrough").length}, local-cli=${local.length})`,
);
