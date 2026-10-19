import http from 'node:http';
import {readFileSync, writeFileSync, mkdirSync, renameSync} from 'node:fs';
import {randomUUID, randomBytes, timingSafeEqual} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=path.dirname(fileURLToPath(import.meta.url));
const dir=process.env.DATA_DIR || path.join(root,'.local'); mkdirSync(dir,{recursive:true});
const file=path.join(dir,'data.json');
let data; try {data=JSON.parse(readFileSync(file,'utf8'));} catch(e){if(e.code!=='ENOENT')throw e; data={accounts:[],jobs:[],logs:[],settings:{desk:31,mob:21,min:7,max:14}};}
for(const j of data.jobs) if(['running','stopping'].includes(j.status)){j.status='interrupted'; const a=data.accounts.find(a=>a.id===j.accountId);if(a)a.status='interrupted';}
let workerSeen=0;const token=randomBytes(32).toString('hex');writeFileSync(path.join(dir,'runner-token'),token,{mode:0o600});
function save(){writeFileSync(file+'.tmp',JSON.stringify(data,null,2),{mode:0o600});renameSync(file+'.tmp',file);}
function log(message){data.logs.unshift({id:randomUUID(),time:new Date().toISOString(),message});data.logs=data.logs.slice(0,500);}
const active=['queued','running','stopping'];
function check(cond,message){if(!cond)throw Object.assign(new Error(message),{status:400});}
function num(v,max){return Number.isInteger(v)&&v>=0&&v<=max;}
async function body(req){let b='';for await(const c of req){b+=c;if(b.length>100000)throw Object.assign(new Error('Dữ liệu quá lớn'),{status:413});}return b?JSON.parse(b):{};}
function authorized(req){const b=Buffer.from((req.headers.authorization||'').replace(/^Bearer /,''));const a=Buffer.from(token);return a.length===b.length&&timingSafeEqual(a,b);}
export const server=http.createServer(async(req,res)=>{const json=(v,status=200)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(v));};try{
const url=new URL(req.url,'http://localhost');
if(url.pathname.startsWith('/api/')){
if(req.headers.origin&&req.headers.origin!==`http://${req.headers.host}`)return json({error:'Origin không hợp lệ'},403);
if(url.pathname.startsWith('/api/runner')&&!authorized(req))return json({error:'Runner chưa xác thực'},401);
const b=req.method==='POST'?await body(req):{};
if(req.method==='GET'&&url.pathname==='/api/state')return json({...data,workerOnline:Date.now()-workerSeen<15000});
if(req.method==='POST'&&url.pathname==='/api/accounts'){
check(typeof b.email==='string'&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(b.email),'Email không hợp lệ');const email=b.email.trim().toLowerCase();check(!data.accounts.some(a=>a.email===email),'Tài khoản đã tồn tại');
const a={id:randomUUID(),email,name:String(b.name||email.split('@')[0]).slice(0,80),status:'needs_login',points:null,today:null,desktop:null,mobile:null,lastRun:null};data.accounts.push(a);log(`Đã thêm ${email}`);save();return json(a,201);}
if(req.method==='POST'&&url.pathname==='/api/delete'){
check(Array.isArray(b.ids),'Thiếu danh sách tài khoản');check(!data.jobs.some(j=>b.ids.includes(j.accountId)&&active.includes(j.status)),'Hãy dừng hàng đợi trước khi xóa');data.accounts=data.accounts.filter(a=>!b.ids.includes(a.id));log('Đã xóa tài khoản được chọn');save();return json({ok:true});}
if(req.method==='POST'&&url.pathname==='/api/queue'){
check(Array.isArray(b.ids)&&b.ids.length>0,'Chọn ít nhất một tài khoản');check(['run','login'].includes(b.kind),'Lệnh không hợp lệ');
check(b.ids.every(id=>data.accounts.some(a=>a.id===id)),'Không tìm thấy tài khoản');let count=0;
for(const id of new Set(b.ids)){if(data.jobs.some(j=>j.accountId===id&&active.includes(j.status)))continue;data.jobs.push({id:randomUUID(),accountId:id,kind:b.kind,status:'queued',createdAt:new Date().toISOString(),settings:{...data.settings}});data.accounts.find(a=>a.id===id).status='queued';count++;}
log(`Đã xếp hàng ${count} tài khoản · ${b.kind==='login'?'mở đăng nhập':'làm nhiệm vụ'}`);save();return json({count});}
if(req.method==='POST'&&url.pathname==='/api/stop'){
for(const j of data.jobs)if(active.includes(j.status)){j.status=['running','stopping'].includes(j.status)?'stopping':'cancelled';const a=data.accounts.find(a=>a.id===j.accountId);if(a)a.status=j.status;}
log('Đã yêu cầu dừng; runner sẽ đóng trình duyệt đang chạy');save();return json({ok:true});}
if(req.method==='POST'&&url.pathname==='/api/settings'){
check(num(b.desk,100)&&num(b.mob,100)&&num(b.min,300)&&num(b.max,600)&&b.min>=7&&b.max>=b.min,'Số lượt 0–100; thời gian chờ tối thiểu 7 giây, tối đa không nhỏ hơn tối thiểu');data.settings={desk:b.desk,mob:b.mob,min:b.min,max:b.max};save();return json({ok:true});}
if(req.method==='POST'&&url.pathname==='/api/runner/poll'){
workerSeen=Date.now();const current=data.jobs.find(j=>['running','stopping'].includes(j.status));if(current)return json({job:null});const j=data.jobs.find(j=>j.status==='queued');if(!j)return json({job:null});j.status='running';j.startedAt=new Date().toISOString();const a=data.accounts.find(a=>a.id===j.accountId);a.status='running';log(`${a.email}: ${j.kind==='login'?'đang mở đăng nhập':'bắt đầu làm nhiệm vụ'}`);save();return json({job:j,account:a});}
if(req.method==='POST'&&url.pathname==='/api/runner/update'){
workerSeen=Date.now();const j=data.jobs.find(j=>j.id===b.jobId);check(j&&['running','stopping'].includes(j.status),'Lượt chạy không còn hoạt động');const a=data.accounts.find(a=>a.id===j.accountId);
if(b.status){check(['error','needs_login','finished_unverified','profile_saved','cancelled'].includes(b.status),'Trạng thái không hợp lệ');j.status=b.status;j.endedAt=new Date().toISOString();j.message=String(b.message||'').slice(0,500);a.status=b.status;a.lastRun=j.endedAt;log(`${a.email}: ${j.message||b.status}`);}
if(b.progress){a.desktop=num(b.progress.desktop,1000)?b.progress.desktop:a.desktop;a.mobile=num(b.progress.mobile,1000)?b.progress.mobile:a.mobile;}
save();return json({stop:j.status==='stopping'});}
return json({error:'Không tìm thấy API'},404);
}
const files={'/':'index.html','/app.js':'app.js','/style.css':'style.css'};const f=files[url.pathname];if(!f){res.writeHead(404);return res.end('Not found');}
res.writeHead(200,{'Content-Type':f.endsWith('.js')?'text/javascript; charset=utf-8':f.endsWith('.css')?'text/css; charset=utf-8':'text/html; charset=utf-8','Content-Security-Policy':"default-src 'self'; style-src 'self'; script-src 'self'; object-src 'none'; frame-ancestors 'none'",'X-Content-Type-Options':'nosniff'});res.end(readFileSync(path.join(root,'public',f)));
}catch(e){json({error:e instanceof SyntaxError?'JSON không hợp lệ':e.message},e.status||500);}});
if(process.argv[1]===fileURLToPath(import.meta.url)){save();server.listen(Number(process.env.PORT||3000),'127.0.0.1',()=>console.log('GG Rewards: port '+(process.env.PORT||3000)));}
