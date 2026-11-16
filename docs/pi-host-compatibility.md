# Pi host compatibility

Wave 0 host-compatibility documentation for the Pi integration of HTP and
SEOsmith. This document records **what the Pi host actually supports**, not
what the plugin will eventually ship. No adapter, package, skill or transport
binding for HTP/SEOsmith is implemented here. Host issue
[htp-pi #1](https://github.com/hatchertechnology/htp-pi/issues/1) remains open;
this is readiness evidence only.

Companion machine-readable files:

- [`../contract/v1/host.json`](../contract/v1/host.json) — Pi host profile
  (shared HTP #34 schema).
- [`../contract/v1/operations.json`](../contract/v1/operations.json) — Pi
  projection over the 25 canonical HTP and SEOsmith operations.
- [`../contract/vendor/plugin-contract/`](../contract/vendor/plugin-contract) —
  **pinned** canonical capabilities, fixtures (38 scenarios) and validator, with
  `PIN.json` sha256 hashes.
- [`../scripts/check-contract.mjs`](../scripts/check-contract.mjs) — PIN hashes,
  Pi profile and projection vs canonical.
- [`../scripts/check-host-results.mjs`](../scripts/check-host-results.mjs) — runs
  the shared `validateResults` for host `pi` (accepts `--results`).
- [`../scripts/probe-pi-capabilities.mjs`](../scripts/probe-pi-capabilities.mjs)
  — re-runs the installed-runtime checks used below.

## Verification basis

Verified 2026-11-16 against:

| Source | Detail |
| --- | --- |
| Installed runtime | `pi --version` → `1.5.2` |
| Runtime help | `pi --help`, `pi mcp --help`, `pi auth --help`, `pi install --help` |
| Official docs | `mcp.md`, `extensions.md`, `packages.md`, `skills.md`, `cli.md`, `security.md`, `environment-variables.md` from the installed `@earendil-works/pi-coding-agent` package |

Re-run the runtime portion at any time:

```sh
node scripts/probe-pi-capabilities.mjs
```

Claims below cite the installed documentation, not pre-trained knowledge. Where
an official source and local behavior could differ, the probe is the record.

## 1. Supported host version

- Tested host: **Pi 1.5.2**.
- No minimum version is asserted beyond the tested build. The mechanisms used
  here (MCP OAuth login, `pi mcp add --oauth-client-registration`, package
  skills, the extension API) are present in 1.5.2. `host.json` records
  `minimumVersion: null` deliberately rather than guessing an older floor.
- Provider/model selection is host-owned; HTP/SEOsmith integrations must not
  assume a specific Pi model.

## 2. Distribution mechanism (planned, not shipped in Wave 0)

Pi distributes integrations as **Pi packages**: an ordinary directory or npm/git
package exposing `extensions/`, `skills/`, `prompts/`, `themes/`, or explicit
paths under the `pi` key of `package.json` (`packages.md`).

- Install: `pi install git:github.com/hatchertechnology/htp-pi`
- Upgrade: `pi update git:github.com/hatchertechnology/htp-pi`
- Remove: `pi remove git:github.com/hatchertechnology/htp-pi`
- List: `pi list`

Package resources are versioned as one unit, and a package that fails to install
is skipped with a warning rather than breaking startup. No `pi` manifest and no
installable package are added in Wave 0, so these commands are documented paths,
not a current capability. Packaging is Wave 1 scope under htp-pi #1.

## 3. Extension mechanism (supported)

Pi loads TypeScript/JavaScript extensions that export a default factory receiving
`ExtensionAPI`, via `jiti` (no build step) — see `extensions.md`.

Relevant, host-supported integration points for a future adapter:

| Capability | API | Documented in |
| --- | --- | --- |
| Register tools | `pi.registerTool({...})` | `extensions.md` |
| Register MCP servers at runtime | `pi.registerMcpServer(name, config)` | `extensions.md`, `mcp.md` |
| Observe/gate tool calls | `pi.on("tool_call" / "tool_result")`, `annotations` hints | `extensions.md` |
| Run bounded child processes | `pi.exec(command, args, options?)` | `extensions.md` |
| React to startup | `pi.on("session_start" / "resources_discover")` | `extensions.md` |
| Custom UI/confirmations | `ctx.ui.*` | `extensions.md` |

Extensions run with the user's full system permissions (`security.md`). Only
trusted sources should be installed.

## 4. MCP transport (supported)

Pi's built-in MCP support connects to **stdio** and **streamable HTTP** servers
(`mcp.md`).

- Streamable HTTP entry: `{ "url": "https://…" }` (optionally `headers`).
- Stdio entry: `{ "command": "…", "args": […], "env": {…}, "cwd": "…" }`.
- **Legacy SSE is rejected.** Servers that document SSE usually also expose
  streamable HTTP at `/mcp`.
- Tools are named `mcp__<server>__<tool>`; non-alphanumeric characters become `_`.
- Default tool exposure is `codemode`; `deferred`, `direct`, and `hidden` are
  also available. `codemode` and `deferred` tools are reached through the
  `codemode` tool / `tool_search`, not declared directly to the model.
- HTTP transient errors (408/429/5xx) are retried twice. Tool calls themselves
  are **not** retried, because the server may already have performed them.
- Tool calls pass through Pi's permission pipeline, including extension
  `tool_call` gates.

Pi's HTP MCP endpoint is a streamable HTTP URL, so it is a supported transport:

```jsonc
// ~/.pi/agent/mcp.json
{ "mcpServers": { "htp": { "url": "https://htp-api-kerry-hatcher.fly.dev/mcp/secured" } } }
```

Runtime registration is also available through `pi.registerMcpServer(...)`.
Shell-level `pi mcp …` commands do **not** load extensions.

## 5. Authentication and OAuth (supported)

Pi supports **MCP OAuth 2.1 with PKCE** for HTTP servers without an
`Authorization` header (`mcp.md`).

- Discovery via RFC 9728 protected-resource metadata and RFC 8414 auth-server
  metadata.
- Client identity: Client ID Metadata Document (pi.dev) when supported, else
  dynamic client registration; `auto` (default), `cimd`, or `dcr` selectable via
  `oauth.clientRegistration` / `--oauth-client-registration`.
- Tokens stored in `~/.pi/agent/mcp-auth.json`; refresh is automatic.
- Commands: `pi mcp login <server>`, `pi mcp logout <server>`,
  `pi mcp list`. Sign-in opens a browser; over SSH/headless the redirected URL
  can be pasted into the terminal.
- Credentials are keyed by server name **and** URL; `logout` deletes them.

The current HTP endpoint advertises OAuth through Supabase Auth (see the HTP
`docs/mcp-seo.md`); this matches Pi's supported flow. Confirming a live
HTP↔Pi sign-in is Wave 1 work and is **not** claimed here.

## 6. Credentials and secrets policy (supported)

- No secrets in the package, prompts, logs, or scan evidence.
- `mcp.json` `env`/`headers` accept environment substitution `${NAME}` or a
  whole-value `!command`, never a literal committed secret.
- `pi auth login|logout|check|print-api-key|print-bearer-token` manage model-
  provider credentials in `~/.pi/agent/auth.json` (`cli.md`). Credential-printing
  commands write secrets to stdout and must not be logged.
- Project `.pi/mcp.json` is read only in trusted projects (`security.md`).

## 7. CLI / standalone SEOsmith path (host-supported; adapter not implemented)

Pi's `bash` tool runs shell commands with session context variables
`PI_SESSION_ID`, `PI_SESSION_FILE`, `PI_PROVIDER`, `PI_MODEL`,
`PI_REASONING_LEVEL` (`environment-variables.md`), and process markers
`AI_AGENT=pi`, `PI_CODING_AGENT=true`.

An extension can also run a bounded child process with `pi.exec(argv)` without a
shell. This is the host-supported way to reach a local SEOsmith CLI for
standalone audits. Argument arrays and explicit paths avoid shell interpolation,
matching the SEOsmith adapter contract completed in seosmith #18. The Pi
host adapter itself is **not** implemented.

## 8. Skills (supported)

Pi implements the Agent Skills specification (`skills.md`): a directory with
`SKILL.md`, frontmatter `name`/`description`, and optional
`references/`, `scripts/`, `assets/`. Skills are advertised by name and
description and loaded on demand. Pi also discovers `~/.agents/skills/` and
`.agents/skills/`.

Skills carry **instructions**, not capabilities. A skill mentioning an operation
does not make that operation available; feature gates remain authoritative.

## 9. Capability matrix summary

Full detail is in `contract/v1/operations.json`. Wave 0 status:

- **Host-supported transports/auth/mechanisms:** streamable HTTP MCP, stdio MCP,
  MCP OAuth 2.1 (DCR + CIMD), package distribution, extension API, skills,
  bounded `pi.exec`/`bash`.
- **Host capability vs implemented adapter (distinct):** every HTP and
  SEOsmith operation is `hostSupport: "gated"` with `adapter:
  "not-implemented"`; nothing implies an operation works. `hostCapability`
  separately records raw transport reachability: `reachable` (streamable HTTP
  MCP, or a CLI primitive via `pi.exec`/`bash`), `gated` (a private-HTTP
  primitive that needs explicit private configuration), `unreachable` (no
  transport and no local primitive). A gated operation is never labelled
  incapable. Only when an adapter is implemented may an operation become
  `hostSupport: "supported"`.
- **HTP baseline vs gated:** `inspect_website_url` is an existing baseline
  surface (not gated); HTP #10 search/inspection *enrichments* are separate and
  gated. `request_website_report` is provider report collection, **not** durable
  crawl scheduling, and carries **no** idempotency guarantee.
- **Gated (backend not yet delivered):** HTP #10 search enrichments, evidence
  lifecycle (#6/#8/#9/#20), orchestration (#7), forms (#1); SEOsmith
  private-worker dispatch, CI baselines (S16/H13), staging profiles (S13).
- **Unsupported on Pi:** legacy SSE MCP transport; OpenAI/ChatGPT managed App
  dependency and plugin-store semantics (those are Claude/ChatGPT packaging
  concepts, not Pi mechanisms).

## 10. Differences from other hosts (do not assume parity)

- Claude Code consumes a plugin marketplace + `.mcp.json`; Codex uses its own
  plugin/managed-App model; Pi uses Pi packages + `mcp.json`/extension
  registration. The three are **not** interchangeable.
- Pi's default MCP exposure is `codemode`; a small set of high-frequency tools
  may warrant `direct` exposure, but that is a Wave 1 packaging decision.
- Pi rejects the legacy SSE transport that some MCP servers still document.

## 11. Open items

- htp-pi #1 remains **open**; no install/auth/operation acceptance criteria are
  satisfied by this Wave 0 change.
- Live HTP OAuth sign-in from Pi, the Pi SEOsmith host adapter and its live acceptance,
  and capability-gated updates are Wave 1+.
- Canonical shared fixtures/descriptor schema are owned by HTP #34 (lead t11);
  the files here mirror that schema for the Pi host and must be reconciled if the
  canonical schema changes.
- `contract/v1/operations.json` uses the canonical operation ids, copied
  field-by-field from the pinned capabilities; the local check enforces
  equality. The local host profile is likewise compared field-for-field against
  the pinned canonical Pi profile (`v1/hosts/pi.json`).
- The pin is **merged** against canonical HTP PR #36 commit
  `3db3e439ec0adc99211d49358a7cb8a29507a940`; all five vendored artifacts were
  copied verbatim from that merged commit and their sha256 recorded. The
  declared GitHub doc URLs may 404 (repo may be private); the installed package
  docs are authoritative (see `contract/v1/host.json` `provenance`).

## Current provider 1.1 readiness

The v1 projection and PR #36 pin above are historical 1.0.0 evidence. The
separate `contract/provider-request-1.1.lock.json` pins the nine canonical
artifacts from HTP PR #44 merge `e19875d0d6e74b5d990e45e456656c99dacc89d1`
and requires backend PR #45 merge `48485a55773b1ca97e165a4715d343704270266e`.
`node scripts/check-provider-request-readiness.mjs` verifies hashes, source skill
parity and synthetic semantic traces; `--provider-results results.json` accepts
Pi traces with measured contexts for all scenarios or synthetic contexts.
Vendored-source parity does not establish installed skill parity, authentication,
live host normalization, backend deployment, or lifecycle behavior. HTP and
Pi SEOsmith host-adapter live acceptance remains open; SEOsmith #18 is
fulfilled initial-adapter provenance. Host issue #1 remains open.
