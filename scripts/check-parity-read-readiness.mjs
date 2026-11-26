// Finite offline Pi readiness evidence for the canonical additive parity read
// profile 1.4.0 (website_audit_lifecycle, website_url_lifecycle,
// website_remediation_list) plus the audit-read availability amendment.
// Verifies the vendored 1.4 tree by hash, the shipped capability-gated skill,
// the shared-skill pin against the baseline-pre-r5-46f6b81a anchor, and the
// runtime capability report. It is gated: no installed-skill run, no host auth,
// no backend call and no rollout flag is assumed on.
//
// A tool absent from tools/list is `unsupported`, never an empty success. A
// discovered read behind an off rollout flag answers code:unavailable (503),
// which is never an empty history, an empty work queue or a zero count.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, lstatSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const tree = join(root, 'contract/parity-reads-1.4');
const lock = JSON.parse(readFileSync(join(root, 'contract/parity-reads-1.4.lock.json'), 'utf8'));
assert.equal(lock.contractVersion, '1.4.0');
assert.equal(lock.canonicalCommit, '09a0ba56c175e3e889bfa5a8eacff01666851e39');
assert.equal(lock.canonicalTree, '97ca939759757c7007f2babbccc4da51e4ee6b53');
assert.deepEqual(lock.sourcePRs, [151]);
assert.equal(lock.revisionStatus, 'merged');
assert.match(lock.sharedSkillSource, /audit-reads-1\.3\.lock\.json/);
assert.match(lock.canonicalRevision, /09a0ba56c175e3e889bfa5a8eacff01666851e39/);
assert.deepEqual(lock.activationGates, [
  'exact-head contract review and canonical merge',
  'API deployment with the lifecycle and remediation rollout flags and the database grants enabled independently',
  'three host source/readiness companions at exact canonical merge; runtime support separately verified',
  'fresh tools/list and input-schema discovery on the deployed host',
]);
const expected = [
  'docs/plugin-contract/v1.4/README.md',
  'docs/plugin-contract/v1.4/audit-read-availability.json',
  'docs/plugin-contract/v1.4/conformance.json',
  'docs/plugin-contract/v1.4/parity-reads.json',
  'scripts/audit-read-availability.mjs',
  'scripts/check-parity-read-contract.mjs',
  'scripts/parity-read-contract.mjs',
  'scripts/plugin-contract.mjs',
].sort();
assert.deepEqual(Object.keys(lock.files).sort(), expected, 'lock file inventory drift');
function inventory(dir, prefix = '') {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name), relative = prefix + name;
    const stat = lstatSync(path);
    assert.ok(!stat.isSymbolicLink(), 'vendored symlink: ' + relative);
    if (stat.isDirectory()) return inventory(path, relative + '/');
    assert.ok(stat.isFile(), 'vendored file: ' + relative);
    return [relative];
  });
}
assert.deepEqual(inventory(tree).sort(), expected, 'vendored file inventory drift');
const hash = (base, path) => createHash('sha256').update(readFileSync(join(base, path))).digest('hex');
for (const path of expected) assert.equal(hash(tree, path), lock.files[path], 'contract drift: ' + path);

// Import only after validating the entire extracted canonical tree.
const {
  parityReadProfile,
  parityReadFixtures,
  validateParityReadResults,
  syntheticParityReadResults,
} = await import('../contract/parity-reads-1.4/scripts/parity-read-contract.mjs');
const {
  auditAvailabilityProfile,
  validateAuditAvailability,
  emptyHistoryMeansNone,
  syntheticAuditAvailabilityResults,
} = await import('../contract/parity-reads-1.4/scripts/audit-read-availability.mjs');

assert.equal(parityReadProfile.contractVersion, lock.contractVersion);
assert.deepEqual(parityReadProfile.extends, ['1.0.0', '1.1.0', '1.2.0', '1.3.0']);
assert.equal(parityReadProfile.capability, 'htp.parity-read');
assert.equal(parityReadProfile.availability.heldCode, 'unavailable');
assert.equal(parityReadProfile.availability.heldStatus, 503);
assert.match(parityReadProfile.availability.meaning, /not an empty history/i);
assert.match(parityReadProfile.discovery, /unsupported/);
assert.match(parityReadProfile.discovery, /never substitute/i);
const bindings = ['website_audit_lifecycle', 'website_url_lifecycle', 'website_remediation_list'];
assert.deepEqual(parityReadProfile.operations.map((o) => o.binding).sort(), bindings.slice().sort());
for (const op of parityReadProfile.operations) {
  assert.equal(op.effect, 'read');
  assert.equal(op.authorization, 'htp-owner-oauth');
  assert.equal(op.collection, false, op.id + ' must not collect');
  assert.equal(op.idempotency, true);
  assert.equal(op.destructive, false);
  assert.match(op.rolloutFlag, /^HTP_ROLLOUT_/);
}
assert.deepEqual(parityReadProfile.limits, {
  limitMin: 1,
  limitMax: 100,
  defaultLimit: 50,
  cursor: 'before and before_id must be supplied together, from the previous page\'s next_cursor; supplying only one is invalid',
});
assert.deepEqual(parityReadProfile.errors, ['auth_required', 'forbidden', 'invalid_cursor_or_limit', 'unavailable', 'unsupported']);

