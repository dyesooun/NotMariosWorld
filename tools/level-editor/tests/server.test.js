import test from 'node:test';
import assert from 'node:assert/strict';
import { createEditorServer } from '../server.mjs';
import http from 'node:http';

let server, base;
test.before(async()=>{server=createEditorServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));base=`http://127.0.0.1:${server.address().port}`});
test.after(()=>new Promise(resolve=>{server.closeAllConnections();server.close(resolve)}));
test('health and static assets expose expected schema and MIME',async()=>{let r=await fetch(base+'/health');assert.equal(r.status,200);let health=await r.json();assert.equal(health.app,'level-editor');r=await fetch(base+'/editor.js');assert.equal(r.status,200);assert.match(r.headers.get('content-type'),/javascript/)});
test('editor reexports resolve to the shared browser runtime',async()=>{
  const wrapper=await fetch(base+'/level-runtime.js');
  assert.match(await wrapper.text(),/public\/game\/json-level\/level-runtime\.js/);
  const shared=await fetch(base+'/public/game/json-level/level-runtime.js');
  assert.equal(shared.status,200);
  assert.match(shared.headers.get('content-type'),/javascript/);
  assert.match(await shared.text(),/export class LevelRuntime/);
  assert.equal((await fetch(base+'/public/game/json-level/document.js')).status,200);
});
test('read-only method and traversal are rejected',async()=>{let r=await fetch(base+'/',{method:'POST'});assert.equal(r.status,405);r=await fetch(base+'/%2e%2e/%2e%2e/package.json');assert.ok([403,404].includes(r.status))});
test('foreign Host header is forbidden',async()=>{
  const status=await new Promise((resolve,reject)=>{
    const request=http.get(base+'/',{headers:{Host:'evil.example'}},response=>{response.resume();resolve(response.statusCode)});
    request.on('error',reject);
  });
  assert.equal(status,403);
});
