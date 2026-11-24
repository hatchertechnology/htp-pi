import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, cp, rm, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const { syntheticAuditReadResults } = await import('../contract/audit-reads-1.3/scripts/audit-read-contract.mjs');

async function isolatedCopy() {
  const dir = await mkdtemp(join(tmpdir(), 'pi-audit-read-'));
  await cp(join(root, 'contract'), join(dir, 'contract'), { recursive: true });
  await cp(join(root, 'scripts'), join(dir, 'scripts'), { recursive: true });
  await cp(join(root, 'skills'), join(dir, 'skills'), { recursive: true });
  return dir;
}

function run(dir, args = []) {
  return spawnSync(process.execPath, [join(dir, 'scripts/check-audit-read-readiness.mjs'), ...args], {
    cwd: dir,
    encoding: 'utf8',
  });
}

test('synthetic self-test passes and is labelled vendored-source readiness', async () => {
  const dir = await isolatedCopy();
  try {
    const r = run(dir);
    assert.equal(r.status, 0, r.stderr || r.stdout);
    assert.match(r.stdout, /Synthetic offline audit read semantics passed/);
    assert.match(r.stdout, /Absent tools are unsupported/);
    assert.match(r.stdout, /producer_unavailable is explicit/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('measured Pi traces pass and are labelled measured', async () => {
  const dir = await isolatedCopy();
  try {
    const results = join(dir, 'results.json');
    await writeFile(results, JSON.stringify(syntheticAuditReadResults('pi')));
    const r = run(dir, ['--audit-read-results', results]);
    assert.equal(r.status, 0, r.stderr || r.stdout);
    assert.match(r.stdout, /Measured Pi audit read traces/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('rejects another host in measured mode', async () => {
  const dir = await isolatedCopy();
  try {
    const results = join(dir, 'results.json');
    await writeFile(results, JSON.stringify(syntheticAuditReadResults('claude')));
    const r = run(dir, ['--audit-read-results', results]);
    assert.notEqual(r.status, 0);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('rejects source-skill drift', async () => {
  const dir = await isolatedCopy();
  try {
    await writeFile(join(dir, 'contract/audit-reads-1.3/plugins/htp/skills/website-management/SKILL.md'), 'drift');
    const r = run(dir);
    assert.notEqual(r.status, 0);
    assert.match(r.stderr || r.stdout, /source-skill drift|contract drift/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('rejects validator drift', async () => {
  const dir = await isolatedCopy();
  try {
    await writeFile(join(dir, 'contract/audit-reads-1.3/scripts/audit-read-contract.mjs'), 'drift');
    const r = run(dir);
    assert.notEqual(r.status, 0);
    assert.match(r.stderr || r.stdout, /contract drift/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('rejects erased producer availability', async () => {
  const dir = await isolatedCopy();
  try {
    const results = syntheticAuditReadResults('pi');
    const observation = results.observations.find((o) => o.id === 'htp.website_audit_events.owner.producer_unavailable');
    delete observation.result.availability;
    const file = join(dir, 'results.json');
    await writeFile(file, JSON.stringify(results));
    const r = run(dir, ['--audit-read-results', file]);
    assert.notEqual(r.status, 0);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('rejects a missing tool substituted as an empty success', async () => {
  const dir = await isolatedCopy();
  try {
    const results = syntheticAuditReadResults('pi');
    const observation = results.observations.find((o) => o.id === 'htp.website_operational_episodes.missing_capability');
    observation.result = { version: 1, episodes: [], has_more: false, next_cursor: null, availability: 'producer_unavailable' };
    const file = join(dir, 'results.json');
    await writeFile(file, JSON.stringify(results));
    const r = run(dir, ['--audit-read-results', file]);
    assert.notEqual(r.status, 0);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('rejects shipped-skill drift without the read paragraph', async () => {
  const dir = await isolatedCopy();
  try {
    const skill = join(dir, 'skills/website-management/SKILL.md');
    const text = await readFile(skill, 'utf8');
    await writeFile(skill, text.replace(/website_audit_events/g, 'removed_read'));
    const r = run(dir);
    assert.notEqual(r.status, 0);
    assert.match(r.stderr || r.stdout, /website_audit_events/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('rejects lock drift', async () => {
  const dir = await isolatedCopy();
  try {
    const lockPath = join(dir, 'contract/audit-reads-1.3.lock.json');
    const lock = JSON.parse(await readFile(lockPath, 'utf8'));
    lock.canonicalCommit = '0'.repeat(40);
    await writeFile(lockPath, JSON.stringify(lock));
    const r = run(dir);
    assert.notEqual(r.status, 0);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
