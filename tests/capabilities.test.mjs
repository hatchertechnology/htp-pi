import { test } from "node:test";
import assert from "node:assert/strict";

import {
  capabilityReport,
  GATED_OPERATIONS,
  HTP_MCP_OPERATIONS,
  SEOSMITH_LOCAL_OPERATIONS,
} from "../extensions/htp-pi/lib/capabilities.mjs";

test("SEOsmith local operations cover the five advertised lifecycle operations", () => {
  assert.deepEqual(SEOSMITH_LOCAL_OPERATIONS, [
    "seosmith.start",
    "seosmith.status",
    "seosmith.cancel",
    "seosmith.report",
    "seosmith.export",
  ]);
});

test("backend-gated work stays visible and never advertised as available", () => {
  const ids = GATED_OPERATIONS.map((g) => g.id);
  for (const id of ["htp.set_website_business_location", "seosmith.private_worker", "seosmith.evidence_v2"]) {
    assert.ok(ids.includes(id), `${id} must stay gated`);
  }
  for (const gated of GATED_OPERATIONS) {
    assert.ok(gated.reason.length > 0, `${gated.id} needs a reason`);
    assert.ok(!HTP_MCP_OPERATIONS.includes(gated.id), `${gated.id} must not be advertised as an MCP operation`);
  }
});

test("capabilityReport separates HTP MCP passthrough from SEOsmith local CLI", () => {
  const report = capabilityReport({
    htp: { state: "signed_out", toolCount: 0 },
    seosmith: { available: true },
  });
  assert.equal(report.htp.adapter, "mcp-passthrough");
  assert.equal(report.seosmith.adapter, "local-cli");
  assert.equal(report.package.name, "htp-pi");
  assert.equal(report.host.name, "pi");
});

test("capabilityReport never invents SEOsmith operations the adapter did not advertise", () => {
  const report = capabilityReport({ seosmith: { available: true } });
  assert.deepEqual(report.seosmith.operations, []);
  const withOps = capabilityReport({ seosmith: { available: true, operations: ["seosmith.status"] } });
  assert.deepEqual(withOps.seosmith.operations, ["seosmith.status"]);
});

test("GATED_OPERATIONS covers the canonical gated operations too", () => {
  const ids = GATED_OPERATIONS.map((g) => g.id);
  for (const id of [
    "htp.set_website_business_location",
    "htp.website_audit_events",
    "htp.website_operational_episodes",
    "seosmith.ci.baseline",
    "seosmith.cli.crawl",
    "seosmith.cli.rules",
  ]) {
    assert.ok(ids.includes(id), `${id} must stay gated`);
  }
});

test("additive audit reads stay gated and never advertised as available", () => {
  const gated = GATED_OPERATIONS.find((g) => g.id === "htp.website_audit_events");
  assert.ok(gated, "website_audit_events must stay gated");
  assert.match(gated.reason, /producer_unavailable/);
  assert.match(gated.reason, /unsupported/);
  const episodes = GATED_OPERATIONS.find((g) => g.id === "htp.website_operational_episodes");
  assert.ok(episodes, "website_operational_episodes must stay gated");
  assert.match(episodes.reason, /producer_unavailable/);
  assert.ok(!HTP_MCP_OPERATIONS.includes("htp.website_audit_events"));
  assert.ok(!HTP_MCP_OPERATIONS.includes("htp.website_operational_episodes"));
});
