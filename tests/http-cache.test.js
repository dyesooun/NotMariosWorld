import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameServer } from '../server/index.js';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

async function fixture(t, staticRoot = null) {
  const owned = staticRoot || await mkdtemp(path.join(os.tmpdir(), 'nmw-cache-'));
  if (!staticRoot) { await mkdir(path.join(owned, 'assets')); await writeFile(path.join(owned, 'index.html'), '<!doctype html>'); await writeFile(path.join(owned, 'assets', 'sample.js'), 'export const value=1;'); }
  const server=createGameServer({port:0,host:'127.0.0.1',staticRoot:owned}); await server.listen(); t.after(async()=>{await server.close();if(!staticRoot)await rm(owned,{recursive:true,force:true});});
  return `http://127.0.0.1:${server.httpServer.address().port}`;
}

test('HTML and health stay no-store while static assets revalidate with strong ETags', async t => {
  const origin=await fixture(t);
  const html=await fetch(`${origin}/`), health=await fetch(`${origin}/health`), asset=await fetch(`${origin}/assets/sample.js`);
  assert.equal(html.headers.get('cache-control'),'no-store'); assert.equal(health.headers.get('cache-control'),'no-store');
  assert.equal(asset.status,200); assert.match(asset.headers.get('cache-control'),/must-revalidate/); assert.match(asset.headers.get('etag'),/^"[a-f0-9]{64}"$/);
  const conditional=await fetch(`${origin}/assets/sample.js`,{headers:{'if-none-match':`W/${asset.headers.get('etag')}`}});
  assert.equal(conditional.status,304); assert.equal((await conditional.arrayBuffer()).byteLength,0);
  const head=await fetch(`${origin}/assets/sample.js`,{method:'HEAD'}); assert.equal(head.status,200); assert.equal((await head.arrayBuffer()).byteLength,0); assert.equal(head.headers.get('etag'),asset.headers.get('etag'));
  for (const validator of ['*', `"unrelated", W/${asset.headers.get('etag')}`]) {
    const response=await fetch(`${origin}/assets/sample.js`,{headers:{'if-none-match':validator}});
    assert.equal(response.status,304); assert.equal((await response.arrayBuffer()).byteLength,0);
  }
  for (const [url,method,status] of [['/missing','GET',404],['/%zz','GET',400],['/assets/sample.js','POST',405]]) {
    const response=await fetch(origin+url,{method});
    assert.equal(response.status,status); assert.equal(response.headers.get('cache-control'),'no-store');
  }
});

test('changed static bytes receive a new ETag instead of a stale 304', async t => {
  const root=await mkdtemp(path.join(os.tmpdir(), 'nmw-cache-change-')); await mkdir(path.join(root,'assets')); await writeFile(path.join(root,'index.html'),'shell'); await writeFile(path.join(root,'assets','sample.js'),'one');
  const origin=await fixture(t,root); t.after(()=>rm(root,{recursive:true,force:true}));
  const first=await fetch(`${origin}/assets/sample.js`); const old=first.headers.get('etag'); await writeFile(path.join(root,'assets','sample.js'),'two');
  const next=await fetch(`${origin}/assets/sample.js`,{headers:{'if-none-match':old}}); assert.equal(next.status,200); assert.notEqual(next.headers.get('etag'),old); assert.equal(await next.text(),'two');
});
