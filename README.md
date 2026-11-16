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
- [`contract/v1/host.json`](contract/v1/host.json) — Pi host descriptor in the
  shared HTP #34 schema.
- [`contract/v1/operations.json`](contract/v1/operations.json) — Pi capability
  matrix for HTP and SEOsmith operations (all adapters `not-implemented`).
- [`contract/v1/conformance.json`](contract/v1/conformance.json) — bounded
  fixtures covering HTP and SEOsmith.
- [`scripts/check-contract.mjs`](scripts/check-contract.mjs) — offline validator.
- [`scripts/probe-pi-capabilities.mjs`](scripts/probe-pi-capabilities.mjs) —
  installed-runtime capability probe.

## Check

```sh
node scripts/check-contract.mjs
node scripts/probe-pi-capabilities.mjs
```

No network, no live adapter, no credentials.

## Scope

Canonical shared contract and fixtures are owned by
[HTP #34](https://github.com/hatchertechnology/htp/issues/34). SEOsmith bounded
operations are defined by
[seosmith #18](https://github.com/hatchertechnology/seosmith/issues/18).
Packaging, auth rollout and capability-gated updates are Wave 1+.

## License

MIT
