import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, stat, readFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

import {
  AdapterError,
  classifyFailure,
  discover,
  exportReport,
  report,
  resolveBinary,
  start,
  status,
  cancel,
  REQUEST_LIMIT,
} from "../extensions/htp-pi/lib/seosmith-adapter.mjs";

const here = dirname(fileURLToPath(import.meta.url));
// A real, executable file used as the configured binary. The tests never run it.
const BINARY = process.execPath;

const CAPS = {
  adapter_version: 1,
  engine_version: "0.2.0",
  report_schema_version: 1,
  ruleset_version: "2026.11",
  transport: "local_cli",
  operations: ["seosmith.start", "seosmith.status", "seosmith.cancel", "seosmith.report", "seosmith.export"],
  limits: { request_bytes: 16384, report_bytes: 16777216 },
  advanced: { evidence_v2: false, authorized_staging: false, ci_baseline: false },
  delivery: "disabled",
  authentication: "local_os_account",
};

function makeExec(routes) {
  const calls = [];
  const exec = async (command, args, options) => {
    calls.push({ command, args, options });
    const sub = args.find((a) => ["capabilities", "start", "status", "cancel", "report", "export"].includes(a));
    const handler = routes[sub];
    if (!handler) throw new Error(`no route for ${sub}: ${args.join(" ")}`);
    const result = typeof handler === "function" ? handler({ command, args, options, calls }) : handler;
    return { stdout: "", stderr: "", code: 0, killed: false, truncated: false, ...result };
  };
  exec.calls = calls;
  return exec;
}

const json = (value) => ({ stdout: JSON.stringify(value) });

test("resolveBinary rejects unconfigured and relative paths", () => {
  assert.throws(() => resolveBinary({}), (e) => e instanceof AdapterError && e.code === "binary_unconfigured");
  assert.throws(
    () => resolveBinary({ SEOSMITH_BIN: "./seosmith" }),
    (e) => e instanceof AdapterError && e.code === "binary_not_absolute",
  );
  assert.equal(resolveBinary({ HTP_PI_SEOSMITH_BIN: "/opt/seosmith" }), "/opt/seosmith");
});

test("discover verifies adapter_version and executable", async () => {
  const exec = makeExec({ capabilities: json(CAPS) });
  const caps = await discover({ exec, binary: BINARY });
  assert.equal(caps.adapter_version, 1);
  assert.equal(caps.binary, BINARY);
  assert.deepEqual(exec.calls[0].args, ["operations", "capabilities"]);
});

test("discover reports missing binary without invoking it", async () => {
  let invoked = false;
  const exec = async () => {
    invoked = true;
    return json(CAPS);
  };
  await assert.rejects(
    discover({ exec, binary: join(tmpdir(), "definitely-missing-seosmith") }),
    (e) => e.code === "missing_binary",
  );
  assert.equal(invoked, false);
});

test("discover rejects an incompatible adapter version", async () => {
  const exec = makeExec({ capabilities: json({ ...CAPS, adapter_version: 2 }) });
  await assert.rejects(discover({ exec, binary: BINARY }), (e) => e.code === "incompatible_adapter");
});

test("discover rejects malformed JSON", async () => {
  const exec = makeExec({ capabilities: { stdout: "not json" } });
  await assert.rejects(discover({ exec, binary: BINARY }), (e) => e.code === "invalid_output");
});

test("classifyFailure extracts the JSON error code and retryability", () => {
  const err = classifyFailure({ code: 1, stderr: '{"code":"worker_unavailable","error":"try later"}' });
  assert.equal(err.code, "worker_unavailable");
  assert.equal(err.retryable, true);
  const err2 = classifyFailure({ code: 2, stderr: "clap syntax" });
  assert.equal(err2.code, "operation_failed");
  assert.equal(err2.retryable, false);
});

