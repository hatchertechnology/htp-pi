# Plugin contract v1 — Pi projection (Wave 0)

Bounded, offline contract files for the Pi host integration of HTP and SEOsmith.
They mirror the canonical schema owned by
[HTP #34](https://github.com/hatchertechnology/htp/issues/34) (lead t11).
Nothing here runs a live adapter, calls a backend, or installs a package.

## Files

| File | Canonical? | Purpose |
| --- | --- | --- |
| `host.json` | yes (schema) | Pi host descriptor: version, package status, transports, auth, distribution, sources, gates. |
| `operations.json` | no (Pi projection) | Pi capability matrix for HTP and SEOsmith operations. Every `adapter` is `not-implemented` in Wave 0. |
| `conformance.json` | yes (schema) | `contractVersion` `1.0.0`; bounded normalized observations for both services. |

## host.json

Canonical fields:

- `host` (`"pi"`), `displayName`, `observedVersion`, `minimumVersion` (nullable).
- `packageStatus`: `not-implemented` | `fixture-defined` | `implemented`.
- `transports`: array of `stdio` and/or `streamable-http`. `sse` is rejected.
- `auth`: `{ method: "host-oauth", login, logout, limitations[] }`.
- `distribution`: `{ source, install, upgrade, rollback }`.
- `sources`: array of official `https://` URLs.
- `gates`: array of blocking issue strings.
- `provenance` (extra, Pi-local): pinned install path, package version and docs
  used, because the declared GitHub repo may be private.

## operations.json (Pi projection)

Each operation records `id`, `service` (`htp`|`seosmith`), `access`
(`read`|`write`), `transport` (`mcp`|`cli`|`extension`), `hostSupport`,
`adapter`, `authorization`, `htpDependent`, `canonicalId`, `canonicalTool`,
`versionGate`, `notes`.

**`id` values are host proposals**, not the canonical shared operation ids.
`canonicalId` (SEOsmith) and `canonicalTool` (HTP MCP tool) carry the contract
lead's exact mapping where supplied; `null` means pending the canonical file.
They will be aligned once t11's shared file lands.

`hostSupport` describes what the host can reach. `adapter` describes what this
repository actually implements — `not-implemented` throughout Wave 0. A
`versionGate` marks a backend feature that is not yet delivered. Note two
corrections from the contract lead: `request_website_report` is **provider
report collection, not durable crawl scheduling** and carries no idempotency
guarantee; `inspect_website_url` is an existing baseline surface with HTP #10
enrichments tracked separately.

## conformance.json

```json
{
  "contractVersion": "1.0.0",
  "host": "pi",
  "kind": "fixture",
  "live": false,
  "scenarios": [
    { "id": "...", "operation": "...", "context": { ... }, "expected": { ... } }
  ]
}
```

Invariants enforced by `scripts/check-contract.mjs`:

- `contractVersion` is `1.0.0`; `kind` is `fixture`; `live` is `false`.
- Every scenario references an operation in `operations.json`.
- `expected.status` is one of `ok`, `denied`, `unauthorized`, `unavailable`,
  `partial`, `invalid`, `error`.
- Every HTP `read` scenario asserts `jobCreated: false` (reads never start
  collection).
- A successful `seosmith.audit.start` asserts `bounded: true`.
- All `requiredScenarios` are present and both `htp.` and `seosmith.` are
  covered.

## Validate

```sh
node scripts/check-contract.mjs   # offline shape/coverage check
node scripts/probe-pi-capabilities.mjs   # installed-runtime capability probe
```