assert.equal(parityReadFixtures.contractVersion, lock.contractVersion);
assert.equal(parityReadFixtures.evidenceKind, 'synthetic');
assert.equal(parityReadFixtures.scenarios.length, 23, 'scenario count');
const byId = new Map(parityReadFixtures.scenarios.map((s) => [s.id, s]));
for (const op of parityReadProfile.operations) {
  const suffixes = ['owner.page', 'owner.trailing_page', 'held', 'anonymous', 'non_owner', 'missing_capability', 'unpaired_cursor'];
  // The remediation read has no limit parameter; only the lifecycle reads take one.
  if (op.pageBound === 'limit') suffixes.push('limit_out_of_range');
  for (const suffix of suffixes) {
    assert.ok(byId.has(op.id + '.' + suffix), 'missing scenario ' + op.id + '.' + suffix);
  }
}
// A held read is never an empty page and a missing tool is never an empty success.
for (const op of parityReadProfile.operations) {
  const held = byId.get(op.id + '.held');
  assert.equal(held.expected.result.code, 'unavailable');
  assert.equal(held.expected.effects.collectionRegistered, false);
  assert.equal(held.expected.effects.crawlRunsCreated, 0);
  const absent = byId.get(op.id + '.missing_capability');
  assert.deepEqual(absent.expected.result, { code: 'unsupported' });
  assert.equal(absent.expected.effects.collectionRegistered, false);
  assert.equal(absent.expected.effects.crawlRunsCreated, 0);
}
validateParityReadResults(parityReadFixtures, syntheticParityReadResults('pi'));

// Availability amendment: the six event codes, two episode codes, and only
// producer_active lets an empty page mean none.
assert.equal(auditAvailabilityProfile.contractVersion, '1.4.0');
const eventCodes = ['producer_unavailable', 'producer_not_enqueuing', 'producer_starting', 'producer_stale', 'producer_degraded', 'producer_active'];
assert.equal(auditAvailabilityProfile.availability.heldValue, 'producer_unavailable');
assert.equal(auditAvailabilityProfile.availability.emptyMeansNoEventsValue, 'producer_active');
for (const code of eventCodes) {
  assert.ok(auditAvailabilityProfile.availability.codes['htp.website_audit_events'].includes(code), 'missing availability code ' + code);
  assert.equal(emptyHistoryMeansNone({ availability: code }), code === 'producer_active');
}
assert.equal(emptyHistoryMeansNone({ availability: 'unknown_code' }), false);
const { events, episodes } = syntheticAuditAvailabilityResults();
for (const result of events) validateAuditAvailability('htp.website_audit_events', result);
for (const result of episodes) validateAuditAvailability('htp.website_operational_episodes', result);

// The shipped host skill must name every 1.4 tool, every availability code and
// the gate language, and carry the Pi host adaptation without claiming availability.
const skill = readFileSync(join(root, 'skills/lifecycle-remediation/SKILL.md'), 'utf8');
assert.match(skill, /Pi host adaptation/);
for (const name of bindings) assert.ok(skill.includes('`' + name + '`'), 'host skill must name ' + name);
for (const code of parityReadProfile.errors) assert.ok(skill.includes('`' + code + '`'), 'host skill must name ' + code);
for (const code of eventCodes) assert.ok(skill.includes('`' + code + '`'), 'host skill must name ' + code);
for (const phrase of [/not listed.*`unsupported`/s, /never substitute/i, /\*\*not\*\* an empty history/, /\*\*not\*\* an empty work queue/, /`HTP_ROLLOUT_LIFECYCLE`/, /`HTP_ROLLOUT_REMEDIATION`/, /`pi mcp login htp`/, /read-only/i]) {
  assert.match(skill, phrase, 'host skill gate language');
}
assert.doesNotMatch(skill, /rollout flag .*(is|are) (on|enabled)/i);