test("start writes a private request file and passes argv without a shell", async () => {
  const dir = await mkdtemp(join(tmpdir(), "adapter-test-"));
  const exec = makeExec({
    capabilities: json(CAPS),
    start: ({ command, args }) => {
      assert.equal(command, BINARY);
      assert.equal(args[0], "--database");
      assert.ok(args.includes("--request"));
      assert.ok(!args.some((a) => typeof a !== "string"));
      return json({ state: "running", request_id: "b2a844c8-5bc9-49e5-bcf0-8fd1407d69f4" });
    },
  });
  const request = {
    request_id: "b2a844c8-5bc9-49e5-bcf0-8fd1407d69f4",
    website_id: "4822f25e-af3c-4c60-a8c6-31bd99d2acda",
    url: "https://example.com/",
    max_pages: 20,
    max_resources: 20,
    max_duration_seconds: 60,
    delay_ms: 1000,
    check_external_links: false,
  };
  const result = await start({
    exec,
    binary: BINARY,
    database: join(dir, "run.sqlite"),
    request,
    requestDir: dir,
  });
  assert.equal(result.state, "running");
  const files = (await readdir(dir)).filter((f) => f.endsWith(".json"));
  assert.equal(files.length, 1, "exactly one unique request file must be written");
  const reqPath = join(dir, files[0]);
  const info = await stat(reqPath);
  assert.equal(info.mode & 0o777, 0o600);
  assert.deepEqual(JSON.parse(await readFile(reqPath, "utf8")), request);
});

test("an identical retry never overwrites the earlier request file", async () => {
  const dir = await mkdtemp(join(tmpdir(), "adapter-test-"));
  const exec = makeExec({ capabilities: json(CAPS), start: json({ state: "running" }) });
  const request = {
    request_id: "b2a844c8-5bc9-49e5-bcf0-8fd1407d69f4",
    website_id: "4822f25e-af3c-4c60-a8c6-31bd99d2acda",
    url: "https://example.com/",
    max_pages: 1,
    max_resources: 0,
    max_duration_seconds: 30,
    delay_ms: 1000,
    check_external_links: false,
  };
  await start({ exec, binary: BINARY, database: join(dir, "run.sqlite"), request, requestDir: dir });
  await start({ exec, binary: BINARY, database: join(dir, "run.sqlite"), request, requestDir: dir });
  const files = (await readdir(dir)).filter((f) => f.endsWith(".json"));
  assert.equal(files.length, 2, "each start gets its own file; no overwrite");
  for (const f of files) {
    assert.deepEqual(JSON.parse(await readFile(join(dir, f), "utf8")), request);
  }
});

test("a traversal-bearing request_id is rejected and writes nothing", async () => {
  const dir = await mkdtemp(join(tmpdir(), "adapter-test-"));
  const exec = makeExec({ capabilities: json(CAPS) });
  await assert.rejects(
    start({
      exec,
      binary: BINARY,
      database: join(dir, "run.sqlite"),
      request: {
        request_id: "x/../../../owned",
        website_id: "4822f25e-af3c-4c60-a8c6-31bd99d2acda",
        url: "https://example.com/",
        max_pages: 1,
        max_resources: 0,
        max_duration_seconds: 30,
        delay_ms: 1000,
        check_external_links: false,
      },
      requestDir: dir,
    }),
    (e) => e.code === "invalid_request_id",
  );
  assert.deepEqual(await readdir(dir), [], "no file may be written for an invalid identity");
  assert.equal(exec.calls.length, 0, "no SEOsmith process should run");
});

test("start rejects an oversized request before invoking SEOsmith", async () => {
  const dir = await mkdtemp(join(tmpdir(), "adapter-test-"));
  const exec = makeExec({ capabilities: json(CAPS) });
  await assert.rejects(
    start({
      exec,
      binary: BINARY,
      database: join(dir, "run.sqlite"),
      request: { request_id: "x", blob: "a".repeat(REQUEST_LIMIT + 1) },
      requestDir: dir,
    }),
    (e) => e.code === "request_too_large",
  );
  assert.equal(exec.calls.length, 0, "no SEOsmith process should run");
});

