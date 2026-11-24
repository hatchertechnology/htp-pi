// Finite offline Pi readiness evidence for the canonical additive audit read
// profile 1.3.0. Verifies the vendored 1.3 tree by hash, source-skill parity and
// semantic conformance. It is gated: no installed-skill run, no host auth, no
// backend call and no producer activation. The two reads stay unavailable until
// the deployed 25-tool host discovers them and the H15 producer gates are on.
//
// Absent tools are `unsupported`, never an empty success. A discovered but
// producer-disabled read returns `availability:producer_unavailable`, which is
// never an empty history, a zero count or proof that no events exist.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, lstatSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const tree = join(root, 'contract/audit-reads-1.3');
const lock = JSON.parse(readFileSync(join(root, 'contract/audit-reads-1.3.lock.json'), 'utf8'));
assert.equal(lock.contractVersion, '1.3.0');
assert.equal(lock.canonicalCommit, '4e7dc94e4f92a30fb57e4061fa1f06d517157c63');
assert.equal(lock.mergedTree, '36a9456c6e2a819e7b4233ef0ae40b30a509efb8');
assert.equal(lock.sourcePR, 82);
assert.equal(lock.baseCommit, '8c9e84d168afc19572216ceef1362a1d76693307');
assert.equal(lock.revisionStatus, 'merged');
assert.match(lock.canonicalRevision, /merged into main/);
assert.deepEqual(lock.activationGates, [
  'exact-head contract review and canonical merge',
  'H15 producer/processor activation is independently gated and disabled',
  'three host source/readiness companions at exact canonical merge; runtime support separately verified',
  'fresh tools/list and input-schema discovery on the deployed host',
]);
const expected = [
  'docs/plugin-contract/v1.3/README.md',
  'docs/plugin-contract/v1.3/audit-reads.json',
  'docs/plugin-contract/v1.3/conformance.json',
  'docs/plugin-contract/v1.3/skills.lock.json',
  'docs/plugin-contract/v1.3/historical-v1.2-source/plugins/htp/skills/repository-settings/SKILL.md',
  'docs/plugin-contract/v1.3/historical-v1.2-source/plugins/htp/skills/seo-review/SKILL.md',
  'docs/plugin-contract/v1.3/historical-v1.2-source/plugins/htp/skills/seo-review/references/data.md',
  'docs/plugin-contract/v1.3/historical-v1.2-source/plugins/htp/skills/website-management/SKILL.md',
  'plugins/htp/skills/repository-settings/SKILL.md',
  'plugins/htp/skills/seo-review/SKILL.md',
  'plugins/htp/skills/seo-review/references/data.md',
  'plugins/htp/skills/website-management/SKILL.md',
  'scripts/audit-read-contract.mjs',
  'scripts/check-audit-read-contract.mjs',
  'scripts/plugin-contract.mjs',
].sort();
assert.deepEqual(Object.keys(lock.files).sort(), expected, 'lock file inventory drift');
function inventory(dir, prefix = '') {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name), relative = prefix + name;
    const stat = lstatSync(path);
    assert.ok(!stat.isSymbolicLink(), 'vendored symlink: ' + relative);
    if (stat.isDirectory()) return inventory(path, relative + '/');
    assert.ok(stat.isFile(), 'vendored non-file: ' + relative);
    return [relative];
  });
}
assert.deepEqual(inventory(tree).sort(), expected, 'vendored file inventory drift');
const hash = (path) => createHash('sha256').update(readFileSync(join(tree, path))).digest('hex');
for (const path of expected) assert.equal(hash(path), lock.files[path], 'contract drift: ' + path);

// Import only after validating the entire extracted canonical tree.
const { readJson } = await import('../contract/audit-reads-1.3/scripts/plugin-contract.mjs');
const {
  auditReadProfile,
  auditReadFixtures,
  validateAuditReadResults,
  syntheticAuditReadResults,
} = await import('../contract/audit-reads-1.3/scripts/audit-read-contract.mjs');

const profile = readJson(join(tree, 'docs/plugin-contract/v1.3/audit-reads.json'));
assert.equal(profile.contractVersion, lock.contractVersion);
assert.deepEqual(profile.extends, ['1.0.0', '1.1.0', '1.2.0']);
assert.equal(profile.capability, 'htp.audit-read');
assert.equal(profile.availability.field, 'availability');
assert.equal(profile.availability.disabledValue, 'producer_unavailable');
assert.match(profile.discovery, /unsupported/);
assert.match(profile.discovery, /never substitute/i);
assert.match(profile.availability.meaning, /not an empty history/i);
assert.match(profile.availability.meaning, /not a zero count/i);
const readIds = ['htp.website_audit_events', 'htp.website_operational_episodes'];
assert.deepEqual(profile.operations.map((o) => o.id).sort(), readIds.slice().sort());
for (const op of profile.operations) {
  assert.equal(op.effect, 'read');
  assert.equal(op.authorization, 'htp-owner-oauth');
  assert.equal(op.collection, false, op.id + ' must not collect');
  assert.equal(op.idempotency, true);
  assert.equal(op.destructive, false);
  assert.ok(op.resultFields.includes('availability'));
  assert.ok(op.resultFields.includes(op.pageField));
}
assert.deepEqual(profile.limits, {
  limitMin: 1,
  limitMax: 100,
  defaultLimit: 50,
  cursor: "before and before_id must be supplied together, from the previous page's next_cursor; supplying only one is invalid",
});

