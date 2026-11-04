import type { Request, Response } from 'express';
import { env } from '../../../config/env.js';

const page = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Cutilora | System Monitoring</title>
<style>
:root{color-scheme:dark;--bg:#0b1020;--panel:#121a2d;--line:#26334d;--text:#e8edf7;--muted:#96a4bb;--accent:#7c9cff;--danger:#ff7777}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:14px/1.5 system-ui,Arial}main{max-width:1400px;margin:auto;padding:28px 20px}
h1{font-size:23px;margin:0}h2{font-size:16px;margin:0 0 14px}.muted{color:var(--muted)}.panel,.stat{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:18px}
#login{max-width:420px;margin:8vh auto}.field{display:flex;flex-direction:column;gap:6px;margin:12px 0}
input,select,button{font:inherit;color:var(--text);background:#0c1426;border:1px solid var(--line);border-radius:8px;padding:10px}button{cursor:pointer;background:#263b70}button.secondary{background:#182238}
.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:16px}.stat strong{display:block;font-size:25px;margin-top:5px}
.filters{display:grid;grid-template-columns:repeat(4,minmax(120px,1fr));gap:10px;margin-bottom:12px}.top,.actions,.footer{display:flex;justify-content:space-between;align-items:center;gap:10px}
.table-wrap{overflow:auto}table{width:100%;border-collapse:collapse;min-width:800px}th,td{text-align:left;padding:10px;border-bottom:1px solid var(--line);vertical-align:top}th{color:var(--muted);font-size:12px}
td.message{max-width:420px;overflow-wrap:anywhere}.level{text-transform:uppercase;font-size:11px;font-weight:700}.error,.fatal{color:var(--danger)}.warn{color:#f4c56b}
.timeline{display:flex;flex-wrap:wrap;gap:8px}.day{padding:8px;border:1px solid var(--line);border-radius:8px;background:#0c1426}
.hidden{display:none!important}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#0a1120;padding:14px;border-radius:8px;max-height:55vh;overflow:auto}
#notice,#loginError{color:var(--danger);min-height:20px;margin-top:10px}.footer{margin-top:14px}
@media(max-width:800px){.grid{grid-template-columns:repeat(2,1fr)}.filters{grid-template-columns:repeat(2,1fr)}}@media(max-width:500px){main{padding:14px 10px}.top{align-items:flex-start;flex-direction:column}}
</style></head><body><main>
<section id="login" class="panel"><h1>System monitoring</h1><p class="muted">Sign in with a platform administrator account.</p>
<form id="loginForm"><label class="field">Email<input id="email" type="email" autocomplete="username" required></label>
<label class="field">Password<input id="password" type="password" autocomplete="current-password" required></label>
<button type="submit">Sign in</button><div id="loginError" role="alert"></div></form></section>
<section id="dashboard" class="hidden">
<header class="top"><div><h1>Cutilora system monitoring</h1><span class="muted">Application logs · newest first</span></div><div class="actions"><button id="refresh" class="secondary">Refresh</button><button id="logout" class="secondary">Sign out</button></div></header>
<div class="grid"><div class="stat"><span class="muted">Total logs (7 days)</span><strong id="total">—</strong></div><div class="stat"><span class="muted">Errors</span><strong id="errors">—</strong></div><div class="stat"><span class="muted">Warnings</span><strong id="warnings">—</strong></div><div class="stat"><span class="muted">Fatal</span><strong id="fatals">—</strong></div></div>
<section class="panel" style="margin-bottom:16px"><h2>Activity timeline · 7 days</h2><div id="timeline" class="timeline muted">Loading…</div></section>
<section class="panel"><h2>Log entries</h2><div class="filters">
<select id="level"><option value="">All levels</option><option>debug</option><option>info</option><option>warn</option><option>error</option><option>fatal</option></select>
<select id="category"><option value="">All categories</option><option>http</option><option>auth</option><option>authorization</option><option>database</option><option>business</option><option>security</option><option>system</option><option>application</option></select>
<input id="module" placeholder="Module"><input id="statusCode" placeholder="HTTP status" inputmode="numeric">
<input id="search" placeholder="Search message"><input id="from" type="datetime-local"><input id="to" type="datetime-local"></div>
<div class="actions" style="justify-content:flex-start;margin-bottom:12px"><button id="apply">Apply filters</button><button id="clear" class="secondary">Clear</button><span id="resultCount" class="muted"></span></div>
<div class="table-wrap"><table><thead><tr><th>Time</th><th>Level</th><th>Category</th><th>Module</th><th>Message</th><th>Status</th><th></th></tr></thead><tbody id="rows"></tbody></table></div>
<div class="footer"><span id="pageInfo" class="muted"></span><div class="actions"><button id="prev" class="secondary">Previous</button><button id="next" class="secondary">Next</button></div></div></section>
<section id="detail" class="panel hidden" style="margin-top:16px"><div class="top"><h2>Log details</h2><button id="closeDetail" class="secondary">Close</button></div><pre id="detailContent"></pre></section>
<div id="notice" role="alert"></div></section></main>
<script>
(function(){
const PREFIX="__API_PREFIX__", API=PREFIX+"/platform/monitoring", AUTH=PREFIX+"/auth/login";
const $=id=>document.getElementById(id);let token=sessionStorage.getItem("cutilora_monitoring_token")||"",page=1,pages=1;
function msg(id,value){$(id).textContent=value||""}
function signOut(){token="";sessionStorage.removeItem("cutilora_monitoring_token");$("dashboard").classList.add("hidden");$("login").classList.remove("hidden")}
function show(){ $("login").classList.add("hidden");$("dashboard").classList.remove("hidden");loadAll() }
async function api(url){const r=await fetch(url,{headers:{Authorization:"Bearer "+token,Accept:"application/json"}}),b=await r.json().catch(()=>({}));if(r.status===401||r.status===403){signOut();throw Error(b.error?.message||"Not authorized")}if(!r.ok)throw Error(b.error?.message||"Request failed: "+r.status);return b.data}
$("loginForm").addEventListener("submit",async e=>{e.preventDefault();msg("loginError","Signing in…");try{
const r=await fetch(AUTH,{method:"POST",headers:{"Content-Type":"application/json",Accept:"application/json"},body:JSON.stringify({email:$("email").value,password:$("password").value})}),b=await r.json();
if(!r.ok)throw Error(b.error?.message||"Sign in failed");token=b.data.access_token;
const me=await fetch(PREFIX+"/auth/me",{headers:{Authorization:"Bearer "+token}}),u=await me.json();
if(!me.ok||u.data?.user?.platformRole!=="platform_admin"&&u.data?.user?.platform_role!=="platform_admin")throw Error("Platform administrator access required");
sessionStorage.setItem("cutilora_monitoring_token",token);msg("loginError","");show();
}catch(err){msg("loginError",err.message);token="";sessionStorage.removeItem("cutilora_monitoring_token")}});
function qs(){const p=new URLSearchParams({page:String(page),limit:"25"});["level","category","module","statusCode","search","from","to"].forEach(k=>{if($(k).value)p.set(k,$(k).value)});return p.toString()}
function cell(tr,value,cls){const td=document.createElement("td");td.textContent=value==null?"—":String(value);if(cls)td.className=cls;tr.appendChild(td);return td}
async function loadLogs(){const d=await api(API+"/logs?"+qs()),body=$("rows");body.replaceChildren();(d.items||[]).forEach(x=>{
const tr=document.createElement("tr");cell(tr,new Date(x.occurredAt).toLocaleString());cell(tr,x.level,"level "+x.level);cell(tr,x.category);cell(tr,x.module);cell(tr,x.message,"message");cell(tr,x.statusCode);
const td=cell(tr,""),btn=document.createElement("button");btn.className="secondary";btn.textContent="View";btn.addEventListener("click",()=>detail(x._id));td.appendChild(btn);body.appendChild(tr)});
if(!d.items?.length){const tr=document.createElement("tr"),td=cell(tr,"No logs found.");td.colSpan=7;body.appendChild(tr)}
const p=d.pagination||{};page=p.page||1;pages=p.pages||1;msg("resultCount",(p.total||0)+" records");msg("pageInfo","Page "+page+" of "+pages);$("prev").disabled=page<=1;$("next").disabled=page>=pages}
async function loadStats(){const d=await api(API+"/logs/stats"),c={};(d.byLevel||[]).forEach(x=>c[x._id]=x.count);msg("total",d.total||0);msg("errors",c.error||0);msg("warnings",c.warn||0);msg("fatals",c.fatal||0);
const t=$("timeline");t.replaceChildren();(d.timeline||[]).forEach(x=>{const el=document.createElement("span");el.className="day";el.textContent=x._id+": "+x.count+" logs ("+x.errors+" errors)";t.appendChild(el)});if(!d.timeline?.length)t.textContent="No activity in this period."}
async function detail(id){try{const d=await api(API+"/logs/"+encodeURIComponent(id));$("detailContent").textContent=JSON.stringify(d,null,2);$("detail").classList.remove("hidden");$("detail").scrollIntoView({behavior:"smooth"})}catch(e){msg("notice",e.message)}}
async function loadAll(){msg("notice","");try{await Promise.all([loadLogs(),loadStats()])}catch(e){msg("notice",e.message)}}
$("apply").addEventListener("click",()=>{page=1;loadLogs().catch(e=>msg("notice",e.message))});
$("clear").addEventListener("click",()=>{["level","category","module","statusCode","search","from","to"].forEach(k=>$(k).value="");page=1;loadLogs().catch(e=>msg("notice",e.message))});
$("refresh").addEventListener("click",loadAll);$("logout").addEventListener("click",signOut);$("prev").addEventListener("click",()=>{if(page>1){page--;loadLogs().catch(e=>msg("notice",e.message))}});$("next").addEventListener("click",()=>{if(page<pages){page++;loadLogs().catch(e=>msg("notice",e.message))}});$("closeDetail").addEventListener("click",()=>$("detail").classList.add("hidden"));
if(token)show();
})();
</script></body></html>`;

export const monitoringViewController = {
  show(_req: Request, res: Response) {
    const html = page.replaceAll('__API_PREFIX__', env.API_PREFIX.replace(/\/$/, ''));
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'");
    return res.status(200).send(html);
  },
};
