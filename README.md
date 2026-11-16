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

## Check

```sh
npm test          # check-contract + check-host-results (self-test)
npm run probe     # installed-runtime capability probe
```

`check-host-results` without `--results` is a **self-test** of the pinned
fixtures' expected values: it proves the Pi files carry the canonical contract
shape, not that an adapter works. Pass `--results produced.json` for real
adapter observations. The pin in `contract/vendor/plugin-contract/PIN.json` is
**merged** against canonical HTP PR #36 (`3db3e43`), and the shared-skill parity
check is not implemented on the Pi side.

No network, no live adapter, no credentials.

## Scope

Canonical shared contract and fixtures are owned by
[HTP #34](https://github.com/hatchertechnology/htp/issues/34). SEOsmith bounded
operations are defined by
[seosmith #18](https://github.com/hatchertechnology/seosmith/issues/18).
Packaging, auth rollout and capability-gated updates are Wave 1+.

## License

MIT
