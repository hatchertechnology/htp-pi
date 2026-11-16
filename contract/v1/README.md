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
| `operations.json` | Pi projection | The 25 canonical operations copied verbatim (id/binding/effect/transport/backend/gate) with Pi `hostSupport` and `adapter: not-implemented`. |
| `../vendor/plugin-contract/v1/capabilities.json` | pinned canonical | 25 exact canonical operations. |
| `../vendor/plugin-contract/v1/conformance.json` | pinned canonical | `contractVersion 1.0.0`, 31 normalized scenarios. |
| `../vendor/plugin-contract/v1/skills.lock.json` | pinned canonical | HTP shared-skill hashes. |
| `../vendor/plugin-contract/plugin-contract.mjs` | pinned canonical | Shared offline validator (`validateResults`, `validateObservation`). |
| `../vendor/plugin-contract/PIN.json` | pin record | Source repo/branch, committed head (HTP PR #36) and sha256 of every pinned file. |

## host.json

Canonical profile fields plus two local extras:

- Required: `host` (`"pi"`), `displayName`, `observedVersion`, `minimumVersion`
  (must be `null`), `packageStatus`, `transports` (`stdio`/`streamable-http`;
  `sse` rejected), `auth` (`method: "host-oauth"`, `login`, `logout`,
  `limitations[]`), `distribution` (`source`/`install`/`upgrade`/`rollback`),
  `sources` (https URLs), `gates[]`, `readiness` (`htp`, `seosmith`).
- Local extras: `provenance` (pinned install path, package version, docs used)
  and `readiness` (explicitly not yet satisfied).

## operations.json (Pi projection)

`id`, `binding`, `effect`, `backend`, `package`, `transport`, `gate` are copied
from the pinned `capabilities.json` and must match it exactly. `hostSupport`
(`supported` | `gated`) records whether Pi can reach the transport, and
`adapter` is `not-implemented` throughout Wave 0. Two canonical facts matter:

- `htp.request_website_report` is provider report collection, **not** durable
  crawl scheduling; its scenario expects `source: "provider-collection"` and
  `status: "pending"`.
- `htp.inspect_website_url` is a present baseline tool (effect `write`); HTP #10
  enrichments are separate/gated.

## Checks

```sh
node scripts/check-contract.mjs      # PIN hashes + profile + projection vs canonical
node scripts/check-host-results.mjs  # shared validateResults over the 31 scenarios
node scripts/check-host-results.mjs --results produced.json
node scripts/probe-pi-capabilities.mjs
```

`check-host-results.mjs` without `--results` builds the Pi envelope from each
scenario's documented `expected` value. That is a **profile projection**
conformance run (it proves the Pi host files carry the canonical contract), not
a live adapter test. Pass `--results` once an adapter produces observations.
