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
