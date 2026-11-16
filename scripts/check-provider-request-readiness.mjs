// Finite offline readiness evidence; no installed skills or host adapter.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, lstatSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const tree = join(root, 'contract/provider-request-1.1');
const lock = JSON.parse(readFileSync(join(root, 'contract/provider-request-1.1.lock.json'), 'utf8'));
assert.equal(lock.contractVersion, '1.1.0');
assert.equal(lock.canonicalCommit, 'e19875d0d6e74b5d990e45e456656c99dacc89d1');
assert.equal(lock.sourcePR, 44);
assert.equal(lock.backendPR, 45);
assert.equal(lock.backendCommit, '48485a55773b1ca97e165a4715d343704270266e');
assert.deepEqual(lock.activationGates, ['htp#34', 'seosmith-host-adapter-live-acceptance', 'host-package-wave1', 'deployed-provider-input-schemas', 'host-oauth-live-acceptance']);
const expected = [
  'scripts/plugin-contract.mjs', 'scripts/provider-request-contract.mjs',
  'docs/plugin-contract/v1.1/provider-requests.json',
  'docs/plugin-contract/v1.1/conformance.json', 'docs/plugin-contract/v1.1/skills.lock.json',
  'plugins/htp/skills/repository-settings/SKILL.md', 'plugins/htp/skills/seo-review/SKILL.md',
  'plugins/htp/skills/seo-review/references/data.md', 'plugins/htp/skills/website-management/SKILL.md',
].sort();
assert.deepEqual(Object.keys(lock.files).sort(), expected, 'lock file inventory drift');
function inventory(dir, prefix = '') {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name), relative = prefix + name;
    const stat = lstatSync(path);
    assert.ok(!stat.isSymbolicLink(), 'vendored symlink rejected');
    if (stat.isDirectory()) return inventory(path, relative + '/');
    assert.ok(stat.isFile(), 'regular vendored file required');
    return [relative];
  });
}
assert.deepEqual(inventory(tree).sort(), expected, 'vendored file inventory drift');
const hash = path => createHash('sha256').update(readFileSync(join(tree, path))).digest('hex');
for (const path of expected) assert.equal(hash(path), lock.files[path], 'contract drift: ' + path);

// Import only after validating the entire extracted canonical tree.
const { readJson } = await import('../contract/provider-request-1.1/scripts/plugin-contract.mjs');
const { profile, validateProviderResults } = await import('../contract/provider-request-1.1/scripts/provider-request-contract.mjs');
const skills = readJson(join(tree, 'docs/plugin-contract/v1.1/skills.lock.json'));
assert.equal(skills.contractVersion, lock.contractVersion);
assert.deepEqual(skills.files.map(f => f.path).sort(), expected.filter(p => p.startsWith('plugins/')));
for (const file of skills.files) assert.equal(hash(file.path), file.sha256, 'source skill drift: ' + file.path);
assert.equal(profile.contractVersion, lock.contractVersion);
assert.equal(profile.backendEvidence.pullRequest, lock.backendPR);
assert.equal(profile.backendEvidence.mergeRevision, lock.backendCommit);
assert.ok(profile.activationGate);
const fixtures = readJson(join(tree, 'docs/plugin-contract/v1.1/conformance.json'));
assert.equal(fixtures.evidenceKind, 'synthetic');
validateProviderResults(fixtures, {
  contractVersion: lock.contractVersion, host: 'pi',
  observations: fixtures.scenarios.map(s => ({ id: s.id, steps: s.steps.map(t => t.expected) })),
});
const args = process.argv.slice(2);
if (args.length) {
  assert.ok(args.length === 2 && args[0] === '--provider-results', 'usage: node scripts/check-provider-request-readiness.mjs [--provider-results results.json]');
  const results = readJson(args[1]);
  assert.equal(results.host, 'pi', 'Pi results required');
  validateProviderResults(fixtures, results);
  console.log(results.observations.every(o => Object.hasOwn(o, 'context'))
    ? 'Measured context supplied for all provider traces; evidence provenance remains an independent acceptance obligation.'
    : 'Synthetic fixture context selected; this is not measured backend/host acceptance.');
  console.log('Provider semantic trace assertions passed. Counters/context require independent measured evidence; provenance and live support are not verified.');
}
console.log(`Pi provider profile ${lock.contractVersion}: nine canonical artifacts, ${fixtures.scenarios.length} synthetic lifecycle traces; HTP and SEOsmith activation/release gates remain open. No installed skill parity or live acceptance.`);
