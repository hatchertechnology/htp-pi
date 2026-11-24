# htp-pi

Pi package for **HTP** and **SEOsmith** operations.

This branch implements the Wave 1 host package for
[htp-pi #1](https://github.com/hatchertechnology/htp-pi/issues/1): an installable
Pi package with an HTP MCP binding and a standalone SEOsmith local-operations
binding. It keeps the pinned Wave 0 contract evidence under `contract/v1` and
adds the Wave 1 binding state under `contract/wave1`.

## Install

```sh
pi install ./htp-pi                                   # local checkout
pi install git:github.com/hatchertechnology/htp-pi    # git
pi list
pi update --extensions
pi remove git:github.com/hatchertechnology/htp-pi
```

Tested against Pi 1.6.0. See [`docs/package.md`](docs/package.md) for
distribution, upgrade/rollback, configuration and skill synchronization.

## What ships

- [`extensions/htp-pi/index.ts`](extensions/htp-pi/index.ts) — registers the
  `htp` streamable-HTTP MCP server and the SEOsmith local operations tools.
- [`extensions/htp-pi/lib/`](extensions/htp-pi/lib) — the pure, testable
  adapter, capability and connection modules.
- [`skills/`](skills) — `htp-connection`, `seo-review`, `website-management`,
  `repository-settings` and `seosmith-operations`.
- [`contract/wave1/`](contract/wave1) — the Wave 1 host profile, resolved
  operation bindings and overrides.
- [`docs/pi-host-compatibility.md`](docs/pi-host-compatibility.md) — verified Pi
  extension/MCP/OAuth/CLI capabilities, limitations and gates.

## HTP binding

The extension registers the HTP MCP endpoint; Pi's built-in MCP support
discovers the canonical `mcp__htp__*` tools and owns OAuth 2.1 + PKCE:

- Sign in: `pi mcp login htp`
- Reconnect: `/mcp reconnect htp`
- Sign out: `pi mcp logout htp`
- Inspect: `/mcp`, `pi mcp list`, or the `htp_connection_status` tool

Tokens stay in Pi's credential store; the package never reads, prints or
forwards them. Denied access stays denied.

## SEOsmith binding

The extension binds the SEOsmith #18 local `operations` CLI through `pi.exec`
argv arrays (no shell). Standalone use needs no HTP account:

- `seosmith_capabilities` — discover and verify `adapter_version == 1`
- `seosmith_start` / `seosmith_status` / `seosmith_cancel`
- `seosmith_report` / `seosmith_export`

Set `HTP_PI_SEOSMITH_BIN` (or `SEOSMITH_BIN`) to a trusted absolute executable.
See the `seosmith-operations` skill for bounds, retries, cancellation and export
semantics.

## Capability gates

`contract/wave1/operations.json` records all 25 canonical operations with a
truthful `adapter`/`hostSupport` state. HTP present MCP tools are
`mcp-passthrough`; the five SEOsmith lifecycle operations are `local-cli`;
feature-flagged and backend-gated work stays gated. `htp_pi_capabilities`
returns a complementary runtime view: the canonical gated operations plus
additional non-canonical backend/verification gates (durable provider requests,
private-worker HTTP, staging, evidence v2). A skill never makes an operation
available.

## Check

```sh
npm test          # contract, package, unit and real-host smoke checks
npm run check     # offline contract/package checks
npm run smoke     # real Pi runtime + install lifecycle
npm run probe     # installed-runtime capability probe
```

- `scripts/host-smoke.mjs` loads the extension with the **installed Pi runtime**
  (jiti + the real `ExtensionAPI`) and invokes every advertised SEOsmith
  operation through a controlled fixture binary using the host's `pi.exec`
  primitive. It also verifies the `htp` MCP server registration.
- `scripts/check-install-lifecycle.mjs` runs install/list/update/remove against
  the real CLI in an isolated `PI_CODING_AGENT_DIR`.
- `scripts/check-host-results.mjs` without `--results` remains a **self-test**
  of the pinned canonical fixtures, not live conformance evidence.

## Historical Wave 0 evidence

The `contract/v1` projection, the provider 1.1 and audit export 1.2 trees, and
their pins remain unchanged. They are historical offline evidence: no network,
no live adapter. The Wave 1 binding above supersedes their
`adapter: not-implemented` state only for operations the package actually binds.

The additive audit read 1.3.0 tree is vendored separately under
`contract/audit-reads-1.3/` and pinned to the merged HTP PR #82 revision
`4e7dc94e4f92a30fb57e4061fa1f06d517157c63` (tree
`36a9456c6e2a819e7b4233ef0ae40b30a509efb8`). It is gated: the two reads are
`unsupported` when absent from `tools/list`, and return explicit
`availability:producer_unavailable` while the H15 producer gates are disabled,
never an empty success. `node scripts/check-audit-read-readiness.mjs` is offline
readiness only; no installed skill, host auth, backend or producer is exercised.

## License

MIT
