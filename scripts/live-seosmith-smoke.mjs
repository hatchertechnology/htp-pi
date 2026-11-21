#!/usr/bin/env node
// Live SEOsmith end-to-end smoke through the installed Pi runtime.
//
// Requires a real SEOsmith executable (built from merged main) in
// HTP_PI_SEOSMITH_BIN. Performs one explicitly bounded crawl of example.com
// with identifiable local test data, then reads and exports the exact report and
// cleans up. No HTP account or credentials are used.
//
// Run: HTP_PI_SEOSMITH_BIN=/path/to/seosmith node scripts/live-seosmith-smoke.mjs
// Optional: HTP_PI_LIVE_URL (default https://example.com/)

import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");

if (!process.env.HTP_PI_SEOSMITH_BIN) {
  console.log("live SEOsmith smoke skipped: set HTP_PI_SEOSMITH_BIN to a real SEOsmith executable.");
  process.exit(0);
}
if (!existsSync(process.env.HTP_PI_SEOSMITH_BIN)) {
  console.error(`live SEOsmith smoke FAILED: HTP_PI_SEOSMITH_BIN not found: ${process.env.HTP_PI_SEOSMITH_BIN}`);
  process.exit(1);
}

async function resolveHostModule() {
  if (process.env.HTP_PI_HOST_MODULE) return process.env.HTP_PI_HOST_MODULE;
  const releasesRoot = join(process.env.HOME ?? "", ".pi", "agent", "install", "releases");
  const { readdirSync } = await import("node:fs");
  const candidates = readdirSync(releasesRoot)
    .map((name) => join(releasesRoot, name, "node_modules", "@earendil-works", "pi-coding-agent", "dist", "index.js"))
    .filter((p) => existsSync(p))
    .sort();
  if (candidates.length === 0) throw new Error("Could not locate the installed Pi coding-agent module.");
  return candidates[candidates.length - 1];
}

const sdk = await import(pathToFileURL(await resolveHostModule()).href);
const { DefaultResourceLoader, SessionManager, createAgentSession } = sdk;

const work = mkdtempSync(join(tmpdir(), "htp-pi-live-"));
const database = join(work, "audit.sqlite");
const output = join(work, "report.json");
const requestId = "11111111-2222-4333-8444-555555555555";
const websiteId = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const url = process.env.HTP_PI_LIVE_URL || "https://example.com/";

const loader = new DefaultResourceLoader({
  cwd: root,
  agentDir: join(work, "agent"),
  additionalExtensionPaths: [join(root, "extensions", "htp-pi", "index.ts")],
});
await loader.reload();
const { session } = await createAgentSession({
  resourceLoader: loader,
  sessionManager: SessionManager.inMemory(),
  cwd: root,
});
const ctx = {
  cwd: root,
  ui: { notify() {}, setStatus() {}, setWidget() {}, confirm: async () => true, select: async () => undefined, input: async () => undefined },
  sessionManager: session.sessionManager,
  model: session.model,
  tools: [],
  executeTool: async () => ({ isError: true, content: [] }),
};
async function call(name, params) {
  const def = session.getToolDefinition(name);
  if (!def) throw new Error(`tool ${name} is not registered`);
  const result = await def.execute(`live-${name}`, params, undefined, undefined, ctx);
  const block = result?.content?.[0];
  const parsed = JSON.parse(block.text);
  if (result?.isError) throw new Error(`${name}: ${parsed.code ?? "error"}: ${parsed.message ?? ""}`);
  return parsed;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const checks = [];
const record = (name, ok, detail) => checks.push({ name, ok, detail });

try {
  const caps = await call("seosmith_capabilities", {});
  record("real adapter_version is 1", caps.adapter_version === 1, `${caps.engine_version} / ${caps.ruleset_version}`);

  const started = await call("seosmith_start", {
    database,
    request: {
      request_id: requestId,
      website_id: websiteId,
      binding_generation: 1,
      url,
      max_pages: 1,
      max_resources: 0,
      max_duration_seconds: 30,
      delay_ms: 1000,
      check_external_links: false,
    },
  });
  record("real start returns a state", typeof started.state === "string", started.state);

  let status = started;
  const deadline = Date.now() + 90_000;
  while (!["completed", "partial", "failed", "cancelled"].includes(status.state) && Date.now() < deadline) {
    await sleep(2000);
    status = await call("seosmith_status", { database, id: requestId });
  }
  record("real audit reaches a terminal state", ["completed", "partial", "failed", "cancelled"].includes(status.state), status.state);
  record("real status exposes coverage", typeof status.report_available === "boolean", JSON.stringify({ report_available: status.report_available, delivery: status.delivery_state }));

  const reported = await call("seosmith_report", { database, id: requestId });
  const parsedReport = JSON.parse(reported.report);
  record("real report preserves schema_version", parsedReport.schema_version === 1, `bytes=${reported.bytes}`);
  record("real report keeps outcome/coverage fields", "outcome" in parsedReport && "coverage_complete" in parsedReport, JSON.stringify({ outcome: parsedReport.outcome, coverage_complete: parsedReport.coverage_complete }));

  const exported = await call("seosmith_export", { database, id: requestId, output });
  const fileBytes = readFileSync(output);
  const fileHash = createHash("sha256").update(fileBytes).digest("hex");
  record("real export receipt matches the file", exported.sha256 === fileHash && exported.bytes === fileBytes.length && statSync(output).size === fileBytes.length, JSON.stringify({ bytes: exported.bytes }));
} finally {
  session.dispose();
  rmSync(work, { recursive: true, force: true });
}

const failed = checks.filter((c) => !c.ok);
for (const c of checks) console.log(`${c.ok ? "ok  " : "FAIL"} ${c.name}${c.detail ? ` — ${c.detail}` : ""}`);
if (failed.length) {
  console.error(`\nLive SEOsmith smoke FAILED: ${failed.length}/${checks.length} checks failed.`);
  process.exit(1);
}
console.log(`\nLive SEOsmith smoke OK: ${checks.length}/${checks.length} checks passed against a real SEOsmith binary.`);
