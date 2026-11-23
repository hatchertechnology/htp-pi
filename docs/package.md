# htp-pi package: install, upgrade, gates and skill sync

This package turns `htp-pi` into an installable Pi package. It adds one
extension (`extensions/htp-pi/index.ts`) and five skills (`skills/`). The
historical Wave 0 contract files under `contract/v1` remain pinned evidence; the
Wave 1 binding state lives in `contract/wave1/`.

## Supported host version

- Tested host: **Pi 1.6.0** (`pi --version`).
- `contract/wave1/host.json` records `observedVersion: "1.6.0"` and
  `minimumVersion: null`. No older floor is asserted: the mechanisms used here
  (`pi.registerTool`, `pi.registerMcpServer`, `pi.exec`, package `pi` manifest,
  MCP OAuth) are documented for the tested build and were re-verified with
  `node scripts/host-smoke.mjs`.
- Re-run `node scripts/probe-pi-capabilities.mjs` to check the CLI surface.

## Install, upgrade, rollback

```sh
# Local checkout (development)
pi install ./htp-pi

# Git
pi install git:github.com/hatchertechnology/htp-pi

pi list
pi update --extensions            # reconcile configured packages
pi remove git:github.com/hatchertechnology/htp-pi
```

- A package that fails to install is skipped with a warning; Pi keeps running.
- Pi pins a ref given as `<source>@<ref>` and does not move it on update. Before
  an upgrade, record the installed full commit so you can return to it. `pi list`
  prints the checkout path (under Pi's agent directory, `$PI_CODING_AGENT_DIR`
  or `~/.pi/agent` by default, or `.pi/git` for a `--local` install), so run
  `git -C <checkout path> rev-parse HEAD`.
  To roll back, `pi remove git:github.com/hatchertechnology/htp-pi` then
  `pi install git:github.com/hatchertechnology/htp-pi@<full-40-hex-sha>`.
  Tested example with the complete Wave 1 package (`1.0.0`, extension entry,
  five skills, 25 canonical operations):
  `pi install git:github.com/hatchertechnology/htp-pi@0a386f04b03087ab4c16834e64bdd5c362ec6618`.
  A full commit is immutable; a tag also works when it resolves. An earlier
  commit can predate the package's Wave 1 resources — `da0c262` is Wave 0
  `0.0.0` and exposes no extension or skills — so pin a reviewed release commit.
- `node scripts/check-install-lifecycle.mjs` runs install/list/update/remove
  against the real CLI in an isolated `PI_CODING_AGENT_DIR`; it never touches
  the user's settings.

## What the package binds

- **HTP** (`adapter: mcp-passthrough`): the extension registers the streamable
  HTTP `htp` MCP server. Pi's built-in MCP support discovers the canonical
  `mcp__htp__*` tools and owns OAuth (`pi mcp login htp`). The extension never
  reads or prints tokens. `htp_connection_status` reports the connection state
  and discovered tools.
- **SEOsmith** (`adapter: local-cli`): the extension binds the SEOsmith #18
  local `operations` CLI through `pi.exec` argv arrays (no shell). Tools:
  `seosmith_capabilities`, `seosmith_start`, `seosmith_status`,
  `seosmith_cancel`, `seosmith_report`, `seosmith_export`. No HTP account is
  required.

`contract/wave1/operations.json` resolves all 25 canonical operations with a
truthful `adapter`/`hostSupport` state; `scripts/check-wave1-contract.mjs`
rejects any `hostSupport: supported` without an implemented adapter and any
supported operation without host smoke coverage.

## Configuration

| Variable | Purpose |
| --- | --- |
| `HTP_PI_SEOSMITH_BIN` / `SEOSMITH_BIN` | Absolute path to the trusted SEOsmith executable (required for local operations). |
| `HTP_PI_MCP_URL` / `HTP_MCP_URL` | Override the HTP MCP endpoint. |
| `HTP_PI_DISABLE_MCP=1` | Do not register the `htp` MCP server. |
| `HTP_PI_MCP_AUTH_FILE` | Override Pi's `mcp-auth.json` path (status reads only). |

No credentials belong in the package, request files, argv or logs.

`node scripts/check-htp-fail-closed.mjs` verifies the real endpoint rejects
unauthenticated MCP access with an RFC 9728 protected-resource pointer and
scope, without using any credential. The isolated sign-in/read/denied/reconnect/
logout/expiry procedure is in
[`docs/oauth-verification.md`](oauth-verification.md).

## Feature gates (stay explicit)

Gated canonical operations are listed in `contract/wave1/operations.json`;
`htp_pi_capabilities` returns those plus additional non-canonical
backend/verification gates (a complementary runtime view):

- HTP Business Profile writes (feature flag).
- Durable provider requests, contract 1.1.0 (deployed backend + schema).
- Direct SEOsmith private-worker HTTP (explicit operator configuration).
- SEOsmith staging profiles (S13) and baseline CI (S16).
- Live HTP OAuth sign-in remains a release verification step (needs the
  synthetic owner's browser; procedure in `docs/oauth-verification.md`); the
  fail-closed transport baseline is verified by
  `scripts/check-htp-fail-closed.mjs`. The local SEOsmith path was additionally
  verified end to end
  against a locally built `seosmith` from `origin/main` with a bounded
  example.com crawl, and reported partial coverage truthfully. No crawl artifact
  or build output is committed.

## Skill synchronization

Skills live in `skills/` and are listed in `contract/wave1/host.json`. The
canonical HTP skills are consumed from HTP #34 / the audit export 1.2 tree and
carry a Pi host-adaptation note (`mcp__htp__` names, codemode exposure, the
connection tool). `seosmith-operations` and `htp-connection` are host-specific.

To update skills:

1. Re-vendor the canonical skill files from the merged HTP commit.
2. Re-apply the Pi host-adaptation notes.
3. Update `contract/wave1/host.json` `skills` if names change.
4. Run `node scripts/check-package.mjs` (frontmatter, uniqueness, manifest
   parity, no absolute paths) and `npm test`.

A skill only carries instructions. It never makes an operation available; the
capability contract and smoke tests are authoritative.
