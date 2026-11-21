#!/usr/bin/env node
// Controlled SEOsmith operations fixture used by the Pi host smoke test.
// It implements just enough of the SEOsmith #18 local `operations` CLI to
// exercise the host binding end to end. It is NOT a SEOsmith build and must not
// be advertised as one.

import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";

const argv = process.argv.slice(2);
if (process.env.FAKE_SEOSMITH_LOG) {
  appendFileSync(process.env.FAKE_SEOSMITH_LOG, `${JSON.stringify(argv)}\n`);
}

function fail(code, message) {
  process.stderr.write(`${JSON.stringify({ code, error: message })}\n`);
  process.exit(1);
}

const operationsIndex = argv.indexOf("operations");
if (operationsIndex === -1) fail("unknown_command", "expected the operations subcommand");
const command = argv[operationsIndex + 1];
const dbIndex = argv.indexOf("--database");
const database = dbIndex === -1 ? null : argv[dbIndex + 1];
const valueAfter = (flag) => {
  const i = argv.indexOf(flag);
  return i === -1 ? null : argv[i + 1];
};

const CAPS = {
  adapter_version: 1,
  engine_version: "fixture-0.2.0",
  report_schema_version: 1,
  ruleset_version: "fixture-2026.11",
  transport: "local_cli",
  operations: ["seosmith.start", "seosmith.status", "seosmith.cancel", "seosmith.report", "seosmith.export"],
  limits: {
    request_bytes: 16384,
    report_bytes: 16777216,
    pages: [1, 20000],
    resources: [0, 20000],
    duration_seconds: [10, 7200],
    delay_ms: [1000, 60000],
  },
  advanced: { evidence_v2: false, authorized_staging: false, ci_baseline: false },
  delivery: "disabled",
  authentication: "local_os_account",
};

const REPORT = '{"schema_version":1,"outcome":"unknown","coverage_complete":false,"findings":[]}';
const REQUEST_ID = "b2a844c8-5bc9-49e5-bcf0-8fd1407d69f4";

if (command === "capabilities") {
  process.stdout.write(JSON.stringify(CAPS));
} else if (command === "start") {
  if (!database) fail("missing_database", "database required");
  const requestPath = valueAfter("--request");
  if (!requestPath) fail("missing_request", "request file required");
  let request;
  try {
    request = JSON.parse(readFileSync(requestPath, "utf8"));
  } catch (err) {
    fail("invalid_request_json", err.message);
  }
  if (!request.request_id || !request.website_id) fail("invalid_scope", "non-nil identity required");
  process.stdout.write(
    JSON.stringify({
      state: "running",
      execution_state: "running",
      worker_active: true,
      report_available: false,
      delivery_state: "disabled",
      request_id: request.request_id,
    }),
  );
} else if (command === "status") {
  process.stdout.write(
    JSON.stringify({
      state: "completed",
      execution_state: "completed",
      worker_active: false,
      report_available: true,
      delivery_state: "disabled",
      request_id: valueAfter("--id"),
    }),
  );
} else if (command === "cancel") {
  process.stdout.write(JSON.stringify({ cancel_accepted: true, cancellation_terminal: false, request_id: valueAfter("--id") }));
} else if (command === "report") {
  process.stdout.write(REPORT);
} else if (command === "export") {
  const output = valueAfter("--output");
  if (!output) fail("missing_output", "output required");
  const bytes = Buffer.from(REPORT, "utf8");
  try {
    writeFileSync(output, bytes, { flag: "wx", mode: 0o600 });
  } catch (err) {
    fail("export_failed", err.message);
  }
  process.stdout.write(
    JSON.stringify({
      request_id: valueAfter("--id"),
      bytes: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    }),
  );
} else {
  fail("unknown_operation", `unknown operations subcommand ${JSON.stringify(command)}`);
}
