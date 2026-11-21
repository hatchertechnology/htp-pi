# Isolated HTP OAuth verification (Pi)

This procedure completes the host OAuth acceptance for `htp-pi` #1 without
touching the user's Pi profile or any shared grant. It is the Pi equivalent of
the isolated synthetic OAuth flow used by the Codex host.

## Rules

- Use an isolated agent directory: set `PI_CODING_AGENT_DIR` to a fresh temporary directory you own.
- Use only the ordinary Pi MCP OAuth lifecycle (`pi mcp login htp`,
  `/mcp reconnect htp`, `pi mcp logout htp`). Never extract, print, copy or
  reuse an access/refresh token, and never revoke another host's or the shared
  grant.
- The synthetic owner completes browser consent privately; the callback URL and
  any credential value are not pasted into reports or messages.
- Reads are read-only. Do not create, update, delete or request collection
  during the OAuth acceptance.
- Fixture identities are provided by the integration coordinator's private
  hosted-acceptance state (`site`, `users.a` owner, `users.b` non-owner). Inspect
  the private file locally; do not copy its path or print identity or credential
  values into reports or messages.

## Steps

1. **Unattended fail-closed baseline** (no account):
   ```sh
   node scripts/check-htp-fail-closed.mjs
   ```
   Expect 401 with an RFC 9728 `resource_metadata` pointer and the `openid`
   scope, and a 200 protected-resource metadata document.

2. **Register and sign in** (isolated home, owner consent):
   ```sh
   PI_CODING_AGENT_DIR="$ISOLATED_HOME" pi mcp login htp
   ```
   `pi mcp login` requires a configured `htp` server. Add it first in the
   isolated home if needed:
   ```sh
   PI_CODING_AGENT_DIR="$ISOLATED_HOME" \
     pi mcp add htp --url https://htp-api-kerry-hatcher.fly.dev/mcp/secured
   ```
   The extension registers the same server in a session; the file entry is only
   for the shell login command, which does not load extensions.

3. **Verify state and authorized saved read** through the installed package:
   - `htp_connection_status` → `state: "connected"`, non-empty `tools`.
   - `htp_pi_capabilities` → HTP `state: "connected"`.
   - `mcp__htp__list_websites` returns the synthetic owner's saved list.
   - `mcp__htp__website_saved_data` reads stored data for the fixture `site`;
     confirm it does not create a collection job.

4. **Denied cross-account read**: with the non-owner profile, the same read must
   fail closed (`forbidden`/`auth_required`), never return another account's
   data.

5. **Reconnect and logout**: `/mcp reconnect htp` preserves the session; then
   `pi mcp logout htp` deletes the isolated credentials and
   `htp_connection_status` returns `signed_out`.

6. **Expiry**: `htp_connection_status` reports `expired: true` when the stored
   access token is past `expiresAt`; Pi refreshes automatically on the next
   call. A refresh failure must surface as an auth error, not as zero data.

## Evidence to record

Record the exact Pi version, package head SHA, isolated directory path, the
commands run, the observed `state`/tool names, and the owner/non-owner outcomes.
Never record token or identity values. Then update
`coordination/tasks/wave1-pi-host.md` and request exact-head reviews.
