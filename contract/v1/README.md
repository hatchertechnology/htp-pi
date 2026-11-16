# Plugin contract v1 — Pi projection (Wave 0)

Offline, bounded contract files for the Pi host integration of HTP and SEOsmith.
The canonical fixtures, operations inventory and validator are **pinned** from
HTP #34 (lead t11); this directory holds only the Pi host profile and its
projection over the canonical operations. Nothing here runs a live adapter,
calls a backend, or installs a package.

## Layout

| Path | Kind | Purpose |
| --- | --- | --- |
| `host.json` | Pi profile | Pi version, package status, transports, auth, distribution, sources, gates, `readiness`, `provenance`. |
| `operations.json` | Pi projection | The 25 canonical operations copied verbatim (id/binding/effect/transport/backend/gate) with Pi `hostCapability`, `hostSupport` and `adapter`. |
| `../vendor/plugin-contract/v1/capabilities.json` | pinned canonical | 25 exact canonical operations. |
| `../vendor/plugin-contract/v1/conformance.json` | pinned canonical | `contractVersion 1.0.0`, 38 normalized scenarios. |
| `../vendor/plugin-contract/v1/skills.lock.json` | pinned canonical | HTP shared-skill hashes (parity check **not** implemented on the Pi side). |
| `../vendor/plugin-contract/v1/hosts/pi.json` | pinned canonical | Canonical Pi profile; local `host.json` is compared field-for-field to it. |
| `../vendor/plugin-contract/plugin-contract.mjs` | pinned canonical | Shared offline validator (`validateResults`, `validateObservation`). |
| `../vendor/plugin-contract/PIN.json` | pin record | Source repo/branch/PR/commit and sha256 of every pinned file. **Merged** against HTP PR #36 (`3db3e43`). |

## host.json

Canonical profile fields plus two local extras:

- Required: `host` (`"pi"`), `displayName`, `observedVersion`, `minimumVersion`
  (must be `null`), `packageStatus`, `transports` (`stdio`/`streamable-http`;
  `sse` rejected), `auth` (`method: "host-oauth"`, `login`, `logout`,
  `limitations[]`), `distribution` (`source`/`install`/`upgrade`/`rollback`),
  `sources` (https URLs), `gates[]`, `readiness` (`htp`, `seosmith`).
- Local extras: `provenance` (package name/version + docs used; **no absolute
  local paths**) and `readiness` (explicitly not yet satisfied).

## operations.json (Pi projection)

Three distinct fields, deliberately not conflated:

- `hostCapability` — `reachable` | `gated` | `unreachable`: raw transport
  reachability only. `reachable` for streamable HTTP MCP and for a CLI
  primitive Pi can invoke via `pi.exec`/`bash`; `gated` for a private-HTTP
  primitive that needs explicit private configuration; `unreachable` only when
  there is no transport and no local primitive. This is not a claim that an
  adapter exists, and a gated operation is never labelled incapable.
- `hostSupport` — `supported` | `gated` | `unsupported`: whether the Pi
  integration can currently **use** the operation. It is `gated` for every
  operation in Wave 0 because no adapter is implemented.
- `adapter` — `not-implemented` for every operation in Wave 0.

`id`, `binding`, `effect`, `backend`, `package`, `transport`,
`primitiveBinding` and `gate` are copied from the pinned `capabilities.json`.
`check-contract.mjs` rejects any divergence, any `hostSupport=supported` with a
non-implemented adapter, and any `hostCapability` inconsistent with the
transport/primitive reachability policy. It also compares the local `host.json`
profile fields to the pinned canonical Pi profile.

Two canonical facts matter:

- `htp.request_website_report` is provider report collection, **not** durable
  crawl scheduling; its scenario expects `source: "provider-collection"` and
  `status: "pending"`.
- `htp.inspect_website_url` is a present baseline tool (effect `read`); HTP #10
  enrichments are separate/gated.

## Checks

```sh
node scripts/check-contract.mjs      # PIN hashes + profile + projection vs canonical
node scripts/check-host-results.mjs  # shared validateResults (SELF-TEST by default)
node scripts/check-host-results.mjs --results produced.json
node scripts/probe-pi-capabilities.mjs
```

`check-host-results.mjs` without `--results` validates the fixtures' own
`expected` values. That is a **self-test** that the Pi files carry the canonical
contract shape — it is **not** Pi conformance evidence and not a live adapter
test. Pass `--results` (size-capped at 1 MiB) once an adapter produces
observations.

Historical v1 parity/limitations for Wave 0: no installable package, no adapter, no live HTP
OAuth, and **no shared-skill parity check** on the Pi side (the skill lock is
only vendored/hash-verified). The pin is **merged** against canonical HTP PR #36
commit `3db3e43`; all five vendored artifacts were copied verbatim from it and
their sha256 recorded.

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
