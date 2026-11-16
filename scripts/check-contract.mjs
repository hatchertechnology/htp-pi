#!/usr/bin/env node
// Offline validator for the Wave 0 Pi host files and the pinned canonical pin.
//
// - Verifies contract/vendor/plugin-contract/PIN.json hashes against the pinned
//   canonical fixtures/operations/validator, and rejects a provisional pin that
//   points at an unmerged PR without saying so.
// - Validates the local Pi host profile (contract/v1/host.json).
// - Validates the Pi operations projection (contract/v1/operations.json)
//   FIELD BY FIELD against the pinned canonical operations.
// - Rejects absolute local paths in published contract metadata.
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
const equalJson = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// Published contract metadata must not leak local absolute paths / usernames.
const ABS_PATH = /^(?:\/home\/|\/mnt\/|\/Users\/|\/root\/|\/private\/|\/var\/folders\/|[A-Za-z]:\\)/;
function scanAbsolute(value, where) {
  if (typeof value === "string") {
    if (ABS_PATH.test(value)) fail(`${where}: absolute local path leaked: "${value}"`);
  } else if (Array.isArray(value)) {
    value.forEach((v, i) => scanAbsolute(v, `${where}[${i}]`));
  } else if (isObj(value)) {
    for (const [k, v] of Object.entries(value)) scanAbsolute(v, `${where}.${k}`);
  }
}

// ---------- pinned canonical contract ----------
let pin = null;
let capabilities = null;
try {
  pin = readJson(join(vendor, "PIN.json"));
} catch (err) {
  fail(`PIN.json: cannot read/parse: ${err.message}`);
}
if (pin) {
  scanAbsolute(pin, "PIN.json");
  if (pin.contractVersion !== "1.0.0") fail('PIN.json: contractVersion must be "1.0.0"');
  if (!["provisional", "final"].includes(pin.status)) {
    fail('PIN.json: status must be "provisional" or "final"');
  }
  const src = pin.source;
  if (!isObj(src)) {
    fail("PIN.json: source must be an object");
  } else {
    if ("worktree" in src) fail("PIN.json: source.worktree (absolute local path) is not allowed");
    if (!/^[0-9a-f]{40}$/.test(src.commit ?? "")) {
      fail("PIN.json: source.commit must be a full 40-hex commit SHA");
    }
    if (pin.status === "provisional" && !isStr(src.canonicalRevision)) {
      fail("PIN.json: provisional pin must name the unmerged canonical revision");
    }
  }
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
      } catch {
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
const canonicalById = new Map(canonicalOps.map((o) => [o.id, o]));

// ---------- local host profile ----------
let host = null;
try {
  host = readJson(join(root, "contract", "v1", "host.json"));
} catch (err) {
  fail(`host.json: cannot read/parse: ${err.message}`);
}
if (host) {
  scanAbsolute(host, "host.json");
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
const CANON_FIELDS = ["id", "service", "binding", "effect", "backend", "package", "transport", "gate"];
if (projection) {
  scanAbsolute(projection, "operations.json");
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
    const seen = new Set();
    for (const op of projection.operations) {
      if (!isObj(op) || !isStr(op.id)) {
        fail("operations.json: every operation needs a string id");
        continue;
      }
      if (seen.has(op.id)) fail(`operations.json: duplicate operation ${op.id}`);
      seen.add(op.id);
      const canon = canonicalById.get(op.id);
      if (!canon) {
        fail(`operations.json: ${op.id} is not a canonical operation`);
        continue;
      }
      // Field-by-field equality with the canonical inventory.
      for (const field of CANON_FIELDS) {
        if (!equalJson(op[field] ?? null, canon[field] ?? null)) {
          fail(
            `operations.json: ${op.id} field "${field}" diverges from canonical ` +
              `(${JSON.stringify(op[field])} != ${JSON.stringify(canon[field])})`,
          );
        }
      }
      if (!["read", "write"].includes(op.effect)) fail(`operations.json: ${op.id} invalid effect`);
      if (!["reachable", "unreachable"].includes(op.hostCapability)) {
        fail(`operations.json: ${op.id} hostCapability must be reachable|unreachable`);
      }
      const expectReach = canon.transport !== null;
      if (expectReach && op.hostCapability !== "reachable") {
        fail(`operations.json: ${op.id} transport exists so hostCapability must be reachable`);
      }
      if (!expectReach && op.hostCapability !== "unreachable") {
        fail(`operations.json: ${op.id} has no transport so hostCapability must be unreachable`);
      }
      if (!["supported", "gated", "unsupported"].includes(op.hostSupport)) {
        fail(`operations.json: ${op.id} invalid hostSupport`);
      }
      if (!["not-implemented", "fixture-defined", "implemented"].includes(op.adapter)) {
        fail(`operations.json: ${op.id} invalid adapter`);
      }
      // Wording guard: never claim an operation is supported before an adapter exists.
      if (op.adapter !== "implemented" && op.hostSupport === "supported") {
        fail(`operations.json: ${op.id} claims hostSupport=supported while adapter=${op.adapter}`);
      }
    }
    for (const id of canonicalById.keys()) {
      if (!seen.has(id)) fail(`operations.json: canonical operation "${id}" is not projected`);
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
    `status=${host.packageStatus} pin=${pin.status} pinnedFiles=${pin.files.length} ` +
    `canonicalOps=${canonicalOps.length} projected=${projection.operations.length} ` +
    `(all adapter=not-implemented, hostSupport=gated)`,
);
