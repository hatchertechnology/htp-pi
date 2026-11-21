// Pi host binding for the SEOsmith #18 local operations adapter.
//
// This module is deliberately free of Pi imports so it can be unit tested in
// plain Node. The Pi extension passes in a bounded `exec` function (the host's
// `pi.exec(argv)` primitive, which never uses a shell). Every command is an
// argv array; no command string is ever interpolated.
//
// The adapter discovers an explicitly configured SEOsmith executable, verifies
// it is a trusted absolute regular executable file, and invokes only the
// additive `operations` subcommands. Missing binary, incompatible adapter
// version or a missing capability is reported as unavailable/unsupported; the
// legacy `crawl`/`serve` commands are never substituted.
//
// No HTP account, credential, browser worker or public endpoint is required for
// local operations. Credentials are never placed in argv, request files, logs
// or returned evidence.

import { access, constants, mkdtemp, stat, writeFile } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { tmpdir } from "node:os";

export const ADAPTER_VERSION = 1;
export const REQUEST_LIMIT = 16 * 1024;
export const REPORT_LIMIT = 16 * 1024 * 1024;
export const CAPABILITY_TIMEOUT_MS = 5_000;
export const OPERATION_TIMEOUT_MS = 15 * 60 * 1000;

const OPERATIONS = [
  "seosmith.start",
  "seosmith.status",
  "seosmith.cancel",
  "seosmith.report",
  "seosmith.export",
];

/** Bounded, classified adapter failure. `code` is a stable lower_snake token. */
export class AdapterError extends Error {
  constructor(code, message, { retryable = false, cause } = {}) {
    super(message);
    this.name = "AdapterError";
    this.code = code;
    this.retryable = retryable;
    if (cause) this.cause = cause;
  }
}

/**
 * Resolve the configured executable. Only an explicitly configured absolute
 * path is accepted; there is no PATH search and no shell command string.
 */
export function resolveBinary(env = process.env) {
  const raw = env.HTP_PI_SEOSMITH_BIN || env.SEOSMITH_BIN;
  if (!raw || typeof raw !== "string" || raw.trim() === "") {
    throw new AdapterError(
      "binary_unconfigured",
      "Set HTP_PI_SEOSMITH_BIN (or SEOSMITH_BIN) to an absolute SEOsmith executable path.",
    );
  }
  if (!isAbsolute(raw)) {
    throw new AdapterError(
      "binary_not_absolute",
      "The configured SEOsmith executable must be an absolute path.",
    );
  }
  return raw;
}

/** Verify a path is an existing regular executable file. */
export async function assertExecutable(path) {
  if (!isAbsolute(path)) {
    throw new AdapterError("binary_not_absolute", "The SEOsmith executable must be an absolute path.");
  }
  let info;
  try {
    info = await stat(path);
  } catch (err) {
    throw new AdapterError("missing_binary", `SEOsmith executable not found: ${path}`, { cause: err });
  }
  if (!info.isFile()) {
    throw new AdapterError("missing_binary", `SEOsmith executable is not a regular file: ${path}`);
  }
  try {
    await access(path, constants.X_OK);
  } catch (err) {
    throw new AdapterError("not_executable", `SEOsmith executable is not executable: ${path}`, { cause: err });
  }
  return path;
}

function ensureAbsolute(label, value) {
  if (typeof value !== "string" || !isAbsolute(value)) {
    throw new AdapterError("invalid_argument", `${label} must be an absolute path.`);
  }
  return value;
}

function ensureId(value) {
  if (typeof value !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
    throw new AdapterError("invalid_argument", "id must be a non-nil UUID.");
  }
  return value;
}

function parseJsonOutput(stdout) {
  const text = String(stdout ?? "").trim();
  if (text === "") throw new AdapterError("invalid_output", "SEOsmith produced no JSON output.");
  try {
    return JSON.parse(text);
  } catch (err) {
    throw new AdapterError("invalid_output", "SEOsmith produced malformed JSON output.", { cause: err });
  }
}

/**
 * Map a failed process result to a classified AdapterError. SEOsmith writes a
 * compact JSON error object to stderr on invocation/storage failures.
 */
export function classifyFailure(result, fallbackCode = "operation_failed") {
  const stderr = String(result?.stderr ?? "").trim();
  let code = fallbackCode;
  let message = stderr || `SEOsmith exited with code ${result?.code}`;
  if (stderr.startsWith("{")) {
    try {
      const parsed = JSON.parse(stderr);
      if (typeof parsed.code === "string") code = parsed.code;
      if (typeof parsed.error === "string") message = parsed.error;
      else if (typeof parsed.message === "string") message = parsed.message;
    } catch {
      // keep the raw stderr as the message
    }
  }
  const retryable = /timeout|unavailable|busy|locked|temporar/i.test(`${code} ${message}`);
  return new AdapterError(code, message, { retryable });
}

function run(exec, argv, options) {
  return exec(argv[0], argv.slice(1), options);
}

/**
 * Discover the local adapter. Never opens a database or contacts a service.
 * Returns the capabilities object with `adapter_version` verified.
 */
