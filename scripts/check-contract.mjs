#!/usr/bin/env node
// Offline validator for the Wave 0 Pi host contract files.
//
// Validates contract/v1/host.json (canonical descriptor shape agreed with the
// HTP #34 lead), contract/v1/operations.json (Pi host capability projection),
// and contract/v1/conformance.json (bounded HTP + SEOsmith fixtures).
//
// No network, no live adapter. Run: node scripts/check-contract.mjs

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const v1 = join(here, "..", "contract", "v1");

const errors = [];
const fail = (msg) => errors.push(msg);

function load(file) {
  try {
    return JSON.parse(readFileSync(join(v1, file), "utf8"));
  } catch (err) {
    fail(`${file}: cannot read/parse JSON: ${err.message}`);
    return null;
  }
}

const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const isStr = (v) => typeof v === "string" && v.length > 0;
const isArr = Array.isArray;

const host = load("host.json");
const opsDoc = load("operations.json");
const conf = load("conformance.json");

const PACKAGE_STATUS = ["not-implemented", "fixture-defined", "implemented"];
const ALLOWED_TRANSPORTS = ["stdio", "streamable-http"];
const ACCESS = ["read", "write"];
const OP_TRANSPORTS = ["mcp", "cli", "extension"];
const HOST_SUPPORT = ["supported", "unsupported"];
const ADAPTER = ["not-implemented", "fixture-defined", "implemented"];
const STATUS = ["ok", "denied", "unauthorized", "unavailable", "partial", "invalid", "error"];

