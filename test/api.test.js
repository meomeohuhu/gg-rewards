import {test} from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,readFile,rm} from 'node:fs/promises';import os from 'node:os';import path from 'node:path';
test('Account persistence, sequential runner, cancellation and validation',async()=>{
const dir=await mkdtemp(path.join(os.tmpdir(),'gg-test-'));process.env.DATA_DIR=dir;
const {server}=await import('../server.js');await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;const token=await readFile(path.join(dir,'runner-token'),'utf8');
async function api(route,b,auth){const r=await fetch(base+'/api/'+route,{method:b===undefined?'GET':'POST',headers:{'Content-Type':'application/json',...(auth?{Authorization:'Bearer '+token}:{})},body:b===undefined?undefined:JSON.stringify(b)});return {status:r.status,data:await r.json()};}
try{
assert.equal((await api('accounts',{email:'invalid'})).status,400);
const a=(await api('accounts',{email:'a@example.com',name:'A'})).data;const b=(await api('accounts',{email:'b@example.com'})).data;
assert.equal((await api('accounts',{email:'A@example.com'})).status,400);
assert.equal((await api('queue',{ids:[a.id,b.id],kind:'run'})).data.count,2);
assert.equal((await api('queue',{ids:[a.id],kind:'run'})).data.count,0);
assert.equal((await api('runner/poll',{})).status,401);
assert.equal((await api('runner/poll',{},true)).data.job.accountId,a.id);
assert.equal((await api('runner/poll',{},true)).data.job,null);
assert.equal((await api('delete',{ids:[a.id]})).status,400);
const first=(await api('state')).data.jobs[0];
await api('runner/update',{jobId:first.id,status:'finished_unverified',message:'test'},true);
assert.equal((await api('runner/poll',{},true)).data.job.accountId,b.id);
await api('stop',{});const second=(await api('state')).data.jobs[1];
assert.equal((await api('runner/update',{jobId:second.id},true)).data.stop,true);
await api('runner/update',{jobId:second.id,status:'cancelled'},true);
assert.equal((await api('runner/poll',{},true)).data.job,null);
assert.equal((await api('settings',{desk:31,mob:21,min:1,max:14})).status,400);
assert.equal((await api('settings',{desk:31,mob:21,min:7,max:14})).status,200);
const persisted=JSON.parse(await readFile(path.join(dir,'data.json'),'utf8'));assert.equal(persisted.accounts.length,2);assert.equal(persisted.accounts[0].points,null);
const r=await fetch(base+'/api/stop',{method:'POST',headers:{Origin:'https://evil.example','Content-Type':'application/json'},body:'{}'});assert.equal(r.status,403);
assert.equal((await fetch(base+'/.local/runner-token')).status,404);
}finally{await new Promise(r=>server.close(r));await rm(dir,{recursive:true,force:true});}
});