const skills = readJson(join(tree, 'docs/plugin-contract/v1.3/skills.lock.json'));
assert.equal(skills.contractVersion, lock.contractVersion);
assert.deepEqual(skills.files.map((f) => f.path).sort(), [
  'plugins/htp/skills/repository-settings/SKILL.md',
  'plugins/htp/skills/seo-review/SKILL.md',
  'plugins/htp/skills/seo-review/references/data.md',
  'plugins/htp/skills/website-management/SKILL.md',
]);
for (const file of skills.files) assert.equal(hash(file.path), file.sha256, 'source-skill drift: ' + file.path);

assert.equal(auditReadFixtures.contractVersion, lock.contractVersion);
assert.equal(auditReadFixtures.evidenceKind, 'synthetic');
assert.equal(auditReadFixtures.scenarios.length, 16, 'scenario count');
const byId = new Map(auditReadFixtures.scenarios.map((s) => [s.id, s]));
for (const id of readIds) {
  for (const suffix of ['owner.page', 'owner.producer_unavailable', 'owner.trailing_page', 'anonymous', 'non_owner', 'missing_capability', 'unpaired_cursor', 'limit_out_of_range']) {
    assert.ok(byId.has(id + '.' + suffix), 'missing scenario ' + id + '.' + suffix);
  }
}
// Absent tool is unsupported, never an empty success.
for (const id of readIds) {
  const absent = byId.get(id + '.missing_capability');
  assert.deepEqual(absent.expected.result, { code: 'unsupported' });
  assert.equal(absent.expected.effects.collectionRegistered, false);
  assert.equal(absent.expected.effects.crawlRunsCreated, 0);
}
// A discovered but producer-disabled read is explicit, never a zero count.
for (const id of readIds) {
  const disabled = byId.get(id + '.owner.producer_unavailable');
  assert.equal(disabled.expected.result.availability, 'producer_unavailable');
  assert.ok(Array.isArray(disabled.expected.result[auditReadProfile.operations.find((o) => o.id === id).pageField]));
  assert.equal(disabled.expected.result.has_more, false);
}
// The canonical validator rejects an erased availability field and a missing-capability empty success.
const erased = syntheticAuditReadResults('pi');
const erasedScenario = erased.observations.find((o) => o.id === 'htp.website_audit_events.owner.producer_unavailable');
delete erasedScenario.result.availability;
assert.throws(() => validateAuditReadResults(auditReadFixtures, erased), /availability/i);
const substituted = syntheticAuditReadResults('pi');
const substitutedScenario = substituted.observations.find((o) => o.id === 'htp.website_audit_events.missing_capability');
substitutedScenario.result = { semantics_version: 1, events: [], has_more: false, next_cursor: null, availability: 'producer_unavailable' };
assert.throws(() => validateAuditReadResults(auditReadFixtures, substituted), /code|unsupported/i);

// Pi keeps its host-adapted shared skill. The canonical bytes are vendored in the
// 1.3 tree; the shipped skill must carry the read paragraph and the corrected
// import bound without claiming the reads are active.
const shipped = readFileSync(join(root, 'skills/website-management/SKILL.md'), 'utf8');
assert.match(shipped, /Pi host adaptation/);
assert.match(shipped, /website_audit_events/);
assert.match(shipped, /website_operational_episodes/);
assert.match(shipped, /availability:producer_unavailable/);
assert.match(shipped, /not a successful empty history/);
assert.match(shipped, /4,952,756 UTF-8 bytes/);
assert.doesNotMatch(shipped, /at most 16 MiB/);

let mode = 'synthetic';
const args = process.argv.slice(2);
if (args.length) {
  assert.deepEqual(args.length, 2, 'usage: node scripts/check-audit-read-readiness.mjs [--audit-read-results results.json]');
  assert.equal(args[0], '--audit-read-results');
  assert.ok(statSync(args[1]).size <= 1024 * 1024, 'offline results bound');
  const bytes = readFileSync(args[1]);
  assert.ok(bytes.length <= 1024 * 1024, 'offline results bound');
  const results = JSON.parse(bytes);
  assert.equal(results.contractVersion, '1.3.0');
  assert.equal(results.host, 'pi');
  validateAuditReadResults(auditReadFixtures, results);
  mode = 'measured';
}
validateAuditReadResults(auditReadFixtures, syntheticAuditReadResults('pi'));
console.log(mode === 'synthetic'
  ? 'Synthetic offline audit read semantics passed. Absent tools are unsupported; producer_unavailable is explicit and never an empty success. This is vendored-source readiness, not host or backend evidence.'
  : 'Measured Pi audit read traces passed the canonical semantic validator. Provenance, live auth, discovery and producer support remain independent acceptance obligations.');
console.log(`Pi audit read profile ${lock.contractVersion}: ${expected.length} canonical artifacts, ${auditReadFixtures.scenarios.length} synthetic scenarios; H15 producer gates and deployed 25-tool discovery remain gated. No installed-skill parity, host auth, backend or live run.`);
