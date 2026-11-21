/**
 * htp-pi — Pi package extension for HTP and SEOsmith operations.
 *
 * Two host bindings:
 *   - HTP: registers the streamable-HTTP `htp` MCP server so Pi's built-in MCP
 *     support discovers the canonical HTP tools and owns OAuth sign-in
 *     (`pi mcp login htp`). The extension never handles tokens.
 *   - SEOsmith: binds the SEOsmith #18 local `operations` CLI through `pi.exec`
 *     argv arrays (no shell). Explicit bounded start/status/cancel/report/export
 *     and standalone discovery. No HTP account is required.
 *
 * Capability gates are truthful: backend-gated work stays gated and a skill
 * never makes an operation available.
 */

import { Type } from "typebox";
import { AdapterError } from "./lib/seosmith-adapter.mjs";
import {
  cancel,
  discover,
  exportReport,
  report,
  start,
  status,
} from "./lib/seosmith-adapter.mjs";
import {
  capabilityReport,
  GATED_OPERATIONS,
  HTP_MCP_OPERATIONS,
  PACKAGE_VERSION,
  SEOSMITH_LOCAL_OPERATIONS,
} from "./lib/capabilities.mjs";
import {
  connectionStatus,
  HTP_SERVER_NAME,
  resolveHtpMcpUrl,
} from "./lib/htp-connection.mjs";

function text(value: unknown) {
  return { type: "text" as const, text: typeof value === "string" ? value : JSON.stringify(value, null, 2) };
}

function ok(value: unknown, details: Record<string, unknown> = {}) {
  return { content: [text(value)], details };
}

function failure(err: unknown) {
  const adapter = err instanceof AdapterError;
  const code = adapter ? err.code : "internal_error";
  const retryable = adapter ? err.retryable : false;
  const message = err instanceof Error ? err.message : String(err);
  return {
    content: [text({ ok: false, code, retryable, message })],
    details: { ok: false, code, retryable },
    isError: true,
  };
}

async function runSafely(fn: () => Promise<unknown>) {
  try {
    return ok(await fn());
  } catch (err) {
    return failure(err);
  }
}

