// HTP connection/auth inspection for the Pi host.
//
// Pi owns MCP OAuth. This module only *reads* connection state so the host can
// report it truthfully:
//   - whether the extension registered the `htp` MCP server,
//   - which `mcp__htp__*` tools Pi currently exposes,
//   - whether Pi has stored credentials for the server name+URL.
//
// It never reads, prints or forwards tokens. Credential values stay in Pi's
// ~/.pi/agent/mcp-auth.json and are never returned by any tool.

import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

export const HTP_SERVER_NAME = "htp";
export const DEFAULT_HTP_MCP_URL = "https://htp-api-kerry-hatcher.fly.dev/mcp/secured";

export function resolveHtpMcpUrl(env = process.env) {
  const value = env.HTP_PI_MCP_URL || env.HTP_MCP_URL;
  return typeof value === "string" && value.trim() !== "" ? value.trim() : DEFAULT_HTP_MCP_URL;
}

export function authFilePath(env = process.env) {
  if (env.HTP_PI_MCP_AUTH_FILE) return env.HTP_PI_MCP_AUTH_FILE;
  const agentDir = env.PI_AGENT_DIR || join(homedir(), ".pi", "agent");
  return join(agentDir, "mcp-auth.json");
}

function credentialKey(serverName, url) {
  return `mcp__${serverName}|${url}`;
}

/**
 * Read Pi's MCP credential store and report whether an entry exists for the
 * HTP server. Returns only non-secret metadata (presence + expiry).
 */
export async function readAuthStatus({ serverName = HTP_SERVER_NAME, url, file } = {}) {
  const path = file ?? authFilePath();
  let store;
  try {
    store = JSON.parse(await readFile(path, "utf8"));
  } catch (err) {
    if (err?.code === "ENOENT") return { available: true, signedIn: false, expiresAt: null };
    return { available: false, signedIn: false, expiresAt: null, error: "auth_store_unreadable" };
  }
  const key = credentialKey(serverName, url);
  const entry = store?.[key];
  if (!entry || typeof entry !== "object") {
    return { available: true, signedIn: false, expiresAt: null };
  }
  return {
    available: true,
    signedIn: true,
    expiresAt: typeof entry.tokensExpireAt === "number" ? entry.tokensExpireAt : null,
  };
}

/** Names of the MCP tools Pi exposes for a server, without their parameters. */
export function mcpToolNames(allTools, serverName = HTP_SERVER_NAME) {
  const prefix = `mcp__${serverName.replace(/[^A-Za-z0-9_]/g, "_")}__`;
  return (allTools ?? [])
    .map((tool) => tool?.name)
    .filter((name) => typeof name === "string" && name.startsWith(prefix))
    .sort();
}

/** Summarize connection state for the capability/status tool. */
export async function connectionStatus({ allTools, env = process.env } = {}) {
  const url = resolveHtpMcpUrl(env);
  const auth = await readAuthStatus({ url, file: authFilePath(env) });
  const tools = mcpToolNames(allTools);
  const connected = tools.length > 0;
  let state = "signed_out";
  if (auth.signedIn && connected) state = "connected";
  else if (auth.signedIn && !connected) state = "credentials_stored_server_not_connected";
  else if (!auth.signedIn && connected) state = "connected_without_stored_credentials";
  return {
    server: HTP_SERVER_NAME,
    url,
    state,
    signedIn: auth.signedIn,
    expiresAt: auth.expiresAt,
    toolCount: tools.length,
    tools,
    authStoreAvailable: auth.available,
    login: `pi mcp login ${HTP_SERVER_NAME}`,
    logout: `pi mcp logout ${HTP_SERVER_NAME}`,
    reconnect: `/mcp reconnect ${HTP_SERVER_NAME}`,
  };
}
