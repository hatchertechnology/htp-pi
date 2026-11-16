#!/usr/bin/env node
// Offline validator for the Wave 0 Pi host files and the pinned canonical pin.
//
// - Verifies contract/vendor/plugin-contract/PIN.json hashes against the pinned
//   canonical fixtures/operations/validator.
// - Validates the local Pi host profile (contract/v1/host.json) against the
//   shared profile requirements.
// - Validates the Pi operations projection (contract/v1/operations.json) against
//   the pinned canonical operations (contract/vendor/.../capabilities.json).
//
// The shared normalized-observation check lives in scripts/check-host-results.mjs.
// No network, no live adapter. Run: node scripts/check-contract.mjs

import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const vendor = join(root, "contract", "vendor", "plugin-contract");

const errors = [];
const fail = (msg) => errors.push(msg);
const readJson = (p) => JSON.parse(readFileSync(p, "utf8"));
const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const isStr = (v) => typeof v === "string" && v.length > 0;
const isArr = Array.isArray;

// ---------- pinned canonical contract ----------
let pin = null;
let capabilities = null;
try {
  pin = readJson(join(vendor, "PIN.json"));
} catch (err) {
  fail(`PIN.json: cannot read/parse: ${err.message}`);
}
if (pin) {
  if (pin.contractVersion !== "1.0.0") fail('PIN.json: contractVersion must be "1.0.0"');
  if (!isArr(pin.files) || pin.files.length === 0) {
    fail("PIN.json: files must be a non-empty array");
  } else {
    for (const f of pin.files) {
      if (!isObj(f) || !isStr(f.path) || !isStr(f.sha256)) {
        fail("PIN.json: each file needs path and sha256");
        continue;
      }
      let bytes;
      try {
        bytes = readFileSync(join(vendor, f.path));
      } catch (err) {
        fail(`PIN.json: pinned file missing: ${f.path}`);
        continue;
      }
      const got = createHash("sha256").update(bytes).digest("hex");
      if (got !== f.sha256) fail(`PIN.json: hash drift for ${f.path}`);
    }
  }
}
try {
  capabilities = readJson(join(vendor, "v1", "capabilities.json"));
} catch (err) {
  fail(`capabilities.json: cannot read/parse: ${err.message}`);
}
const canonicalOps = capabilities?.operations ?? [];
const canonicalIds = new Set(canonicalOps.map((o) => o.id));

// ---------- local host profile ----------
let host = null;
try {
  host = readJson(join(root, "contract", "v1", "host.json"));
} catch (err) {
  fail(`host.json: cannot read/parse: ${err.message}`);
}
if (host) {
  for (const key of [
    "host", "displayName", "observedVersion", "minimumVersion", "packageStatus",
    "transports", "auth", "distribution", "sources", "gates", "readiness",
  ]) {
    if (!(key in host)) fail(`host.json: missing key "${key}"`);
  }
  if (host.host !== "pi") fail('host.json: host must be "pi"');
  if (host.minimumVersion !== null) {
    fail("host.json: minimumVersion must be null until new acceptance evidence exists");
  }
  if (!["not-implemented", "fixture-defined", "implemented"].includes(host.packageStatus)) {
    fail("host.json: invalid packageStatus");
  }
  if (!isArr(host.transports) || host.transports.length === 0) {
    fail("host.json: transports must be non-empty");
  } else {
    for (const t of host.transports) {
      if (!["stdio", "streamable-http"].includes(t)) fail(`host.json: unsupported transport "${t}"`);
    }
    if (host.transports.includes("sse")) fail("host.json: Pi rejects legacy SSE");
  }
  if (!isObj(host.auth) || host.auth.method !== "host-oauth") {
    fail('host.json: auth.method must be "host-oauth"');
  } else {
    if (!isStr(host.auth.login) || !isStr(host.auth.logout)) fail("host.json: auth.login/logout required");
    if (!isArr(host.auth.limitations)) fail("host.json: auth.limitations must be an array");
  }
  if (!isObj(host.distribution)) {
    fail("host.json: distribution must be an object");
  } else {
    for (const key of ["source", "install", "upgrade", "rollback"]) {
      if (!isStr(host.distribution[key])) fail(`host.json: distribution.${key} required`);
    }
  }
  if (!isArr(host.sources) || host.sources.length === 0) {
    fail("host.json: sources must be non-empty");
  } else {
    for (const s of host.sources) {
      if (!isStr(s) || !/^https:\/\//.test(s)) fail(`host.json: source "${s}" must be an https URL`);
    }
  }
  if (!isArr(host.gates) || host.gates.length === 0) fail("host.json: gates must be non-empty");
  if (!isObj(host.readiness) || !isStr(host.readiness.htp) || !isStr(host.readiness.seosmith)) {
    fail("host.json: readiness must address both htp and seosmith");
  }
}

// ---------- operations projection ----------
let projection = null;
try {
  projection = readJson(join(root, "contract", "v1", "operations.json"));
} catch (err) {
  fail(`operations.json: cannot read/parse: ${err.message}`);
}
if (projection) {
  if (projection.contractVersion !== "1.0.0") fail('operations.json: contractVersion must be "1.0.0"');
  if (projection.host !== "pi") fail('operations.json: host must be "pi"');
  if (!isArr(projection.operations)) {
    fail("operations.json: operations must be an array");
  } else {
    if (projection.operations.length !== canonicalOps.length) {
      fail(
        `operations.json: expected ${canonicalOps.length} canonical operations, found ${projection.operations.length}`,
      );
    }
    for (const op of projection.operations) {
      for (const key of ["id", "service", "binding", "effect", "backend", "package", "transport", "hostSupport", "adapter", "gate", "notes"]) {
        if (!(key in op)) fail(`operations.json: ${op.id ?? "?"} missing "${key}"`);
      }
      if (!canonicalIds.has(op.id)) fail(`operations.json: ${op.id} is not a canonical operation`);
      if (!["read", "write"].includes(op.effect)) fail(`operations.json: ${op.id} invalid effect`);
      if (!["supported", "gated", "unsupported"].includes(op.hostSupport)) {
        fail(`operations.json: ${op.id} invalid hostSupport`);
      }
      if (!["not-implemented", "fixture-defined", "implemented"].includes(op.adapter)) {
        fail(`operations.json: ${op.id} invalid adapter`);
      }
    }
    const projectedIds = new Set(projection.operations.map((o) => o.id));
    for (const id of canonicalIds) {
      if (!projectedIds.has(id)) fail(`operations.json: canonical operation "${id}" is not projected`);
    }
  }
}

// ---------- report ----------
if (errors.length) {
  console.error(`Pi host contract check FAILED (${errors.length} error${errors.length === 1 ? "" : "s"}):`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(
  `Pi host contract OK: host=${host.host} version=${host.observedVersion} ` +
    `status=${host.packageStatus} pinnedFiles=${pin.files.length} ` +
    `canonicalOps=${canonicalOps.length} projected=${projection.operations.length}`,
);
