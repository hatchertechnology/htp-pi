#!/usr/bin/env node
// Real fail-closed baseline for the HTP MCP endpoint.
//
// Verifies, without any credential:
//   - an unauthenticated MCP initialize is rejected (401) with an RFC 9728
//     protected-resource metadata pointer and an explicit scope, and
//   - the protected-resource metadata document is served and names an
//     authorization server.
//
// This is host-independent transport evidence: it does not sign in and does not
// read, print or reuse any token. Set HTP_PI_ALLOW_OFFLINE=1 to skip on network
// failure. Run: node scripts/check-htp-fail-closed.mjs

import { resolveHtpMcpUrl } from "../extensions/htp-pi/lib/htp-connection.mjs";

const url = resolveHtpMcpUrl();
const errors = [];
const note = (m) => console.log(m);

async function main() {
  let response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-06-18",
          capabilities: {},
          clientInfo: { name: "htp-pi-fail-closed-check", version: "1.0.0" },
        },
      }),
      signal: AbortSignal.timeout(20_000),
    });
  } catch (err) {
    if (process.env.HTP_PI_ALLOW_OFFLINE === "1") {
      note(`HTP fail-closed check skipped (offline): ${err.message}`);
      process.exit(0);
    }
    throw err;
  }

  if (response.status !== 401) {
    errors.push(`unauthenticated initialize must be 401, got ${response.status}`);
  }
  const authenticate = response.headers.get("www-authenticate") ?? "";
  if (!/Bearer/i.test(authenticate)) errors.push(`www-authenticate must be Bearer, got: ${authenticate}`);
  if (!/resource_metadata="https:\/\//.test(authenticate)) {
    errors.push("www-authenticate must carry an https resource_metadata pointer");
  }
  if (!/scope="[^"]*openid/.test(authenticate)) errors.push("www-authenticate must name the openid scope");
  note(`unauthenticated MCP initialize -> ${response.status} (fail-closed)`);

  const metadataUrl = authenticate.match(/resource_metadata="([^"]+)"/)?.[1];
  if (metadataUrl) {
    const meta = await fetch(metadataUrl, { signal: AbortSignal.timeout(20_000) });
    if (meta.status !== 200) {
      errors.push(`protected-resource metadata must be 200, got ${meta.status}`);
    } else {
      const body = await meta.json();
      if (!Array.isArray(body.authorization_servers) || body.authorization_servers.length === 0) {
        errors.push("protected-resource metadata must name at least one authorization server");
      }
      note(`protected-resource metadata -> 200 (${(body.authorization_servers ?? []).length} authorization server(s))`);
    }
  }
}

try {
  await main();
} catch (err) {
  errors.push(`request failed: ${err.message}`);
}

if (errors.length) {
  console.error(`HTP fail-closed check FAILED (${errors.length}):`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log("HTP fail-closed check OK: unauthenticated access rejected with OAuth metadata; no credential used.");