export default function htpPiExtension(pi: any) {
  // ---------------------------------------------------------------------------
  // HTP MCP server registration. Pi owns the connection and OAuth lifecycle.
  // ---------------------------------------------------------------------------
  const disableMcp = process.env.HTP_PI_DISABLE_MCP === "1";
  const mcpUrl = resolveHtpMcpUrl();
  if (!disableMcp) {
    try {
      pi.registerMcpServer(HTP_SERVER_NAME, {
        url: mcpUrl,
        exposure: "codemode",
        description:
          "HTP saved website evidence, website/repository management and provider collection (OAuth).",
      });
    } catch (err) {
      // A file-configured `htp` server takes precedence; do not fail startup.
      pi.on("session_start", () => {
        // Surface the reason without printing any credential.
        console.warn(`[htp-pi] could not register the htp MCP server: ${(err as Error).message}`);
      });
    }
  }

  const exec = (command: string, args: string[], options: Record<string, unknown>) =>
    pi.exec(command, args, options);

  // ---------------------------------------------------------------------------
  // SEOsmith local operations.
  // ---------------------------------------------------------------------------
  pi.registerTool({
    name: "seosmith_capabilities",
    label: "SEOsmith capabilities",
    description:
      "Discover the configured local SEOsmith operations adapter. Reports adapter/engine/schema versions, advertised operations, bounds and advanced capability gates. Never opens a database or contacts a service.",
    parameters: Type.Object({}),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    async execute() {
      return runSafely(async () => {
        const caps = await discover({ exec });
        return {
          ok: true,
          available: true,
          ...caps,
          advanced: { evidence_v2: false, authorized_staging: false, ci_baseline: false, ...(caps.advanced ?? {}) },
          gated: GATED_OPERATIONS,
        };
      });
    },
  });

  pi.registerTool({
    name: "seosmith_start",
    label: "Start SEOsmith audit",
    description:
      "Start one explicitly bounded SEOsmith audit with a fresh request_id and a dedicated database. Identical retries return the existing status; changed identity is a conflict. Writes the request to a private 0600 file. No HTP account required.",
    parameters: Type.Object({
      database: Type.String({ description: "Absolute path to the per-audit SQLite database." }),
      request: Type.Object({}, { additionalProperties: true, description: "CrawlRequest JSON with explicit bounds and non-nil request_id/website_id." }),
      request_dir: Type.Optional(Type.String({ description: "Absolute private directory for the request file (default: a fresh 0700 temp dir)." })),
      timeout_seconds: Type.Optional(Type.Number({ description: "Whole-operation timeout in seconds." })),
    }),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    async execute(_id: string, params: any) {
      return runSafely(async () => ({
        ok: true,
        ...(await start({
          exec,
          database: params.database,
          request: params.request,
          requestDir: params.request_dir,
          timeoutMs: params.timeout_seconds ? params.timeout_seconds * 1000 : undefined,
        })),
      }));
    },
  });

  const idParams = (extra: Record<string, unknown> = {}) =>
    Type.Object({
      database: Type.String({ description: "Absolute path to the per-audit SQLite database." }),
      id: Type.String({ description: "The audit request UUID." }),
      ...extra,
    });

  pi.registerTool({
    name: "seosmith_status",
    label: "SEOsmith status",
    description:
      "Read the state of one SEOsmith audit (queued/running/completed/partial/failed/cancelled, coverage, delivery). Never resumes work. Classified-transient read failures may retry.",
    parameters: idParams({ retries: Type.Optional(Type.Number({ description: "Read retries for classified-transient failures (default 1)." })) }),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    async execute(_id: string, params: any) {
      return runSafely(async () => ({
        ok: true,
        ...(await status({ exec, database: params.database, id: params.id, retries: params.retries ?? 1 })),
      }));
    },
  });

  pi.registerTool({
    name: "seosmith_cancel",
    label: "Cancel SEOsmith audit",
    description:
      "Request cancellation of one SEOsmith audit. `cancel_accepted` is not terminal; poll status until `cancellation_terminal` is true. Completed reports are not changed.",
    parameters: idParams(),
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    async execute(_id: string, params: any) {
      return runSafely(async () => ({
        ok: true,
        ...(await cancel({ exec, database: params.database, id: params.id })),
      }));
    },
  });

  pi.registerTool({
    name: "seosmith_report",
    label: "SEOsmith report",
    description:
      "Read the exact retained report bytes for one SEOsmith audit. Preserves schema_version, outcome, coverage and unknown fields; never reserializes. Fails explicitly when unavailable or oversized.",
    parameters: idParams({ retries: Type.Optional(Type.Number({ description: "Read retries for classified-transient failures (default 1)." })) }),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    async execute(_id: string, params: any) {
      return runSafely(async () => {
        const result = await report({
          exec,
          database: params.database,
          id: params.id,
          retries: params.retries ?? 1,
        });
        return { ok: true, bytes: result.bytes, report: result.text };
      });
    },
  });

  pi.registerTool({
    name: "seosmith_export",
    label: "Export SEOsmith report",
    description:
      "Export the exact retained report bytes to a new absolute file and return the receipt (request id, byte count, sha256). Rejects existing paths and symlinks; a partial file is not a successful export.",
    parameters: idParams({ output: Type.String({ description: "Absolute new destination path for the exported report." }) }),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    async execute(_id: string, params: any) {
      return runSafely(async () => ({
        ok: true,
        ...(await exportReport({ exec, database: params.database, id: params.id, output: params.output })),
      }));
    },
  });

  // ---------------------------------------------------------------------------
  // HTP connection + overall capability status.
  // ---------------------------------------------------------------------------
  pi.registerTool({
    name: "htp_connection_status",
    label: "HTP connection status",
    description:
      "Report HTP MCP server registration, discovered mcp__htp__* tools and stored-credential presence. Never reads or returns tokens. Use `pi mcp login htp` / `pi mcp logout htp` for sign-in and sign-out.",
    parameters: Type.Object({}),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    async execute() {
      return runSafely(async () => {
        const statusInfo = await connectionStatus({ allTools: pi.getAllTools() });
        return { ok: true, ...statusInfo };
      });
    },
  });

  pi.registerTool({
    name: "htp_pi_capabilities",
    label: "HTP/Pi capabilities",
    description:
      "Report the truthful host capability map: which HTP MCP operations and SEOsmith local operations this package binds, and which backend/verification gates remain. A skill mentioning an operation never makes it available.",
    parameters: Type.Object({}),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    async execute() {
      return runSafely(async () => {
        let seosmith: Record<string, unknown>;
        try {
          const caps = await discover({ exec });
          seosmith = {
            available: true,
            adapterVersion: caps.adapter_version,
            engineVersion: caps.engine_version,
            reportSchemaVersion: caps.report_schema_version,
            rulesetVersion: caps.ruleset_version,
            limits: caps.limits,
            advanced: caps.advanced,
            operations: SEOSMITH_LOCAL_OPERATIONS,
          };
        } catch (err) {
          const adapter = err instanceof AdapterError;
          seosmith = {
            available: false,
            code: adapter ? err.code : "internal_error",
            message: err instanceof Error ? err.message : String(err),
            operations: [],
          };
        }
        const htp = await connectionStatus({ allTools: pi.getAllTools() });
        return {
          ok: true,
          ...capabilityReport({
            seosmith,
            htp: {
              server: htp.server,
              url: htp.url,
              state: htp.state,
              signedIn: htp.signedIn,
              toolCount: htp.toolCount,
              tools: htp.tools,
              operations: HTP_MCP_OPERATIONS,
            },
          }),
          package: { name: "htp-pi", version: PACKAGE_VERSION },
          login: htp.login,
          logout: htp.logout,
        };
      });
    },
  });
}
