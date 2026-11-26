#!/usr/bin/env node
// Real-host smoke test for the htp-pi Pi package.
//
// Loads the extension with the *installed* Pi runtime (jiti transpile + the real
// ExtensionAPI) and invokes each advertised SEOsmith operation through the
// definition the host registered. The host's `pi.exec` primitive spawns a
// controlled fixture binary, so the smoke test exercises the real argv/no-shell
// boundary end to end. It also verifies the HTP MCP server registration.
//
// Run: node scripts/host-smoke.mjs
// Env: HTP_PI_HOST_MODULE overrides the Pi coding-agent module path.

import { existsSync, mkdtempSync, readFileSync, rmSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");

async function resolveHostModule() {
  if (process.env.HTP_PI_HOST_MODULE) return process.env.HTP_PI_HOST_MODULE;
  const releasesRoot = join(process.env.HOME ?? "", ".pi", "agent", "install", "releases");
  const { readdirSync } = await import("node:fs");
  if (existsSync(releasesRoot)) {
    const candidates = readdirSync(releasesRoot)
      .map((name) => join(releasesRoot, name, "node_modules", "@earendil-works", "pi-coding-agent", "dist", "index.js"))
      .filter((p) => existsSync(p));
    if (candidates.length > 0) {
      candidates.sort();
      return candidates[candidates.length - 1];
    }
  }
  throw new Error("Could not locate the installed Pi coding-agent module; set HTP_PI_HOST_MODULE.");
}

const results = [];
const record = (name, ok, detail) => results.push({ name, ok, detail });

const hostModule = await resolveHostModule();
const sdk = await import(pathToFileURL(hostModule).href);
const { DefaultResourceLoader, SessionManager, createAgentSession } = sdk;

// The recorded host must be the host that actually ran. observedVersion in
// contract/wave1/host.json is the release's tested-host record; the smoke is the
// only step that executes the real installed runtime, so it is where a host
// upgrade is caught. Re-verify the release and bump the record deliberately.
const hostPkgVersion = JSON.parse(readFileSync(join(dirname(hostModule), "..", "package.json"), "utf8")).version;
const declaredHostVersion = JSON.parse(readFileSync(join(root, "contract", "wave1", "host.json"), "utf8")).observedVersion;
record(
  "installed host matches contract/wave1/host.json observedVersion",
  hostPkgVersion === declaredHostVersion,
  `runtime ${hostPkgVersion} vs recorded ${declaredHostVersion}`,
);

const work = mkdtempSync(join(tmpdir(), "htp-pi-smoke-"));
const fakeBinary = join(work, "fake-seosmith.mjs");
const { copyFileSync } = await import("node:fs");
copyFileSync(join(here, "fixtures", "fake-seosmith.mjs"), fakeBinary);
chmodSync(fakeBinary, 0o755);
const logPath = join(work, "argv.log");
process.env.HTP_PI_SEOSMITH_BIN = fakeBinary;
process.env.FAKE_SEOSMITH_LOG = logPath;
process.env.HTP_PI_DISABLE_MCP = "";

const loader = new DefaultResourceLoader({
  cwd: root,
  agentDir: join(work, "agent"),
  additionalExtensionPaths: [join(root, "extensions", "htp-pi", "index.ts")],
});
await loader.reload();
const loaded = loader.getExtensions();
record("extension loads without errors", (loaded.errors ?? []).length === 0, JSON.stringify(loaded.errors ?? []));

const { session } = await createAgentSession({
  resourceLoader: loader,
  sessionManager: SessionManager.inMemory(),
  cwd: root,
});

const allTools = session.getAllTools();
const toolNames = allTools.map((t) => t.name);
const expectedTools = [
  "seosmith_capabilities",
  "seosmith_start",
  "seosmith_status",
  "seosmith_cancel",
  "seosmith_report",
  "seosmith_export",
  "htp_connection_status",
  "htp_pi_capabilities",
];
record("extension registers advertised tools", expectedTools.every((t) => toolNames.includes(t)), toolNames.join(", "));

const database = join(work, "audit.sqlite");
const requestId = "b2a844c8-5bc9-49e5-bcf0-8fd1407d69f4";
const output = join(work, "export.json");
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
  return def.execute(`smoke-${name}`, params, undefined, undefined, ctx);
}
function parseResult(result) {
  const block = result?.content?.[0];
  const text = block && block.type === "text" ? block.text : "";
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

try {
  const caps = parseResult(await call("seosmith_capabilities", {}));
  record("seosmith_capabilities discovers adapter_version 1", caps.adapter_version === 1, JSON.stringify(caps.limits ?? {}));

  const started = parseResult(
    await call("seosmith_start", {
      database,
      request: {
        request_id: requestId,
        website_id: "4822f25e-af3c-4c60-a8c6-31bd99d2acda",
        url: "https://example.com/",
        max_pages: 20,
        max_resources: 20,
        max_duration_seconds: 60,
        delay_ms: 1000,
        check_external_links: false,
      },
    }),
  );
  record("seosmith_start returns a running status", started.state === "running" && started.request_id === requestId, JSON.stringify(started));

  const status = parseResult(await call("seosmith_status", { database, id: requestId }));
  record("seosmith_status returns a state", status.state === "completed", JSON.stringify(status));
  record(
    "seosmith_status exposes a boolean cancellation_terminal derived by the host",
    status.cancellation_terminal === false,
    JSON.stringify({ cancellation_terminal: status.cancellation_terminal }),
  );

  const cancelled = parseResult(await call("seosmith_cancel", { database, id: requestId }));
  record("seosmith_cancel is accepted but not terminal", cancelled.cancel_accepted === true && cancelled.cancellation_terminal === false, JSON.stringify(cancelled));

  const reported = parseResult(await call("seosmith_report", { database, id: requestId }));
  record("seosmith_report preserves exact bytes", reported.report?.includes('"schema_version":1') && reported.bytes > 0, JSON.stringify({ bytes: reported.bytes }));

  const exported = parseResult(await call("seosmith_export", { database, id: requestId, output }));
  record("seosmith_export returns a receipt", exported.sha256?.length === 64 && exported.bytes > 0, JSON.stringify(exported));

  const connection = parseResult(await call("htp_connection_status", {}));
  record("htp_connection_status reports a truthful state", typeof connection.state === "string", connection.state);

  const capabilityMap = parseResult(await call("htp_pi_capabilities", {}));
  record(
    "htp_pi_capabilities reports local-cli + mcp-passthrough and gates",
    capabilityMap.seosmith?.adapter === "local-cli" && capabilityMap.htp?.adapter === "mcp-passthrough" && capabilityMap.gated?.length > 0,
    JSON.stringify({ seosmith: capabilityMap.seosmith?.adapter, htp: capabilityMap.htp?.adapter }),
  );

  // No-shell boundary: every recorded argv must be an array of strings and the
  // request/database values must appear as discrete arguments, never as a
  // concatenated shell string.
  const log = existsSync(logPath) ? readFileSync(logPath, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l)) : [];
  const hasShellish = log.some((argv) => argv.some((a) => /[;&|`$]/.test(a) && a.includes(" ")));
  record("pi.exec used argv arrays (no shell interpolation)", log.length >= 6 && !hasShellish, `${log.length} invocations`);

  // The HTP binding: the extension registered the `htp` MCP server in the
  // runtime's MCP registry, and htp_connection_status resolves its URL.
  const registeredServers = loaded.runtime.mcpServers.list();
  record(
    "extension registers the htp MCP server",
    registeredServers.some((s) => s.name === "htp" && typeof s.config?.url === "string" && s.config.url.startsWith("https://")),
    JSON.stringify(registeredServers.map((s) => ({ name: s.name, url: s.config?.url }))),
  );
  record(
    "htp_connection_status reports the registered URL",
    typeof connection.url === "string" && connection.url.startsWith("https://"),
    connection.url,
  );
} finally {
  session.dispose();
  rmSync(work, { recursive: true, force: true });
}

const failed = results.filter((r) => !r.ok);
for (const r of results) console.log(`${r.ok ? "ok  " : "FAIL"} ${r.name}${r.detail ? ` — ${r.detail}` : ""}`);
if (failed.length) {
  console.error(`\nHost smoke FAILED: ${failed.length}/${results.length} checks failed.`);
  process.exit(1);
}
console.log(`\nHost smoke OK: ${results.length}/${results.length} checks passed (Pi ${sdk.VERSION ?? "?"}).`);
