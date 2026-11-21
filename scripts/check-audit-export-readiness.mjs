// Finite offline Pi readiness evidence for the canonical audit export 1.2
// profile. Verifies the vendored canonical tree by hash, source-skill parity and
// semantic conformance. It does not install skills, run an adapter, call a
// backend, or establish live support.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, lstatSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const tree = join(root, 'contract/audit-export-1.2');
const lock = JSON.parse(readFileSync(join(root, 'contract/audit-export-1.2.lock.json'), 'utf8'));
assert.equal(lock.contractVersion, '1.2.0');
assert.equal(lock.canonicalCommit, '6c065c8327970b0773ba90f163f99a6e56e1e204');
assert.equal(lock.sourcePR, 48);
assert.equal(lock.backendBase, 'a80b7e52669dce558ee7468a9d54453b8267f7a6');
assert.equal(lock.backendExportRevision, null);
assert.deepEqual(lock.activationGates, [
  'htp#34',
  'audit-export-backend-accepted-and-deployed',
  'deployed-audit-export-schemas-rediscovered',
  'host-package-wave1',
  'host-oauth-live-acceptance',
]);
const expected = [
  'docs/plugin-contract/v1.2/README.md',
  'docs/plugin-contract/v1.2/audit-exports.json',
  'docs/plugin-contract/v1.2/conformance.json',
  'docs/plugin-contract/v1.2/skills.lock.json',
  'plugins/htp/skills/repository-settings/SKILL.md',
  'plugins/htp/skills/seo-review/SKILL.md',
  'plugins/htp/skills/seo-review/references/data.md',
  'plugins/htp/skills/website-management/SKILL.md',
  'scripts/audit-export-contract.mjs',
  'scripts/audit-export-fixtures.mjs',
  'scripts/check-audit-export-contract.mjs',
  'scripts/plugin-contract.mjs',
].sort();
assert.deepEqual(Object.keys(lock.files).sort(), expected, 'lock file inventory drift');
function inventory(dir, prefix = '') {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name), relative = prefix + name;
    const stat = lstatSync(path);
    assert.ok(!stat.isSymbolicLink(), 'vendored symlink rejected');
    if (stat.isDirectory()) return inventory(path, relative + '/');
    assert.ok(stat.isFile(), 'regular vendored file required');
    return [relative];
  });
}
assert.deepEqual(inventory(tree).sort(), expected, 'vendored file inventory drift');
const hash = (path) => createHash('sha256').update(readFileSync(join(tree, path))).digest('hex');
for (const path of expected) assert.equal(hash(path), lock.files[path], 'contract drift: ' + path);

// Import only after validating the entire extracted canonical tree.
const { readJson } = await import('../contract/audit-export-1.2/scripts/plugin-contract.mjs');
const { validateExportResults, exportFixtures } = await import('../contract/audit-export-1.2/scripts/audit-export-contract.mjs');
const { syntheticExportResults } = await import('../contract/audit-export-1.2/scripts/audit-export-fixtures.mjs');

const profile = readJson(join(tree, 'docs/plugin-contract/v1.2/audit-exports.json'));
assert.equal(profile.contractVersion, lock.contractVersion);
assert.equal(profile.exportVersion, 1);
assert.equal(profile.representation, 'htp.audit-detail-json.v1');
assert.equal(profile.backendExportRevision, null);
assert.equal(profile.limits.chunkMaxBytes, 262144);
assert.deepEqual(profile.operations.map((o) => o.binding), [
  'website_audit_export_start_v1',
  'website_audit_export_chunk_v1',
  'website_audit_export_close_v1',
]);

const skills = readJson(join(tree, 'docs/plugin-contract/v1.2/skills.lock.json'));
assert.equal(skills.contractVersion, lock.contractVersion);
assert.deepEqual(skills.files.map((f) => f.path).sort(), expected.filter((p) => p.startsWith('plugins/')));
for (const file of skills.files) assert.equal(hash(file.path), file.sha256, 'source skill drift: ' + file.path);

const fixtures = readJson(join(tree, 'docs/plugin-contract/v1.2/conformance.json'));
assert.equal(fixtures.contractVersion, lock.contractVersion);
assert.equal(fixtures.scenarios.length, 19, 'scenario count');
assert.equal(exportFixtures.scenarios.length, fixtures.scenarios.length, 'vendored fixture population');
// The Pi wrapper must target host "pi" for the synthetic self-test.
assert.equal(validateExportResults(syntheticExportResults('pi')), 'synthetic', 'synthetic self-test mode');

const args = process.argv.slice(2);
if (args.length) {
  assert.ok(args.length === 2 && args[0] === '--export-results', 'usage: node scripts/check-audit-export-readiness.mjs [--export-results results.json]');
  assert.ok(statSync(args[1]).size <= 32 * 1024 * 1024, 'offline evidence file bound, not backend report limit');
  const bytes = readFileSync(args[1]);
  assert.ok(bytes.length <= 32 * 1024 * 1024, 'offline evidence file bound, not backend report limit');
  const results = JSON.parse(bytes);
  assert.equal(results.host, 'pi', 'Pi export results required');
  const mode = validateExportResults(results);
  console.log(mode === 'measured-context'
    ? 'Measured context supplied for all audit export traces; evidence provenance, side effects and live support remain independent acceptance obligations.'
    : 'Synthetic fixture context selected; this is not measured backend/host acceptance.');
} else {
  console.log('Synthetic fixture context selected; this is a canonical-shape self-test, not measured backend/host acceptance.');
}
console.log(`Pi audit export profile ${lock.contractVersion}: ${expected.length} canonical artifacts, ${fixtures.scenarios.length} synthetic export scenarios; backend deployment/endpoint/cgroup, host packaging/OAuth/runtime and HTP#34 gates remain open. No installed skill parity or live acceptance.`);
