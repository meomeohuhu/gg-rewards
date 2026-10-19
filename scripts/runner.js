import {chromium} from 'playwright';
import {readFileSync,mkdirSync,openSync,closeSync,unlinkSync} from 'node:fs';
import path from 'node:path';
const dir=path.resolve(process.env.DATA_DIR||'.local');const endpoint=process.env.DASHBOARD_URL||'http://127.0.0.1:3000';
if(!['localhost','127.0.0.1'].includes(new URL(endpoint).hostname))throw Error('Runner chỉ kết nối dashboard trên máy cục bộ.');
const token=readFileSync(path.join(dir,'runner-token'),'utf8').trim();
const extension=path.resolve('.local/search-auto');readFileSync(path.join(extension,'manifest.json'));
const lock=path.join(dir,'runner.lock');let lockFd;try{lockFd=openSync(lock,'wx',0o600);}catch{throw Error('Đã có runner hoặc còn runner.lock từ lần dừng đột ngột. Đảm bảo không có runner trước khi xóa lock.');}
let context,stopped=false;async function cleanup(){stopped=true;await context?.close().catch(()=>{});try{closeSync(lockFd);unlinkSync(lock);}catch{}}
process.on('SIGINT',()=>cleanup().then(()=>process.exit()));process.on('SIGTERM',()=>cleanup().then(()=>process.exit()));
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function api(route,data){const r=await fetch(endpoint+'/api/runner/'+route,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify(data),signal:AbortSignal.timeout(10000)});const d=await r.json();if(!r.ok)throw Error(d.error);return d;}
console.log('Edge runner đã kết nối. Mỗi tài khoản dùng một user-data-dir riêng.');
try{while(!stopped){let job;try{const task=await api('poll',{});job=task.job;if(!job){await pause(2000);continue;}
const profile=path.join(dir,'edge-profiles',task.account.id);mkdirSync(profile,{recursive:true});
const launch={headless:false,ignoreDefaultArgs:['--disable-extensions'],args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`]};
if(process.env.EDGE_EXECUTABLE)launch.executablePath=process.env.EDGE_EXECUTABLE;else launch.channel='msedge';
context=await chromium.launchPersistentContext(profile,launch);
let closed=false;context.on('close',()=>closed=true);
const beat=async(progress)=>{const d=await api('update',{jobId:job.id,progress});if(d.stop){await context.close();throw Object.assign(Error('Đã dừng theo yêu cầu'),{cancelled:true});}};
if(job.kind==='login'){
const p=await context.newPage();await p.goto('https://rewards.bing.com/',{waitUntil:'domcontentloaded'});console.log(`Đăng nhập ${task.account.email} trong Edge, kiểm tra đúng tài khoản rồi đóng cửa sổ. Không nhập mật khẩu vào web quản lý.`);
const deadline=Date.now()+15*60*1000;while(!closed&&Date.now()<deadline){await beat();await pause(2000);}if(!closed)throw Error('Hết 15 phút chờ đăng nhập');await api('update',{jobId:job.id,status:'profile_saved',message:'Đã đóng và lưu hồ sơ Edge; cần kiểm tra đúng tài khoản khi chạy.'});
}else{
let worker=context.serviceWorkers()[0];if(!worker)worker=await context.waitForEvent('serviceworker',{timeout:20000});
const extId=new URL(worker.url()).host;const popup=await context.newPage();await popup.goto(`chrome-extension://${extId}/popup.html`);await pause(1500);
// Request only the upstream extension's documented start/stop actions.
const result=await popup.evaluate(async searches=>chrome.runtime.sendMessage({action:'start',searches}),job.settings);
if(!result?.success)throw Error(result?.message||'Tiện ích không chấp nhận lệnh chạy');
const deadline=Date.now()+45*60*1000;let runtime;
while(Date.now()<deadline){await pause(2000);if(closed)throw Error('Cửa sổ Edge đã đóng trước khi nhiệm vụ kết thúc');
const config=await popup.evaluate(async()=> (await chrome.storage.local.get('config')).config);runtime=config?.runtime;
await beat({desktop:runtime?.pcSearch,mobile:runtime?.mobileSearch});if(runtime&&runtime.running===0)break;
}
if(!runtime||runtime.running!==0)throw Error('Hết thời gian 45 phút chờ tiện ích');
if(runtime.failed>0)throw Error(`Tiện ích báo ${runtime.failed} lượt lỗi. Kiểm tra đăng nhập / quyền truy cập Rewards trong Edge.`);
await api('update',{jobId:job.id,status:'finished_unverified',message:'Tiện ích đã kết thúc lượt chạy. Chưa xác minh điểm được Microsoft ghi nhận; kiểm tra Rewards trong hồ sơ Edge.'});
}
}catch(e){console.error(e.message);if(job)await api('update',{jobId:job.id,status:e.cancelled?'cancelled':'error',message:e.message}).catch(console.error);else await pause(3000);
}finally{await context?.close().catch(()=>{});context=null;}}
}finally{await cleanup();}
