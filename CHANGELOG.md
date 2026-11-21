# Changelog

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
