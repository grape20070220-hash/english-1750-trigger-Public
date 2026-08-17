import webpush from 'web-push';

const API=String(process.env.DATA_API_URL||'').replace(/\/$/,'');
const TOKEN=String(process.env.OIDC_TOKEN||'');
if(!API||!TOKEN)throw new Error('DATA_API_URL or OIDC_TOKEN is missing');

async function rpc(name,args={}){
  const r=await fetch(`${API}/rpc/${name}`,{method:'POST',headers:{Authorization:`Bearer ${TOKEN}`,'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify(args)});
  const text=await r.text();
  if(!r.ok)throw new Error(`${name} failed ${r.status}: ${text.slice(0,500)}`);
  try{return text?JSON.parse(text):null}catch{return text}
}
function cleanTimes(xs){if(!Array.isArray(xs))return[];const now=Date.now(),lo=now-365*86400000,hi=now+366*86400000;return xs.map(Number).filter(t=>Number.isFinite(t)&&t>lo&&t<hi).slice(0,2000).sort((a,b)=>a-b)}
function prefs(p={}){return{enabled:p.enabled!==false,dueAlerts:p.dueAlerts!==false,morningEnabled:!!p.morningEnabled,morningTime:/^([01]\d|2[0-3]):[0-5]\d$/.test(String(p.morningTime||''))?String(p.morningTime):'07:30',eveningEnabled:p.eveningEnabled!==false,eveningTime:/^([01]\d|2[0-3]):[0-5]\d$/.test(String(p.eveningTime||''))?String(p.eveningTime):'20:00'}}
function localClock(tz){try{const a=new Intl.DateTimeFormat('en-CA',{timeZone:tz||'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date()),o=Object.fromEntries(a.filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));return{date:`${o.year}-${o.month}-${o.day}`,minutes:+o.hour*60 + +o.minute}}catch{const d=new Date();return{date:d.toISOString().slice(0,10),minutes:d.getUTCHours()*60+d.getUTCMinutes()}}}
const toMin=s=>{const[h,m]=String(s).split(':').map(Number);return h*60+m};

const batch=await rpc('scheduler_batch');
if(!batch?.vapid_public||!batch?.vapid_private||!Array.isArray(batch?.devices))throw new Error('scheduler_batch returned invalid data');
webpush.setVapidDetails('mailto:english1750@example.invalid',batch.vapid_public,batch.vapid_private);
let sent=0,failed=0,removed=0;

async function recordSent(rec,{dueAlertAt=null,morningDate=null,eveningDate=null,clearTest=false}={}){
  await rpc('scheduler_record_sent',{p_endpoint:rec.endpoint,p_due_alert_at:dueAlertAt,p_morning_date:morningDate,p_evening_date:eveningDate,p_clear_test:clearTest});
}
async function send(rec,payload,mark={}){
  try{
    await webpush.sendNotification(rec.subscription,JSON.stringify(payload),{TTL:86400,urgency:'normal'});
    await recordSent(rec,mark); sent++; rec.last_any_push_at=Date.now(); if(mark.dueAlertAt)rec.last_due_alert_at=mark.dueAlertAt; return true;
  }catch(err){
    const code=Number(err?.statusCode||0),msg=String(err?.statusCode||err?.message||err).slice(0,500),remove=code===404||code===410;
    await rpc('scheduler_record_failure',{p_endpoint:rec.endpoint,p_error:msg,p_remove:remove}).catch(()=>{});
    failed++; if(remove)removed++; console.warn('Push failed',code||'',msg); return false;
  }
}

for(const rec of batch.devices){
  const p=prefs(rec.prefs||{}); if(!p.enabled)continue;
  const now=Date.now(),times=cleanTimes(rec.due_times),due=times.filter(t=>t<=now).length;
  if(rec.test_requested_at&&Number(rec.test_requested_at)>Number(rec.last_any_push_at||0)){
    await send(rec,{title:'✅ English 1750 通知テスト',body:due?`通知は正常です。現在の復習は ${due} 語です。`:'通知は正常です。復習期限が来るとここに届きます。',url:'./?page=review',tag:'english1750-test'},{clearTest:true});
    continue;
  }
  if(!due)continue;
  const c=localClock(rec.timezone||'Asia/Tokyo'),mt=toMin(p.morningTime),et=toMin(p.eveningTime); let scheduled=false;
  if(p.morningEnabled&&rec.last_morning_date!==c.date&&c.minutes>=mt&&c.minutes<=Math.min(720,mt+180)){
    if(await send(rec,{title:'☀️ 朝の英語復習',body:`復習期限の単語が ${due} 語あります。`,url:'./?page=review',tag:'english1750-morning'},{dueAlertAt:now,morningDate:c.date}))scheduled=true;
  }
  if(!scheduled&&p.eveningEnabled&&rec.last_evening_date!==c.date&&c.minutes>=et){
    if(await send(rec,{title:'📚 今日の復習が残っています',body:`今日の復習：${due} 語。通知からそのまま復習できます。`,url:'./?page=review',tag:'english1750-evening'},{dueAlertAt:now,eveningDate:c.date}))scheduled=true;
  }
  const last=Number(rec.last_due_alert_at||0),newly=times.filter(t=>t<=now&&t>last).length,cool=now-Number(rec.last_any_push_at||0)>=15*60*1000;
  if(!scheduled&&p.dueAlerts&&newly>0&&cool){
    await send(rec,{title:'🔁 復習の時間です',body:`新たに ${newly} 語が復習期限に到達しました（現在 ${due} 語）。`,url:'./?page=review',tag:'english1750-due'},{dueAlertAt:now});
  }
}
console.log(JSON.stringify({ok:true,processed:batch.devices.length,sent,failed,removed}));
