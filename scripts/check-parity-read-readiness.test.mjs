import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, cp, rm, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const { syntheticParityReadResults } = await import('../contract/parity-reads-1.4/scripts/parity-read-contract.mjs');

async function isolatedCopy() {
  const dir = await mkdtemp(join(tmpdir(), 'pi-parity-read-'));
  await cp(join(root, 'contract'), join(dir, 'contract'), { recursive: true });
  await cp(join(root, 'scripts'), join(dir, 'scripts'), { recursive: true });
  await cp(join(root, 'skills'), join(dir, 'skills'), { recursive: true });
  await cp(join(root, 'extensions'), join(dir, 'extensions'), { recursive: true });
  return dir;
}

function run(dir, args = []) {
  return spawnSync(process.execPath, [join(dir, 'scripts/check-parity-read-readiness.mjs'), ...args], {
    cwd: dir,
    encoding: 'utf8',
  });
}

const obs = (r, id) => r.observations.find((o) => o.id === id);

async function measured(dir, mutate) {
  const results = syntheticParityReadResults('pi');
  mutate(results);
  const file = join(dir, 'results.json');
  await writeFile(file, JSON.stringify(results));
  return run(dir, ['--parity-read-results', file]);
}

test('synthetic self-test passes and is labelled vendored-source readiness', async () => {
  const dir = await isolatedCopy();
  try {
    const r = run(dir);
    assert.equal(r.status, 0, r.stderr || r.stdout);
    assert.match(r.stdout, /Synthetic offline parity read semantics passed/);
    assert.match(r.stdout, /Absent tools are unsupported/);
    assert.match(r.stdout, /unavailable \(503\) is held/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('measured Pi traces pass and are labelled measured', async () => {
  const dir = await isolatedCopy();
  try {
    const r = await measured(dir, () => {});
    assert.equal(r.status, 0, r.stderr || r.stdout);
    assert.match(r.stdout, /Measured Pi parity read traces passed/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('rejects another host in measured mode', async () => {
  const dir = await isolatedCopy();
  try {
    const r = await measured(dir, (results) => { results.host = 'claude'; });
    assert.notEqual(r.status, 0);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('rejects a held read erased into an empty page', async () => {
  const dir = await isolatedCopy();
  try {
    const r = await measured(dir, (results) => {
      obs(results, 'htp.website_audit_lifecycle.held').result = {
        version: 1, entity_id: 'x', rule: 'missing_title', items: [], has_more: false, next_cursor: null,
      };
    });
    assert.notEqual(r.status, 0);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('rejects a held remediation read erased into an empty work queue', async () => {
  const dir = await isolatedCopy();
  try {
    const r = await measured(dir, (results) => {
      obs(results, 'htp.website_remediation_list.held').result = {
        version: 1, delivery_id: 'x', finding_index: 0, items: [], has_more: false, next_cursor: null,
      };
    });
    assert.notEqual(r.status, 0);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('rejects a missing tool substituted as an empty success', async () => {
  const dir = await isolatedCopy();
  try {
    const r = await measured(dir, (results) => {
      obs(results, 'htp.website_url_lifecycle.missing_capability').result = {
        version: 1, entity_id: 'x', items: [], has_more: false, next_cursor: null,
      };
    });
    assert.notEqual(r.status, 0);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('rejects a nonowner read', async () => {
  const dir = await isolatedCopy();
  try {
    const r = await measured(dir, (results) => {
      obs(results, 'htp.website_audit_lifecycle.non_owner').result = { version: 1, entity_id: 'x', rule: 'missing_title', items: [], has_more: false, next_cursor: null };
    });
    assert.notEqual(r.status, 0);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('rejects an unpaired cursor', async () => {
  const dir = await isolatedCopy();
  try {
    const r = await measured(dir, (results) => {
      obs(results, 'htp.website_url_lifecycle.unpaired_cursor').result = { version: 1, entity_id: 'x', items: [], has_more: false, next_cursor: null };
    });
    assert.notEqual(r.status, 0);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('rejects an out-of-range limit', async () => {
  const dir = await isolatedCopy();
  try {
    const r = await measured(dir, (results) => {
      obs(results, 'htp.website_audit_lifecycle.limit_out_of_range').result = { version: 1, entity_id: 'x', rule: 'missing_title', items: [], has_more: false, next_cursor: null };
    });
    assert.notEqual(r.status, 0);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('rejects a write effect on a parity read', async () => {
  const dir = await isolatedCopy();
  try {
    const r = await measured(dir, (results) => {
      obs(results, 'htp.website_audit_lifecycle.owner.page').effects.writes = 1;
    });
    assert.notEqual(r.status, 0);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('rejects a collection effect on a parity read', async () => {
  const dir = await isolatedCopy();
  try {
    const r = await measured(dir, (results) => {
      obs(results, 'htp.website_remediation_list.owner.page').effects.collectionRegistered = true;
    });
    assert.notEqual(r.status, 0);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('rejects a surplus field on a parity read', async () => {
  const dir = await isolatedCopy();
  try {
    const r = await measured(dir, (results) => {
      obs(results, 'htp.website_audit_lifecycle.owner.page').result.surplus = true;
    });
    assert.notEqual(r.status, 0);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('rejects vendored validator drift', async () => {
  const dir = await isolatedCopy();
  try {
    await writeFile(join(dir, 'contract/parity-reads-1.4/scripts/parity-read-contract.mjs'), 'drift');
    const r = run(dir);
    assert.notEqual(r.status, 0);
    assert.match(r.stderr || r.stdout, /contract drift/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('rejects vendored availability validator drift', async () => {
  const dir = await isolatedCopy();
  try {
    await writeFile(join(dir, 'contract/parity-reads-1.4/scripts/audit-read-availability.mjs'), 'drift');
    const r = run(dir);
    assert.notEqual(r.status, 0);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('rejects conformance drift', async () => {
  const dir = await isolatedCopy();
  try {
    await writeFile(join(dir, 'contract/parity-reads-1.4/docs/plugin-contract/v1.4/conformance.json'), 'drift');
    const r = run(dir);
    assert.notEqual(r.status, 0);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('rejects lock commit drift', async () => {
  const dir = await isolatedCopy();
  try {
    const lockPath = join(dir, 'contract/parity-reads-1.4.lock.json');
    const lock = JSON.parse(await readFile(lockPath, 'utf8'));
    lock.canonicalCommit = '0'.repeat(40);
    await writeFile(lockPath, JSON.stringify(lock));
    const r = run(dir);
    assert.notEqual(r.status, 0);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('rejects a host skill missing a 1.4 tool', async () => {
  const dir = await isolatedCopy();
  try {
    const skill = join(dir, 'skills/lifecycle-remediation/SKILL.md');
    const text = await readFile(skill, 'utf8');
    await writeFile(skill, text.replaceAll('website_remediation_list', 'removed_read'));
    const r = run(dir);
    assert.notEqual(r.status, 0);
    assert.match(r.stderr || r.stdout, /website_remediation_list/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('rejects a host skill missing an availability code', async () => {
  const dir = await isolatedCopy();
  try {
    const skill = join(dir, 'skills/lifecycle-remediation/SKILL.md');
    const text = await readFile(skill, 'utf8');
    await writeFile(skill, text.replaceAll('producer_active', 'removed_code'));
    const r = run(dir);
    assert.notEqual(r.status, 0);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('rejects a host skill missing the held-is-not-empty gate', async () => {
  const dir = await isolatedCopy();
  try {
    const skill = join(dir, 'skills/lifecycle-remediation/SKILL.md');
    const text = await readFile(skill, 'utf8');
    await writeFile(skill, text.replaceAll('**not** an empty history', 'an empty history'));
    const r = run(dir);
    assert.notEqual(r.status, 0);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('rejects shared-skill drift against the baseline pin', async () => {
  const dir = await isolatedCopy();
  try {
    await writeFile(join(dir, 'skills/website-management/SKILL.md'), 'drift');
    const r = run(dir);
    assert.notEqual(r.status, 0);
    assert.match(r.stderr || r.stdout, /baseline-pre-r5-46f6b81a anchor/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('rejects a capability module without the 1.4 gates', async () => {
  const dir = await isolatedCopy();
  try {
    await writeFile(join(dir, 'extensions/htp-pi/lib/capabilities.mjs'), 'export const PACKAGE_VERSION = "1.0.0";');
    const r = run(dir);
    assert.notEqual(r.status, 0);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
