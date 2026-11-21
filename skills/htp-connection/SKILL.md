---
name: htp-connection
description: Use when connecting Pi to HTP, checking whether HTP is signed in, reconnecting after auth expiry, signing out, or understanding which HTP and SEOsmith operations this Pi package supports and which remain gated.
---

# Connect Pi to HTP

The `htp-pi` package registers the HTP streamable-HTTP MCP server named `htp`.
Pi owns the OAuth 2.1 + PKCE lifecycle; the package never reads, prints or
forwards access tokens, refresh tokens, passwords or Google/Bing credentials.

## Check state first

Call `htp_connection_status`. It reports:

- `state`: `connected`, `signed_out`,
  `credentials_stored_server_not_connected`, or
  `connected_without_stored_credentials`.
- `tools`: the discovered `mcp__htp__*` tool names.
- `signedIn`, `expiresAt`, `authStoreAvailable`.

Call `htp_pi_capabilities` for the full truthful capability map, including the
backend/verification gates that remain. A skill mentioning an operation never
makes it available.

## Sign in, reconnect, sign out

Use the Pi MCP lifecycle; do not ask for tokens in chat:

- Sign in: `pi mcp login htp` (opens the browser; over SSH/headless paste the
  redirected URL into the sign-in screen).
- Reconnect: `/mcp reconnect htp` inside a session, or restart Pi.
- Sign out: `pi mcp logout htp`. This deletes the stored credentials for the
  server name+URL; saved HTP evidence is retained by the service.
- Inspect: `/mcp` or `pi mcp list`.

If the HTP endpoint requires a different server name or URL, the package reads
`HTP_PI_MCP_URL` (default documented in `docs/pi-host-compatibility.md`). A
file-configured `htp` entry in `mcp.json` takes precedence over the extension
registration.

## Unavailable modes (stay explicit)

- Denied or expired authorization must fail closed. Do not retry by inventing
  another account or substituting public/demo tools.
- HTP Business Profile writes remain behind the HTP feature flag.
- Durable provider requests (contract 1.1.0) require deployed backend support
  and tool schema verification; do not claim them.
- Reads never start collection. Use the website-management skill for explicit
  collection or writes.
