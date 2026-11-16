import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, cpSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
const checker=resolve('scripts/check-provider-request-readiness.mjs');
const fixtures=JSON.parse(readFileSync('contract/provider-request-1.1/docs/plugin-contract/v1.1/conformance.json'));
function measured() {
  const r={contractVersion:'1.1.0',host:'pi',observations:fixtures.scenarios.map(s=>({id:s.id,steps:s.steps.map(t=>structuredClone(t.expected))}))}, shift=30*86400000;
  const key = k => /^[A-Za-z0-9._~-]{1,128}$/.test(k) ? (k.length===128 ? 'y'.repeat(128) : 'pg17~run.'+k) : k;
  const stamp = v => new Date(Date.parse(v)+shift).toISOString();
  const assoc = a => ({...a,fqdn:'measured.example.test',propertyId:typeof a.propertyId==='string' && /^\d+$/.test(a.propertyId) ? '900'+a.propertyId : a.propertyId});
  for (let i=0;i<r.observations.length;i++) {
    const o=r.observations[i], s=fixtures.scenarios[i];
    o.context={evidenceRefs:['evidence://pg17/run-7/transactions-and-wire.json'],steps:s.steps.map(t=>({
      id:t.id, now:stamp(t.now), request:{...structuredClone(t.request),websiteId:t.request.websiteId==='site-a' ? '8f000000-0000-4000-8000-000000000001' : '8f000000-0000-4000-8000-000000000002',requestKey:key(t.request.requestKey),input:{...t.request.input,...(/^\d+$/.test(t.request.input.propertyId ?? '') ? {propertyId:'900'+t.request.input.propertyId} : {})}},association:assoc(t.association),
      ...(t.workBefore ? {workBefore:structuredClone(t.workBefore)} : {}),
      ...(t.committedAfterLoss ? {committedAfterLoss:{...t.committedAfterLoss,requestKey:key(t.committedAfterLoss.requestKey),expiresAt:stamp(t.committedAfterLoss.expiresAt),association:assoc(t.committedAfterLoss.association)}} : {})
    }))};
    let previous=-Infinity;
    for (const t of o.context.steps) { previous=Math.max(previous,Date.parse(t.now)); t.now=new Date(previous).toISOString(); }
    for (const t of o.steps) if (t.collection) t.collection={...t.collection,requestKey:key(t.collection.requestKey),expiresAt:stamp(t.collection.expiresAt),association:assoc(t.collection.association)};
  }
  // Real retry/read measurements need not use the fixture's one-day spacing.
  const t=r.observations.find(o=>o.id==='google.retry.reconcile').context.steps;
  t[1].now=new Date(Date.parse(t[0].now)+15000).toISOString();
  t[2].now=new Date(Date.parse(t[0].now)+17000).toISOString();
  return r;
}
function run(value, mutate) {
 const dir=mkdtempSync(join(tmpdir(),'pi-readiness-'));
 try { cpSync('contract',join(dir,'contract'),{recursive:true}); cpSync('scripts',join(dir,'scripts'),{recursive:true}); if(mutate) mutate(dir); let args=[]; if(value){const f=join(dir,'results.json');writeFileSync(f,JSON.stringify(value));args=['--provider-results',f];} return spawnSync(process.execPath,[join(dir,'scripts/check-provider-request-readiness.mjs'),...args],{cwd:dir,encoding:'utf8'}); } finally {rmSync(dir,{recursive:true,force:true});}
}
test('complete measured contexts pass',()=>{const r=run(measured());assert.equal(r.status,0,r.stderr);assert.match(r.stdout,/Measured context/);});
test('reject another host',()=>{const v=measured();v.host='codex';assert.notEqual(run(v).status,0);});
test('reject erased rejection case',()=>{const v=measured();const s=v.observations.find(x=>x.id==='google.conflict');s.steps.find(x=>x.error).error={code:'UNAVAILABLE'};assert.notEqual(run(v).status,0);});
test('reject association drift',()=>{const v=measured();v.observations[0].steps[0].collection.association.propertyId='wrong';assert.notEqual(run(v).status,0);});
test('reject source drift',()=>{assert.notEqual(run(null,d=>writeFileSync(join(d,'contract/provider-request-1.1/plugins/htp/skills/website-management/SKILL.md'),'drift')).status,0);});
