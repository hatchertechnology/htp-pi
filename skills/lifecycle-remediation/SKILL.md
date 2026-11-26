---
name: lifecycle-remediation
description: Use when the user wants to know how a technical SEO finding changed across saved audits (lifecycle history), what remediation work is saved for a finding, or the producer availability of stored audit events and operational episodes. Capability-gated by tool discovery; read-only.
---

# Lifecycle, remediation and event availability (profile 1.4.0)

> **Pi host adaptation.** HTP tools are exposed as `mcp__htp__<tool>` through
> Pi's built-in MCP support with codemode exposure. Check `htp_connection_status`
> first for sign-in state and discovered tools; use `pi mcp login htp` /
> `pi mcp logout htp` and `/mcp reconnect htp` for the OAuth lifecycle. Tokens
> stay in Pi's credential store and are never read, printed or forwarded.

This skill is host-specific and is not part of the shared pinned skill set. It
covers contract profile 1.4.0: three owner-scoped stored reads and the extended
`availability` codes of the 1.3 audit reads. It adds no write path. Saving
remediation work and recording verification attempts stay web-only. Every call
here reads stored data only: it never starts a crawl, provider collection,
event processing or any write.

## 1. Discover first, never assume

Discover tools and input schemas at connection time. `htp_connection_status`
lists the discovered `mcp__htp__*` names; the canonical binding names are:

| Tool | Purpose | Inputs |
| --- | --- | --- |
| `website_audit_lifecycle` | One rule on one entity across saved audits | `website_id`, `entity_id`, `rule`, optional `limit` 1–100 (default 50), paired `before` + `before_id` |
| `website_url_lifecycle` | One entity across saved audits | `website_id`, `entity_id`, optional `limit`, paired `before` + `before_id` |
| `website_remediation_list` | The saved remediation work queue entry for one finding | `website_id`, `delivery_id`, `finding_index` ≥ 0, optional paired `before` + `before_id` |

- A tool that is **not listed** is `unsupported`. Say the feature is unavailable
  on this connection. Never substitute another operation, never answer from
  `website_audit_detail` or `website_audit_history`, and never report an empty
  history or a zero count.
- A listed tool is not proof the feature is enabled. Each read is held by its
  own rollout flag (`HTP_ROLLOUT_LIFECYCLE`, `HTP_ROLLOUT_REMEDIATION`).
- Take `entity_id`, `rule`, `delivery_id` and `finding_index` from an audit the
  user owns; `finding_index` indexes into that audit's findings. Do not invent
  them.

## 2. Paging

Follow `next_cursor` with **both** `before` and `before_id` from the previous
page, keeping the website fixed. Supplying only one cursor component is invalid
(`invalid_cursor_or_limit`). Stop when `has_more` is false and `next_cursor` is
null. State plainly when you read only the first page of a longer history.
Lifecycle items omit evidence values (`evidence_values_omitted`).

An unsaved finding yields `items: []` for `website_remediation_list`; that
means no work has been saved for it and says nothing about the finding itself.

## 3. Errors are never empty results

Preserve the `code`, the REST HTTP `status` and the sanitized `error` message:

| Code | Meaning and action |
| --- | --- |
| `auth_required` | Missing, invalid, expired or anonymous authentication; sign in again with `pi mcp login htp`. Never an empty result. |
| `forbidden` | Authenticated but not the current website owner/FQDN; do not infer absence. |
| `invalid_cursor_or_limit` | Limit outside 1–100 or an unpaired cursor; correct the inputs. |
| `unavailable` (status 503) | Rollout held or the store is unreachable. This is **not** an empty history, **not** an empty work queue and **not** proof that nothing exists. Report it as held and stop. |
| `unsupported` | Tool absent from `tools/list`; never substitute another operation. |

## 4. Producer availability for audit events and episodes

`website_audit_events` and `website_operational_episodes` (see the
`website-management` skill) report `availability` and a `producer` object.
Profile 1.4.0 extends the 1.3 codes additively:

| Code | Reads | Meaning |
| --- | --- | --- |
| `producer_unavailable` | events, episodes | Processing disabled; events are not being produced |
| `producer_not_enqueuing` | events | Processing on, enqueueing off; new events are not queued |
| `producer_starting` | events | Enabled; the runner has not run yet |
| `producer_stale` | events | The runner has not run for 5 minutes |
| `producer_degraded` | events | Last run hit transient errors, or a job is held `processor_unavailable` |
| `producer_active` | events, episodes | The runner is running normally |

Only `producer_active` lets an **empty** page mean no events or episodes. Every
other code means events may be missing or delayed: show the code, the
`producer` object and the counts as reported, and never read an empty page as a
clean result. An unrecognised code is treated as non-active.

## 5. Related reads that are not MCP tools

Search evidence and independent-audit comparison reads (the search dataset and
crawl evidence, and the independent audit history/comparison reads) are served
by the HTP web dashboard and REST API, not by the deployed MCP host. They stay
gated in `htp_pi_capabilities`; a missing MCP tool is `unsupported`, never an
empty page, and these reads are never fetched through a browser session, the
database or a service-role key.

## 6. Report honestly

Name the tool, the code, the status and the page bounds you read. A held read
(`unavailable`), a denied read (`forbidden`) and a missing tool (`unsupported`)
are findings, not empty successes. This skill never claims lifecycle history,
remediation work, audit events or episodes exist or are absent beyond what a
discovered tool returned.
