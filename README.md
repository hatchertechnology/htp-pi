# htp-pi

HTP plugin for the [Pi](https://pi.dev) coding agent harness.

**Wave 0 status:** host-compatibility documentation and bounded contract
fixtures only. This repository does **not** yet contain an installable Pi
package, adapter, or skills. Host issue
[htp-pi #1](https://github.com/hatchertechnology/htp-pi/issues/1) remains
**open**; no install/auth/operation acceptance criteria are satisfied here.

## Contents

- [`docs/pi-host-compatibility.md`](docs/pi-host-compatibility.md) — verified Pi
  1.5.2 extension/MCP/OAuth/CLI capabilities, limitations and gates.
- [`contract/v1/host.json`](contract/v1/host.json) — Pi host profile in the
  shared HTP #34 schema.
- [`contract/v1/operations.json`](contract/v1/operations.json) — Pi projection
  over the 25 canonical HTP and SEOsmith operations; all adapters
  `not-implemented`.
- [`contract/vendor/plugin-contract/`](contract/vendor/plugin-contract) —
  **pinned** canonical capabilities, 38 normalized fixtures, canonical Pi
  profile and the shared validator, with sha256 hashes in `PIN.json`.
- [`scripts/check-contract.mjs`](scripts/check-contract.mjs) — PIN, profile and
  projection validator.
- [`scripts/check-host-results.mjs`](scripts/check-host-results.mjs) — shared
  normalized-observation check for host `pi`.
- [`scripts/probe-pi-capabilities.mjs`](scripts/probe-pi-capabilities.mjs) —
  installed-runtime capability probe.
- [`contract/audit-export-1.2/`](contract/audit-export-1.2) with
  [`contract/audit-export-1.2.lock.json`](contract/audit-export-1.2.lock.json) —
  **pinned** canonical audit export-v1 profile, conformance scenarios,
  semantic validator and the four current shared skill/reference files, with a
  sha256 lock and a Pi host wrapper/negative-test suite.
- [`scripts/check-audit-export-readiness.mjs`](scripts/check-audit-export-readiness.mjs)
  — Pi audit export 1.2 pin/hash, source-skill parity and semantic checks.

The separate [provider 1.1 readiness tree](contract/provider-request-1.1.lock.json)
pins HTP PR #44 merge `e19875d0d6e74b5d990e45e456656c99dacc89d1`
and backend PR #45 merge `48485a55773b1ca97e165a4715d343704270266e`.
Its nine vendored files and semantic traces are checked offline. This establishes
vendored-source parity only, not installed skills or live host behavior. HTP
and Pi SEOsmith host-adapter live acceptance remain open. SEOsmith #18
completed the initial adapter contract and is fulfilled provenance.

The separate [audit export 1.2 readiness tree](contract/audit-export-1.2.lock.json)
pins HTP PR #48 merge `6c065c8327970b0773ba90f163f99a6e56e1e204`, which defines
the versioned audit export-v1 profile (`1.2.0`). Its twelve vendored canonical
artifacts (profile, conformance, source lock, semantic validator/fixtures,
standalone checker and four shared skill/reference files) are hash-checked, and
`--export-results` accepts Pi host observations with synthetic or measured
labels. Backend export deployment, endpoint/cgroup acceptance, host packaging,
OAuth and runtime behavior are **not** established here. This supersedes no
historical v1 or 1.1 pin.

## Check

```sh
npm test          # historical checks plus 1.1/1.2 readiness and negative tests
npm run probe     # installed-runtime capability probe
```

`check-host-results` without `--results` is a **self-test** of the pinned
fixtures' expected values: it proves the Pi files carry the canonical contract
shape, not that an adapter works. Pass `--results produced.json` for real
adapter observations. The pin in `contract/vendor/plugin-contract/PIN.json` is
**merged** against canonical HTP PR #36 (`3db3e43`), and the historical v1 skill lock does not establish installed-skill parity.

No network, no live adapter, no credentials.

## Scope

Canonical shared contract and fixtures are owned by
[HTP #34](https://github.com/hatchertechnology/htp/issues/34). SEOsmith bounded
operations are defined by
[seosmith #18](https://github.com/hatchertechnology/seosmith/issues/18).
Packaging, auth rollout and capability-gated updates are Wave 1+.

## License

MIT

For measured provider traces, run `node scripts/check-provider-request-readiness.mjs --provider-results results.json`. Every trace must include context; omitted context selects synthetic fixture context. Evidence provenance and live support require independent verification.

For measured audit export traces, run `node scripts/check-audit-export-readiness.mjs --export-results results.json`. Results must target host `pi`; all 19 scenarios or synthetic fixture context are required. Evidence provenance, side effects and live export support remain independent acceptance obligations.
