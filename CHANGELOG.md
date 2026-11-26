# Changelog

## [1.1.0] - 2026-11-26

- Vendor the additive parity-read contract 1.4.0 under `contract/parity-reads-1.4/`
  with a lock pinning HTP main `09a0ba56c175e3e889bfa5a8eacff01666851e39` (tree
  `97ca939759757c7007f2babbccc4da51e4ee6b53`). The frozen v1.0.0/1.1.0/1.2.0/1.3.0
  bytes and pins are unchanged.
- Add the host-specific capability-gated `lifecycle-remediation` skill for the
  three 1.4 owner-scoped reads (`website_audit_lifecycle`, `website_url_lifecycle`,
  `website_remediation_list`), the six audit-event availability codes, and the
  web-only search/comparison reads that stay gated.
- Register the three 1.4 reads and the web-only search/comparison reads as gated
  in the runtime capability report; they are never advertised as available.
- Add `scripts/check-parity-read-readiness.mjs` (offline readiness, 23 synthetic
  scenarios, 8 canonical artifacts) plus its isolated-TMPDIR mutation tests, and
  `scripts/rehearse-release-pi.mjs` for the disposable-home install/upgrade/rollback
  rehearsal from the `baseline-pre-r5-46f6b81a` anchor.
- Record the tested host as **Pi 1.6.1** (`contract/wave1/host.json`
  `observedVersion`); `check-package.mjs` pins the record and the host smoke
  asserts it against the installed runtime that actually ran. The readiness
  checker now fails if a held read is advertised in an MCP or SEOsmith operation
  list, and the README carries the withdraw/supersede rollback summary.

## [1.0.0] - 2026-11-21

- Make `htp-pi` an installable Pi package with a `pi` manifest, extension and
  five skills.
- Register the `htp` streamable-HTTP MCP server; Pi owns OAuth. Add
  `htp_connection_status` and `htp_pi_capabilities`.
- Bind the SEOsmith #18 local operations CLI through `pi.exec` argv arrays:
  capabilities, explicit bounded start, status, cancel, exact report and export.
- Add truthful Wave 1 capability state (`contract/wave1/`) with backend and
  verification gates kept explicit.
- Add real-host smoke and install-lifecycle checks, plus unit tests for the
  adapter, connection and capability modules.
- Document distribution, upgrade/rollback, configuration and skill sync in
  `docs/package.md`.

## [0.0.0] - Wave 0

- Host-compatibility documentation and pinned canonical contract fixtures only.
  No installable package, adapter or live host behavior.