export async function discover({ exec, binary, timeoutMs = CAPABILITY_TIMEOUT_MS } = {}) {
  const resolved = binary ?? resolveBinary();
  await assertExecutable(resolved);
  const result = await run(exec, [resolved, "operations", "capabilities"], { timeout: timeoutMs });
  if (result.code !== 0) throw classifyFailure(result, "capabilities_failed");
  const value = parseJsonOutput(result.stdout);
  if (value?.adapter_version !== ADAPTER_VERSION) {
    throw new AdapterError(
      "incompatible_adapter",
      `Unsupported SEOsmith adapter_version ${JSON.stringify(value?.adapter_version)}; expected ${ADAPTER_VERSION}.`,
    );
  }
  return { ...value, binary: resolved, operations: value.operations ?? OPERATIONS };
}

/** Throw unless the discovered adapter advertises the requested operation. */
export async function requireCapability(options, operation) {
  const caps = await discover(options);
  if (!Array.isArray(caps.operations) || !caps.operations.includes(operation)) {
    throw new AdapterError("unsupported", `SEOsmith adapter does not advertise ${operation}.`);
  }
  return caps;
}

function baseArgv(binary, database) {
  ensureAbsolute("database", database);
  return [binary, "--database", database, "operations"];
}

/**
 * Explicit bounded start. Writes the request JSON to a private request file
 * (mode 0600 in a private directory) because SEOsmith takes `--request <file>`.
 * The caller must supply a fresh request_id and database for a new audit; an
 * identical retry returns the existing status.
 */
export async function start({
  exec,
  binary,
  database,
  request,
  requestDir,
  timeoutMs = OPERATION_TIMEOUT_MS,
  makeRequestDir = defaultRequestDir,
} = {}) {
  const resolved = binary ?? resolveBinary();
  await assertExecutable(resolved);
  if (request === null || typeof request !== "object" || Array.isArray(request)) {
    throw new AdapterError("invalid_request", "request must be a JSON object.");
  }
  const bytes = Buffer.from(JSON.stringify(request), "utf8");
  if (bytes.length > REQUEST_LIMIT) {
    throw new AdapterError("request_too_large", `Request JSON exceeds ${REQUEST_LIMIT} bytes.`);
  }
  await requireCapability({ exec, binary: resolved }, "seosmith.start");
  const dir = requestDir ?? (await makeRequestDir());
  const requestPath = join(dir, `request-${request.request_id ?? "anonymous"}.json`);
  await writeFile(requestPath, bytes, { mode: 0o600, flag: "wx" }).catch(async (err) => {
    if (err?.code === "EEXIST") {
      // Retrying the exact same request identity is allowed to reuse the file.
      await writeFile(requestPath, bytes, { mode: 0o600 });
      return;
    }
    throw new AdapterError("request_write_failed", `Could not write request file: ${err.message}`, { cause: err });
  });
  const result = await run(exec, [...baseArgv(resolved, database), "start", "--request", requestPath], {
    timeout: timeoutMs,
  });
  if (result.code !== 0) throw classifyFailure(result, "start_failed");
  return parseJsonOutput(result.stdout);
}

async function readOperation({ exec, binary, database, id, operation, timeoutMs, retries = 0 }) {
  const resolved = binary ?? resolveBinary();
  await requireCapability({ exec, binary: resolved }, `seosmith.${operation}`);
  ensureId(id);
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const result = await run(exec, [...baseArgv(resolved, database), operation, "--id", id], {
      timeout: timeoutMs,
    });
    if (result.code === 0) return result;
    lastError = classifyFailure(result, `${operation}_failed`);
    if (!lastError.retryable) throw lastError;
  }
  throw lastError;
}

/** Status read. Never resumes work. Retries only classified-transient failures. */
export async function status({ exec, binary, database, id, timeoutMs = 60_000, retries = 1 } = {}) {
  const result = await readOperation({
    exec, binary, database, id, operation: "status", timeoutMs, retries,
  });
  return parseJsonOutput(result.stdout);
}

/** Cancel request. Idempotent at the adapter; accepted is not terminal. */
export async function cancel({ exec, binary, database, id, timeoutMs = 60_000 } = {}) {
  const result = await readOperation({
    exec, binary, database, id, operation: "cancel", timeoutMs, retries: 0,
  });
  return parseJsonOutput(result.stdout);
}

/** Exact retained report bytes, returned verbatim as a string. */
export async function report({ exec, binary, database, id, timeoutMs = 60_000, retries = 1 } = {}) {
  const result = await readOperation({
    exec, binary, database, id, operation: "report", timeoutMs, retries,
  });
  const text = String(result.stdout ?? "");
  const bytes = Buffer.byteLength(text, "utf8");
  if (bytes > REPORT_LIMIT) {
    throw new AdapterError("report_too_large", `Report exceeds the ${REPORT_LIMIT}-byte adapter budget.`);
  }
  return { text, bytes };
}

/** Export the exact report bytes to a new file and return the receipt. */
export async function exportReport({ exec, binary, database, id, output, timeoutMs = 60_000 } = {}) {
  const resolved = binary ?? resolveBinary();
  await requireCapability({ exec, binary: resolved }, "seosmith.export");
  ensureId(id);
  ensureAbsolute("output", output);
  const result = await run(exec, [...baseArgv(resolved, database), "export", "--id", id, "--output", output], {
    timeout: timeoutMs,
  });
  if (result.code !== 0) throw classifyFailure(result, "export_failed");
  return parseJsonOutput(result.stdout);
}

async function defaultRequestDir() {
  return mkdtemp(join(tmpdir(), "htp-pi-seosmith-"), { mode: 0o700 });
}

export const OPERATION_IDS = OPERATIONS;