// Shared skills stay byte-identical to the baseline-pre-r5-46f6b81a anchor:
// profile 1.4 adds no shared skill text, so nothing under the five shipped
// shared skills changes in this release. The hashes below are pinned to that
// anchor's blob hashes (verified with `git show <baseline>:<path> | sha256sum`
// against the anchor when the release was prepared); they are literals so the
// check also runs from a copy without the anchor object.
const BASELINE = '46f6b81a90c50a97c5f6c3b73a3eed67a7ee9b39';
const pinned = {
  'skills/htp-connection/SKILL.md': 'c52224ae6a21919e53825361fb0bf1e287f1868c77f8d9092127f56dbe06bc98',
  'skills/repository-settings/SKILL.md': '052df75c51063cf9fa1eefa6920c069bfc788ad34877dcef0da2ae0a686c5930',
  'skills/seo-review/SKILL.md': 'ed71e433f0d8a007ac18607ca0a2bf28c4dbae305372cac37510fef536a54638',
  'skills/seo-review/references/data.md': 'b2dc920820cef70f06843421e40470bcd31d68e15334db9e5a4141d7287c5492',
  'skills/seosmith-operations/SKILL.md': '4caa8bb6f8835d4795f5a7ec13e772e50c378ae2a17f9e029fa1ff1caf8c8a8c',
  'skills/website-management/SKILL.md': '7795999c6f7e2d82f4fb608e3cf724c227ce8e4f0724b395282f5ebbe44afe5a',
};
for (const [path, sha] of Object.entries(pinned)) {
  assert.equal(hash(root, path), sha, 'shared skill drift against the baseline-pre-r5-46f6b81a anchor ' + BASELINE + ': ' + path);
}

// The runtime capability report must gate the 1.4 reads and the web-only
// search/comparison reads, and must never advertise them as available: the held
// ids may not appear in any advertised operation list (the MCP list the adapter
// exposes or the SEOsmith local operations). This asserts the lists themselves,
// because `capabilityReport().htp` never carries an operation list.
const { capabilityReport, GATED_OPERATIONS, HTP_MCP_OPERATIONS, SEOSMITH_LOCAL_OPERATIONS, PACKAGE_VERSION } = await import(
  '../extensions/htp-pi/lib/capabilities.mjs'
);
assert.equal(PACKAGE_VERSION, '1.1.0');
const heldIds = [
  'htp.website_audit_lifecycle',
  'htp.website_url_lifecycle',
  'htp.website_remediation_list',
  'htp.search_evidence',
  'htp.independent_comparison',
];
for (const id of heldIds) {
  assert.ok(!HTP_MCP_OPERATIONS.includes(id), 'held read must never be advertised as an HTP MCP operation: ' + id);
  assert.ok(!SEOSMITH_LOCAL_OPERATIONS.includes(id), 'held read must never be advertised as a SEOsmith local operation: ' + id);
}
const gatedIds = GATED_OPERATIONS.map((g) => g.id);
for (const id of ['htp.website_audit_lifecycle', 'htp.website_url_lifecycle', 'htp.website_remediation_list']) {
  const gated = GATED_OPERATIONS.find((g) => g.id === id);
  assert.ok(gated, 'capability report must gate ' + id);
  assert.match(gated.reason, /HTP_ROLLOUT_/);
  assert.match(gated.reason, /unsupported|unavailable/);
}
for (const id of ['htp.search_evidence', 'htp.independent_comparison']) {
  const gated = GATED_OPERATIONS.find((g) => g.id === id);
  assert.ok(gated, 'capability report must gate ' + id);
  assert.match(gated.reason, /web-only|REST/i);
}
const report = capabilityReport();
assert.equal(report.package.version, '1.1.0');
for (const gated of GATED_OPERATIONS) {
  assert.ok(!JSON.stringify(report.htp ?? {}).includes(gated.id), 'gated id must stay out of the advertised MCP list: ' + gated.id);
  assert.ok(!JSON.stringify(report.seosmith ?? {}).includes(gated.id), 'gated id must stay out of the advertised local operations: ' + gated.id);
}

let mode = 'synthetic';
const args = process.argv.slice(2);
if (args.length) {
  assert.deepEqual(args.length, 2, 'usage: node scripts/check-parity-read-readiness.mjs [--parity-read-results results.json]');
  assert.equal(args[0], '--parity-read-results');
  const bytes = readFileSync(args[1]);
  assert.ok(bytes.length <= 1024 * 1024, 'offline results bound');
  const results = JSON.parse(bytes);
  assert.equal(results.contractVersion, '1.4.0');
  assert.equal(results.host, 'pi');
  validateParityReadResults(parityReadFixtures, results);
  mode = 'measured';
}
validateParityReadResults(parityReadFixtures, syntheticParityReadResults('pi'));
console.log(mode === 'synthetic'
  ? 'Synthetic offline parity read semantics passed. Absent tools are unsupported; unavailable (503) is held, never an empty page. This is vendored-source readiness, not host or backend evidence.'
  : 'Measured Pi parity read traces passed the canonical semantic validator. Provenance, live auth, discovery and rollout flags remain independent acceptance obligations.');
console.log(`Pi parity read profile ${lock.contractVersion}: ${expected.length} canonical artifacts, ${parityReadFixtures.scenarios.length} synthetic scenarios; HTP_ROLLOUT_LIFECYCLE and HTP_ROLLOUT_REMEDIATION and deployed 23-tool discovery remain gated. No installed skill, host auth, backend or rollout flag.`);
