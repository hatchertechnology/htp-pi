import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, cpSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const checker = resolve('scripts/check-audit-export-readiness.mjs');
const tree = resolve('contract/audit-export-1.2');
const { syntheticExportResults } = await import('../contract/audit-export-1.2/scripts/audit-export-fixtures.mjs');
const { syntheticContext } = await import('../contract/audit-export-1.2/scripts/audit-export-contract.mjs');
const fixtures = JSON.parse(readFileSync(join(tree, 'docs/plugin-contract/v1.2/conformance.json'), 'utf8'));
const synthetic = syntheticExportResults('pi');

function measured() {
  return {
    contractVersion: '1.2.0',
    host: 'pi',
    observations: fixtures.scenarios.map((s) => {
      const context = syntheticContext(s);
      context.evidenceRefs = ['evidence://isolated-run/pi/transactions-and-counters'];
      return { id: s.id, context, steps: structuredClone(synthetic.observations.find((o) => o.id === s.id).steps) };
    }),
  };
}

function run(value, mutate) {
  const dir = mkdtempSync(join(tmpdir(), 'pi-export-readiness-'));
  try {
    cpSync('contract', join(dir, 'contract'), { recursive: true });
    cpSync('scripts', join(dir, 'scripts'), { recursive: true });
    if (mutate) mutate(dir);
    let args = [];
    if (value) {
      const file = join(dir, 'results.json');
      writeFileSync(file, JSON.stringify(value));
      args = ['--export-results', file];
    }
    return spawnSync(process.execPath, [join(dir, 'scripts/check-audit-export-readiness.mjs'), ...args], { cwd: dir, encoding: 'utf8' });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('synthetic self-test passes and is labelled synthetic', () => {
  const r = run();
  assert.equal(r.status, 0, r.stderr || r.stdout);
  assert.match(r.stdout, /Synthetic/);
});
test('complete measured contexts pass and are labelled measured', () => {
  const r = run(measured());
  assert.equal(r.status, 0, r.stderr || r.stdout);
  assert.match(r.stdout, /Measured/);
});
test('reject another host', () => {
  const v = measured();
  v.host = 'codex';
  assert.notEqual(run(v).status, 0);
});
test('reject synthetic reference in measured mode', () => {
  const v = measured();
  v.observations[0].context.evidenceRefs = ['synthetic://forged'];
  assert.notEqual(run(v).status, 0);
});
test('reject erased required rejection code', () => {
  const v = measured();
  const s = v.observations.find((o) => o.id === 'capacity');
  s.steps[0].result.structuredContent.code = 'INVALID_ARGUMENT';
  assert.notEqual(run(v).status, 0);
});
test('reject dropped scenario coverage', () => {
  const v = measured();
  v.observations.pop();
  assert.notEqual(run(v).status, 0);
});
test('reject source skill drift', () => {
  const r = run(null, (dir) => writeFileSync(join(dir, 'contract/audit-export-1.2/plugins/htp/skills/website-management/SKILL.md'), 'drift'));
  assert.notEqual(r.status, 0);
});
test('reject canonical pin drift', () => {
  const r = run(null, (dir) => {
    const file = join(dir, 'contract/audit-export-1.2.lock.json');
    const lock = JSON.parse(readFileSync(file, 'utf8'));
    lock.canonicalCommit = '0'.repeat(40);
    writeFileSync(file, JSON.stringify(lock));
  });
  assert.notEqual(r.status, 0);
});
test('reject validator hash drift', () => {
  const r = run(null, (dir) => writeFileSync(join(dir, 'contract/audit-export-1.2/scripts/audit-export-contract.mjs'), '// drift'));
  assert.notEqual(r.status, 0);
});
