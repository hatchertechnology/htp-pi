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
| `../vendor/plugin-contract/v1/conformance.json` | pinned canonical | `contractVersion 1.0.0`, 31 normalized scenarios. |
| `../vendor/plugin-contract/v1/skills.lock.json` | pinned canonical | HTP shared-skill hashes (parity check **not** implemented on the Pi side). |
| `../vendor/plugin-contract/plugin-contract.mjs` | pinned canonical | Shared offline validator (`validateResults`, `validateObservation`). |
| `../vendor/plugin-contract/PIN.json` | pin record | Source repo/branch/PR/commit and sha256 of every pinned file. **Provisional** until HTP PR #36 merges. |

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

- `hostCapability` — `reachable` | `unreachable`: whether Pi can reach the
  operation's transport at all (CLI via `pi.exec`/`bash`, MCP via streamable
  HTTP, private HTTP via an extension). This is not a claim that an adapter
  exists.
- `hostSupport` — `supported` | `gated` | `unsupported`: whether the Pi
  integration can currently **use** the operation. It is `gated` for every
  operation in Wave 0 because no adapter is implemented.
- `adapter` — `not-implemented` for every operation in Wave 0.

`id`, `binding`, `effect`, `backend`, `package`, `transport` and `gate` are
copied from the pinned `capabilities.json`. `check-contract.mjs` rejects any
divergence, any `hostSupported=supported` with a non-implemented adapter, or any
`hostCapability` inconsistent with the transport.

Two canonical facts matter:

- `htp.request_website_report` is provider report collection, **not** durable
  crawl scheduling; its scenario expects `source: "provider-collection"` and
  `status: "pending"`.
- `htp.inspect_website_url` is a present baseline tool (effect `write`); HTP #10
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

Parity/limitations for Wave 0: no installable package, no adapter, no live HTP
OAuth, and **no shared-skill parity check** on the Pi side (the skill lock is
only vendored/hash-verified). The pin is provisional until HTP PR #36 merges.
