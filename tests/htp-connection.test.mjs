import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  authFilePath,
  connectionStatus,
  mcpToolNames,
  readAuthStatus,
  resolveHtpMcpUrl,
  DEFAULT_HTP_MCP_URL,
} from "../extensions/htp-pi/lib/htp-connection.mjs";

async function authFile(contents) {
  const dir = await mkdtemp(join(tmpdir(), "auth-test-"));
  const file = join(dir, "mcp-auth.json");
  await writeFile(file, typeof contents === "string" ? contents : JSON.stringify(contents), { mode: 0o600 });
  return file;
}

test("resolveHtpMcpUrl uses the env override or the documented default", () => {
  assert.equal(resolveHtpMcpUrl({}), DEFAULT_HTP_MCP_URL);
  assert.equal(resolveHtpMcpUrl({ HTP_PI_MCP_URL: "https://example.test/mcp" }), "https://example.test/mcp");
});

test("authFilePath honours PI_CODING_AGENT_DIR and the explicit override", () => {
  assert.equal(authFilePath({ PI_CODING_AGENT_DIR: "/tmp/iso" }), "/tmp/iso/mcp-auth.json");
  assert.equal(
    authFilePath({ PI_CODING_AGENT_DIR: "/tmp/iso", HTP_PI_MCP_AUTH_FILE: "/tmp/explicit.json" }),
    "/tmp/explicit.json",
  );
  // Compatibility fallback only.
  assert.equal(authFilePath({ PI_AGENT_DIR: "/tmp/legacy" }), "/tmp/legacy/mcp-auth.json");
});

test("readAuthStatus never returns token material", async () => {
  const url = "https://example.test/mcp";
  const file = await authFile({
    [`mcp__htp|${url}`]: { tokens: { access_token: "SECRET" }, tokensExpireAt: 12345 },
  });
  const result = await readAuthStatus({ url, file });
  assert.equal(result.signedIn, true);
  assert.equal(result.expiresAt, 12345);
  assert.ok(!JSON.stringify(result).includes("SECRET"));
});

test("readAuthStatus handles missing and unreadable stores", async () => {
  const missing = await readAuthStatus({ url: "https://x.test", file: "/tmp/does-not-exist-auth.json" });
  assert.deepEqual(missing, { available: true, signedIn: false, expiresAt: null });
  const file = await authFile("not json");
  const unreadable = await readAuthStatus({ url: "https://x.test", file });
  assert.equal(unreadable.available, false);
  assert.equal(unreadable.signedIn, false);
});

test("mcpToolNames filters and sorts the htp server tools", () => {
  const tools = [
    { name: "read" },
    { name: "mcp__htp__list_websites" },
    { name: "mcp__other__thing" },
    { name: "mcp__htp__get_website" },
  ];
  assert.deepEqual(mcpToolNames(tools), ["mcp__htp__get_website", "mcp__htp__list_websites"]);
});

test("connectionStatus distinguishes signed-out, connected and stored-only states", async () => {
  const url = "https://example.test/mcp";
  const signedOut = await connectionStatus({
    allTools: [],
    env: { HTP_PI_MCP_URL: url, HTP_PI_MCP_AUTH_FILE: await authFile({}) },
  });
  assert.equal(signedOut.state, "signed_out");

  const connected = await connectionStatus({
    allTools: [{ name: "mcp__htp__list_websites" }],
    env: {
      HTP_PI_MCP_URL: url,
      HTP_PI_MCP_AUTH_FILE: await authFile({ [`mcp__htp|${url}`]: { tokensExpireAt: 1 } }),
    },
  });
  assert.equal(connected.state, "connected");
  assert.equal(connected.toolCount, 1);

  const storedOnly = await connectionStatus({
    allTools: [],
    env: {
      HTP_PI_MCP_URL: url,
      HTP_PI_MCP_AUTH_FILE: await authFile({ [`mcp__htp|${url}`]: { tokensExpireAt: Date.now() + 3_600_000 } }),
    },
  });
  assert.equal(storedOnly.state, "credentials_stored_server_not_connected");
  assert.equal(storedOnly.expired, false);
});

test("connectionStatus surfaces credential expiry without claiming a failed read", async () => {
  const url = "https://example.test/mcp";
  const file = await authFile({ [`mcp__htp|${url}`]: { tokensExpireAt: 1 } });
  const expired = await connectionStatus({
    allTools: [],
    env: { HTP_PI_MCP_URL: url, HTP_PI_MCP_AUTH_FILE: file },
    now: Date.now(),
  });
  assert.equal(expired.state, "credentials_expired");
  assert.equal(expired.expired, true);
  assert.equal(expired.signedIn, true);
});

test("a connected server stays connected even when the stored access token expired", async () => {
  const url = "https://example.test/mcp";
  const file = await authFile({ [`mcp__htp|${url}`]: { tokensExpireAt: 1 } });
  const connected = await connectionStatus({
    allTools: [{ name: "mcp__htp__list_websites" }],
    env: { HTP_PI_MCP_URL: url, HTP_PI_MCP_AUTH_FILE: file },
    now: Date.now(),
  });
  assert.equal(connected.state, "connected");
  assert.equal(connected.expired, true);
});
