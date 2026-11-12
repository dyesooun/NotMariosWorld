import test from 'node:test';
import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
import { createGameServer } from '../server/index.js';

const open=async(url,perMessageDeflate=true)=>{const ws=new WebSocket(url,perMessageDeflate?{}:{perMessageDeflate:false}); ws.messages=[]; ws.on('message',raw=>{try{ws.messages.push(JSON.parse(raw));}catch{}}); await new Promise((resolve,reject)=>{ws.once('open',resolve);ws.once('error',reject);}); return ws;};
const message=async(ws,p)=>{const end=Date.now()+3000;for(;;){const i=ws.messages.findIndex(p);if(i>=0)return ws.messages.splice(i,1)[0];if(Date.now()>end)throw new Error('message timeout');await new Promise(resolve=>setTimeout(resolve,5));}};

test('localhost WebSocket clients negotiate optional per-message deflate and plain clients still work', async t => {
  for (const [enabled,clientEnabled] of [[true,true],[true,false],[false,true]]) {
    const server=createGameServer({port:0,host:'127.0.0.1',perMessageDeflate:enabled}); await server.listen(); t.after(()=>server.close());
    const url=`ws://127.0.0.1:${server.httpServer.address().port}`, ws=await open(url,clientEnabled);
    ws.send(JSON.stringify({type:'create'})); const created=await message(ws,m=>m.type==='created'); await message(ws,m=>m.type==='state');
    assert.equal(enabled&&clientEnabled,ws.extensions.includes('permessage-deflate'));
    ws.close();
  }
});