test("status retries classified-transient failures then succeeds", async () => {
  let attempts = 0;
  const exec = makeExec({
    capabilities: json(CAPS),
    status: () => {
      attempts += 1;
      if (attempts === 1) return { code: 1, stderr: '{"code":"worker_unavailable","error":"busy"}' };
      return json({ state: "completed", request_id: "b2a844c8-5bc9-49e5-bcf0-8fd1407d69f4" });
    },
  });
  const result = await status({
    exec,
    binary: BINARY,
    database: "/tmp/run.sqlite",
    id: "b2a844c8-5bc9-49e5-bcf0-8fd1407d69f4",
    retries: 1,
  });
  assert.equal(result.state, "completed");
  assert.equal(attempts, 2);
});

test("status does not retry a non-retryable failure", async () => {
  let attempts = 0;
  const exec = makeExec({
    capabilities: json(CAPS),
    status: () => {
      attempts += 1;
      return { code: 1, stderr: '{"code":"invalid_scope","error":"bad"}' };
    },
  });
  await assert.rejects(
    status({ exec, binary: BINARY, database: "/tmp/run.sqlite", id: "b2a844c8-5bc9-49e5-bcf0-8fd1407d69f4", retries: 3 }),
    (e) => e.code === "invalid_scope",
  );
  assert.equal(attempts, 1);
});

test("cancel surfaces accepted versus terminal without fabricating completion", async () => {
  const exec = makeExec({
    capabilities: json(CAPS),
    cancel: json({ cancel_accepted: true, cancellation_terminal: false }),
  });
  const result = await cancel({
    exec,
    binary: BINARY,
    database: "/tmp/run.sqlite",
    id: "b2a844c8-5bc9-49e5-bcf0-8fd1407d69f4",
  });
  assert.deepEqual(result, { cancel_accepted: true, cancellation_terminal: false });
});

test("report returns exact bytes and enforces the size budget", async () => {
  const body = '{"schema_version":1,"outcome":"unknown","coverage_complete":false}';
  const exec = makeExec({ capabilities: json(CAPS), report: { stdout: body } });
  const result = await report({
    exec,
    binary: BINARY,
    database: "/tmp/run.sqlite",
    id: "b2a844c8-5bc9-49e5-bcf0-8fd1407d69f4",
  });
  assert.equal(result.text, body);
  assert.equal(result.bytes, Buffer.byteLength(body));

  const big = makeExec({ capabilities: json(CAPS), report: { stdout: "x".repeat(17 * 1024 * 1024) } });
  await assert.rejects(
    report({ exec: big, binary: BINARY, database: "/tmp/run.sqlite", id: "b2a844c8-5bc9-49e5-bcf0-8fd1407d69f4" }),
    (e) => e.code === "report_too_large",
  );
});

test("export returns the receipt and rejects a non-absolute output", async () => {
  const exec = makeExec({
    capabilities: json(CAPS),
    export: json({ request_id: "b2a844c8-5bc9-49e5-bcf0-8fd1407d69f4", bytes: 12, sha256: "abc" }),
  });
  const result = await exportReport({
    exec,
    binary: BINARY,
    database: "/tmp/run.sqlite",
    id: "b2a844c8-5bc9-49e5-bcf0-8fd1407d69f4",
    output: "/tmp/report.json",
  });
  assert.equal(result.sha256, "abc");
  await assert.rejects(
    exportReport({
      exec,
      binary: BINARY,
      database: "/tmp/run.sqlite",
      id: "b2a844c8-5bc9-49e5-bcf0-8fd1407d69f4",
      output: "relative.json",
    }),
    (e) => e.code === "invalid_argument",
  );
});

test("operations are rejected when the adapter does not advertise them", async () => {
  const exec = makeExec({ capabilities: json({ ...CAPS, operations: ["seosmith.status"] }) });
  await assert.rejects(
    report({ exec, binary: BINARY, database: "/tmp/run.sqlite", id: "b2a844c8-5bc9-49e5-bcf0-8fd1407d69f4" }),
    (e) => e.code === "unsupported",
  );
});
