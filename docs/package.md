# htp-pi package: install, upgrade, gates and skill sync

This package turns `htp-pi` into an installable Pi package. It adds one
extension (`extensions/htp-pi/index.ts`) and six skills (`skills/`, including the
host-specific `lifecycle-remediation`). The historical Wave 0 contract files
under `contract/v1` remain pinned evidence; the Wave 1 binding state lives in
`contract/wave1/`, and the additive parity-read profile 1.4.0 is vendored under
`contract/parity-reads-1.4/`.

## Supported host version

- Tested host: **Pi 1.6.1** (`pi --version`).
- `contract/wave1/host.json` records `observedVersion: "1.6.1"` and
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
  prints the checkout path Pi uses (user installs live under its agent directory,
  `$PI_CODING_AGENT_DIR` or `~/.pi/agent` by default), so run
  `git -C <checkout path> rev-parse HEAD`.
- **Global (owner) install** — roll back with
  `pi remove git:github.com/hatchertechnology/htp-pi` then
  `pi install git:github.com/hatchertechnology/htp-pi@<full-40-hex-sha>`.
- **Project-local install** (`--local`) — the project package is read only after
  trust is granted, and only `--local` remove/install address it. In an untrusted
  project, list it with `pi list --approve` (a trusted project can use plain
  `pi list`). `pi update <source>` is not project-scoped: Pi reconciles the
  source in every configured scope, so a same-source global install is moved
  too. To roll back only the project package, use the deterministic local path
  from the same project:
  `pi remove git:github.com/hatchertechnology/htp-pi --local --approve` then
  `pi install git:github.com/hatchertechnology/htp-pi@<full-40-hex-sha> --local --approve`.
  `--approve` trusts the project for that invocation only; without `--local`,
  remove and install target the owner (global) package instead.
- Tested resolvable pin with the complete Wave 1 package (`1.0.0`, extension
  entry, five skills, 25 canonical operations):
  `pi install git:github.com/hatchertechnology/htp-pi@0a386f04b03087ab4c16834e64bdd5c362ec6618`
  (add `--local --approve` for a project-local install). A full commit is
  immutable; a tag also works when it resolves. An earlier commit can predate the
  package's Wave 1 resources — `da0c262` is Wave 0 `0.0.0` and exposes no
  extension or skills — so pin a reviewed release commit.
- `node scripts/check-install-lifecycle.mjs` runs install/list/update/remove
  against the real CLI in an isolated `PI_CODING_AGENT_DIR`; it never touches
  the user's settings.
- `node scripts/rehearse-release-pi.mjs --target <full-40-hex-sha>` rehearses
  the release lifecycle in a disposable home from the Wave 1 R5 anchor
  `baseline-pre-r5-46f6b81a` (commit `46f6b81a90c50a97c5f6c3b73a3eed67a7ee9b39`):
  install the anchor, verify the installed tree, upgrade to the target, roll
  back to the anchor, roll forward, uninstall. Every child process runs with
  `HOME`/`PI_CODING_AGENT_DIR` inside the disposable root and the run writes no
  file content to the owner's `~/.pi/agent`; it reads and executes only the
  installed Pi runtime from `~/.pi/agent/install/releases` (a read-only module
  load). The `pi` CLI is a managed install and creates and removes its own
  `<install>/update.lock` on each invocation, which bumps the `install/`
  directory mtime without leaving an entry, so the rehearsal asserts the durable
  record — no top-level entry under the owner's agent directory or `install/`
  added, removed or resized, no lock left behind, `settings.json` byte-identical
  — and reports mtime changes. It creates no tags and contacts no network (a
  local bare mirror is reached through a throwaway `insteadOf` mapping).

### Withdraw / supersede rollback (no owner install)

There is no owner install of this package in `~/.pi/agent/settings.json`
(`packages` holds unrelated sources). The Wave 1 R5 rollback for this host is
therefore **not** an installed-package revert:

1. **Withdraw the release** — if the release tag must not resolve, delete the
   release tag on the remote (R5 step) or repoint the documented pin. Anyone who
   installed by the tag's source can no longer resolve it and keeps the last
   working checkout.
2. **Mark the release superseded** — record the replacement commit in the
   release notes; a pinned full commit stays resolvable, so an installed
   checkout keeps working until the owner updates it.
3. **Anchor stays the reference** — `baseline-pre-r5-46f6b81a` (commit
   `46f6b81a90c50a97c5f6c3b73a3eed67a7ee9b39`) remains the last good reference
   commit of the `1.0.0` package. Anyone who installed a pinned commit can
   return to it with the documented
   `pi install git:github.com/hatchertechnology/htp-pi@<full-40-hex-sha>`.

No install exists to revert in place, so the rehearsal above is the only
behavioral evidence of the rollback path.

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

SEOsmith's own `status` response does not include `cancellation_terminal`; only
`cancel` adds it. The package therefore derives a single boolean on `start`,
`status` and `cancel`: true only when SEOsmith reports `state=cancelled`,
`execution_state=terminal` and `worker_active=false`. An adapter-provided value
is preserved, and a missing lock (`worker_active=null`) or incomplete shape is
false. Polling `seosmith_status` for that field is therefore a valid way to
observe terminal cancellation; a completion that wins the race stays a
completed audit with its report.

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
- Audit events and episodes (contract 1.3.0) and the parity reads 1.4.0
  (`website_audit_lifecycle`, `website_url_lifecycle`, `website_remediation_list`):
  gated by tool discovery and their own rollout flags; absence is `unsupported`,
  a held read is `unavailable` (503), never an empty history or work queue.
- Search evidence and independent-audit comparison reads: served by the web
  dashboard and REST API, not MCP tools on the deployed host; never fetched
  outside the web workflow.
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
connection tool). `seosmith-operations`, `htp-connection` and
`lifecycle-remediation` (profile 1.4.0) are host-specific.

To update skills:

1. Re-vendor the canonical skill files from the merged HTP commit.
2. Re-apply the Pi host-adaptation notes.
3. Update `contract/wave1/host.json` `skills` if names change.
4. Run `node scripts/check-package.mjs` (frontmatter, uniqueness, manifest
   parity, no absolute paths) and `npm test`.

A skill only carries instructions. It never makes an operation available; the
capability contract and smoke tests are authoritative.
