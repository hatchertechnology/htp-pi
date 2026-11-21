// Wave 1 capability model for the Pi host package.
//
// Truthful separation of three things that must not be conflated:
//   hostCapability — raw transport reachability on Pi (MCP streamable HTTP,
//                    private HTTP with explicit config, or a local CLI via pi.exec).
//   hostSupport    — whether this package actually binds and can use the
//                    operation today ("supported"), must stay behind a backend
//                    or verification gate ("gated"), or has no host mechanism
//                    ("unsupported").
//   adapter        — the concrete binding: "mcp-passthrough" for HTP MCP tools
//                    registered by the extension, "local-cli" for the SEOsmith
//                    #18 operations adapter, "not-implemented" otherwise.
//
// A skill mentioning an operation never makes it available. Backend-gated work
// stays gated here and in contract/wave1/operations.json.

export const PACKAGE_VERSION = "1.0.0";

// HTP MCP tools are provided by Pi's built-in MCP support once the extension
// registers the `htp` server. They are "supported" as a host binding: the
// transport and tool discovery are implemented. The account-level auth state is
// reported separately and is not a capability claim.
export const HTP_MCP_OPERATIONS = [
  "htp.get_provider_connection",
  "htp.get_website",
  "htp.website_audit_history",
  "htp.website_audit_detail",
  "htp.list_websites",
  "htp.website_saved_data",
  "htp.website_repository_history",
  "htp.disconnect_provider",
  "htp.inspect_website_url",
  "htp.create_website",
  "htp.update_website",
  "htp.delete_website",
  "htp.set_website_ga4_property",
  "htp.request_website_report",
  "htp.import_website_audit",
  "htp.set_website_repository",
];

// SEOsmith local operations implemented by extensions/htp-pi/lib/seosmith-adapter.mjs.
export const SEOSMITH_LOCAL_OPERATIONS = [
  "seosmith.start",
  "seosmith.status",
  "seosmith.cancel",
  "seosmith.report",
  "seosmith.export",
];

// Backend work that has not shipped or has not been verified. These must never
// be advertised as available. Keep them visible so callers can explain the gap.
export const GATED_OPERATIONS = [
  {
    id: "htp.set_website_business_location",
    reason: "HTP Business Profile feature flag not enabled for this host build.",
  },
  {
    id: "htp.request_website_report.durable",
    reason:
      "Durable provider request identity/reconciliation/cancellation (contract 1.1.0) requires deployed backend support and tool schema verification.",
  },
  {
    id: "seosmith.cli.crawl",
    reason: "Legacy crawl command is not used by the operations adapter; no host binding is advertised.",
  },
  {
    id: "seosmith.cli.rules",
    reason: "Legacy rules command is not used by the operations adapter; no host binding is advertised.",
  },
  {
    id: "seosmith.private_worker",
    reason:
      "Direct private-worker HTTP access requires explicit operator configuration and a protected endpoint; not configured by this package.",
  },
  {
    id: "seosmith.ci.baseline",
    reason: "Baseline-aware CI (S16) has not shipped.",
  },
  {
    id: "seosmith.staging",
    reason: "Authorized staging profiles (S13) have not shipped.",
  },
  {
    id: "seosmith.evidence_v2",
    reason: "Versioned evidence v2 (S01) is not advertised by the local adapter.",
  },
];

/** Public, non-secret capability report returned by the htp_pi_capabilities tool. */
export function capabilityReport({ seosmith = null, htp = null } = {}) {
  return {
    package: { name: "htp-pi", version: PACKAGE_VERSION },
    host: { name: "pi" },
    htp: {
      adapter: "mcp-passthrough",
      server: "htp",
      // Populated at runtime from the registered MCP server and auth store.
      ...htp,
    },
    seosmith: {
      adapter: "local-cli",
      // Empty by default: never claim an operation the adapter did not
      // advertise. Callers pass the discovered adapter's actual list.
      operations: [],
      ...seosmith,
    },
    gated: GATED_OPERATIONS,
  };
}
