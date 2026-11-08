import test from 'node:test';
import assert from 'node:assert/strict';
import { createEditorServer } from '../server.mjs';
import http from 'node:http';

let server, base;
test.before(async()=>{server=createEditorServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));base=`http://127.0.0.1:${server.address().port}`});
test.after(()=>new Promise(resolve=>{server.closeAllConnections();server.close(resolve)}));
test('health and static assets expose expected schema and MIME',async()=>{let r=await fetch(base+'/health');assert.equal(r.status,200);let health=await r.json();assert.equal(health.app,'level-editor');r=await fetch(base+'/editor.js');assert.equal(r.status,200);assert.match(r.headers.get('content-type'),/javascript/)});
test('game export exposes a read-only index of project image paths and content hashes', async () => {
  const response = await fetch(base + '/api/project-images');
  assert.equal(response.status, 200);
  const index = await response.json();
  assert.ok(index.length > 0);
  for (const image of index) {
    assert.match(image.src, /^\/assets\/sprites\/.+\.(png|jpe?g|webp|gif|bmp)$/i);
    assert.match(image.sha256, /^[a-f0-9]{64}$/);
    assert.deepEqual(Object.keys(image).sort(), ['sha256', 'src']);
  }
  assert.equal((await fetch(base + '/api/project-images', { method: 'POST' })).status, 405);
  assert.equal((await fetch(base + '/public/game/json-level/game-export.js')).status, 200);
  const resolver=await fetch(base+'/public/game/json-level/project-image-path.js');
  assert.equal(resolver.status,200);
  assert.match(await resolver.text(),/export function compressedSiblingPath/);
  const compressed = '/assets/sprites/lobby/waiting-woods-scenery.compressed.webp';
  const original = '/assets/sprites/lobby/waiting-woods-scenery.png';
  assert.equal((await fetch(base + compressed)).status, 200);
  assert.match((await fetch(base + compressed)).headers.get('content-type'), /image\/webp/);
  assert.equal((await fetch(base + original)).status, 200);
  const toolbar = await (await fetch(base + '/')).text();
  assert.match(toolbar, /id="exportGameBtn"/);
  assert.match(toolbar, /Export editor JSON/);
});
test('editor reexports resolve to the shared browser runtime',async()=>{
  const wrapper=await fetch(base+'/level-runtime.js');
  assert.match(await wrapper.text(),/public\/game\/json-level\/level-runtime\.js/);
  const shared=await fetch(base+'/public/game/json-level/level-runtime.js');
  assert.equal(shared.status,200);
  assert.match(shared.headers.get('content-type'),/javascript/);
  assert.match(await shared.text(),/export class LevelRuntime/);
  assert.equal((await fetch(base+'/public/game/json-level/document.js')).status,200);
  const tuning=await fetch(base+'/public/game/projectiles.js');
  assert.equal(tuning.status,200);
  assert.match(await tuning.text(),/PROJECTILE_RULES/);
});
test('read-only method and traversal are rejected',async()=>{let r=await fetch(base+'/',{method:'POST'});assert.equal(r.status,405);r=await fetch(base+'/%2e%2e/%2e%2e/package.json');assert.ok([403,404].includes(r.status))});
test('foreign Host header is forbidden',async()=>{
  const status=await new Promise((resolve,reject)=>{
    const request=http.get(base+'/',{headers:{Host:'evil.example'}},response=>{response.resume();resolve(response.statusCode)});
    request.on('error',reject);
  });
  assert.equal(status,403);
});