// ---------- host.json (canonical shape) ----------
if (host) {
  for (const key of [
    "host", "displayName", "observedVersion", "minimumVersion", "packageStatus",
    "transports", "auth", "distribution", "sources", "gates",
  ]) {
    if (!(key in host)) fail(`host.json: missing key "${key}"`);
  }
  if (!isStr(host.host)) fail("host.json: host must be a non-empty string");
  if ("minimumVersion" in host && host.minimumVersion !== null && !isStr(host.minimumVersion)) {
    fail("host.json: minimumVersion must be a string or null");
  }
  if (!PACKAGE_STATUS.includes(host.packageStatus)) {
    fail(`host.json: packageStatus must be one of ${PACKAGE_STATUS.join(", ")}`);
  }
  if (!isArr(host.transports) || host.transports.length === 0) {
    fail("host.json: transports must be a non-empty array");
  } else {
    for (const t of host.transports) {
      if (!ALLOWED_TRANSPORTS.includes(t)) {
        fail(`host.json: unsupported transport "${t}" (allowed: ${ALLOWED_TRANSPORTS.join(", ")})`);
      }
    }
    if (host.transports.includes("sse")) fail("host.json: Pi rejects the legacy SSE transport");
  }
  if (!isObj(host.auth)) {
    fail("host.json: auth must be an object");
  } else {
    if (host.auth.method !== "host-oauth") {
      fail('host.json: auth.method must be "host-oauth"');
    }
    for (const key of ["login", "logout"]) {
      if (!isStr(host.auth[key])) fail(`host.json: auth.${key} must be a non-empty string`);
    }
    if (!isArr(host.auth.limitations)) fail("host.json: auth.limitations must be an array");
  }
  if (!isObj(host.distribution)) {
    fail("host.json: distribution must be an object");
  } else {
    for (const key of ["source", "install", "upgrade", "rollback"]) {
      if (!isStr(host.distribution[key])) fail(`host.json: distribution.${key} must be a non-empty string`);
    }
  }
  if (!isArr(host.sources) || host.sources.length === 0) {
    fail("host.json: sources must be a non-empty array");
  } else {
    for (const s of host.sources) {
      if (!isStr(s) || !/^https:\/\//.test(s)) fail(`host.json: source "${s}" must be an https URL`);
    }
  }
  if (!isArr(host.gates) || host.gates.length === 0) {
    fail("host.json: gates must be a non-empty array");
  }
}

// ---------- operations.json ----------
const opIds = new Set();
const opById = new Map();
if (opsDoc) {
  if (!isArr(opsDoc.operations) || opsDoc.operations.length === 0) {
    fail("operations.json: operations must be a non-empty array");
  } else {
    for (const op of opsDoc.operations) {
      if (!isObj(op) || !isStr(op.id)) {
        fail("operations.json: every operation needs a string id");
        continue;
      }
      if (opIds.has(op.id)) fail(`operations.json: duplicate operation id "${op.id}"`);
      opIds.add(op.id);
      opById.set(op.id, op);
      if (!/^(htp|seosmith)\./.test(op.id)) {
        fail(`operations.json: id "${op.id}" must start with htp. or seosmith.`);
      }
      const prefix = op.id.split(".")[0];
      if (op.service !== prefix) {
        fail(`operations.json: ${op.id} service "${op.service}" does not match prefix "${prefix}"`);
      }
      if (!ACCESS.includes(op.access)) fail(`operations.json: ${op.id} access must be read|write`);
      if (!OP_TRANSPORTS.includes(op.transport)) fail(`operations.json: ${op.id} transport invalid`);
      if (!HOST_SUPPORT.includes(op.hostSupport)) fail(`operations.json: ${op.id} hostSupport invalid`);
      if (!ADAPTER.includes(op.adapter)) fail(`operations.json: ${op.id} adapter invalid`);
      if (!("canonicalId" in op) || (op.canonicalId !== null && !isStr(op.canonicalId))) {
        fail(`operations.json: ${op.id} canonicalId must be a string or null`);
      }
      if (!("canonicalTool" in op) || (op.canonicalTool !== null && !isStr(op.canonicalTool))) {
        fail(`operations.json: ${op.id} canonicalTool must be a string or null`);
      }
    }
  }
}

// ---------- conformance.json ----------
if (conf) {
  if (conf.contractVersion !== "1.0.0") {
    fail('conformance.json: contractVersion must be "1.0.0"');
  }
  if (conf.live !== false) fail("conformance.json: fixtures must not claim live execution (live:false)");
  if (conf.kind !== "fixture") fail('conformance.json: kind must be "fixture"');
  if (!isArr(conf.statusEnum)) {
    fail("conformance.json: statusEnum must be an array");
  } else {
    for (const s of STATUS) {
      if (!conf.statusEnum.includes(s)) fail(`conformance.json: statusEnum missing "${s}"`);
    }
  }
  if (!isArr(conf.scenarios) || conf.scenarios.length === 0) {
    fail("conformance.json: scenarios must be a non-empty array");
  } else {
    const ids = new Set();
    const servicesSeen = new Set();
    const statusEnum = isArr(conf.statusEnum) ? conf.statusEnum : STATUS;
    for (const sc of conf.scenarios) {
      if (!isObj(sc)) {
        fail("conformance.json: every scenario must be an object");
        continue;
      }
      for (const key of ["id", "operation", "context", "expected"]) {
        if (!(key in sc)) fail(`conformance.json: scenario ${sc.id ?? "?"} missing "${key}"`);
      }
      if (!isStr(sc.id)) {
        fail("conformance.json: scenario id must be a string");
        continue;
      }
      if (ids.has(sc.id)) fail(`conformance.json: duplicate scenario id "${sc.id}"`);
      ids.add(sc.id);
      if (!opIds.has(sc.operation)) {
        fail(`conformance.json: scenario ${sc.id} references unknown operation "${sc.operation}"`);
      }
      const svc = typeof sc.operation === "string" ? sc.operation.split(".")[0] : "?";
      servicesSeen.add(svc);
      if (!isObj(sc.context)) fail(`conformance.json: scenario ${sc.id} context must be an object`);
      if (!isObj(sc.expected)) {
        fail(`conformance.json: scenario ${sc.id} expected must be an object`);
        continue;
      }
      if (!statusEnum.includes(sc.expected.status)) {
        fail(`conformance.json: scenario ${sc.id} expected.status invalid ("${sc.expected.status}")`);
      }
      const op = opById.get(sc.operation);
      if (op && op.service === "htp" && op.access === "read") {
        if (sc.expected.jobCreated !== false) {
          fail(`conformance.json: HTP read scenario ${sc.id} must assert jobCreated:false`);
        }
      }
      if (sc.operation === "seosmith.audit.start" && sc.expected.status === "ok" && sc.expected.bounded !== true) {
        fail(`conformance.json: scenario ${sc.id} successful start must assert bounded:true`);
      }
    }
    for (const required of conf.requiredScenarios ?? []) {
      if (!ids.has(required)) fail(`conformance.json: required scenario "${required}" is missing`);
    }
    if (!servicesSeen.has("htp")) fail("conformance.json: no HTP scenarios");
    if (!servicesSeen.has("seosmith")) fail("conformance.json: no SEOsmith scenarios");
  }
}

// ---------- report ----------
const counts = {
  operations: opIds.size,
  scenarios: isArr(conf?.scenarios) ? conf.scenarios.length : 0,
  required: isArr(conf?.requiredScenarios) ? conf.requiredScenarios.length : 0,
};

if (errors.length) {
  console.error(`plugin-contract check FAILED (${errors.length} error${errors.length === 1 ? "" : "s"}):`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}

console.log(
  `plugin-contract check OK: host=${host.host} version=${host.observedVersion} ` +
    `status=${host.packageStatus} operations=${counts.operations} ` +
    `scenarios=${counts.scenarios}/${counts.required} required`,
);
