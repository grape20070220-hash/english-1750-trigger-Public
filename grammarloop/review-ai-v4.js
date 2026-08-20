(()=>{
S.aiPracticeBank=S.aiPracticeBank||{};S.aiPracticeSeen=S.aiPracticeSeen||{};save();
let q=[],pos=0,cur=null,mode='',source=null,variant=null,busy=false;
function byKey(k){return S.rev.find(r=>r.k===k)}
function scopeKey(r){return `${r.id}::${r.chapterId||'base'}`}
function seenKey(r,k){return `${r.k}|${k}`}
function preserve(updated,old){if(!updated||!old)return;for(const k of ['kind','payload','reading'])if(old[k])updated[k]=old[k];save()}
function recoverReading(r){if(r?.reading?.passage)return r.reading;if(r?.payload?.passage)return r.payload;const all=[...(BUILTIN?.[r.id]||[]),...(S.aiBank?.[r.id]||[])];return all.find(p=>p.question===r.p)||null}
async function recover(r){
  if(r?.kind==='reading'){const p=recoverReading(r);if(p)return{kind:'reading',data:p}}
  if(r?.kind==='quiz'&&r.payload)return{kind:'quiz',data:r.payload};
  if(r?.kind==='writing'&&r.payload)return{kind:'writing',data:r.payload};
  const p=recoverReading(r);if(p)return{kind:'reading',data:p};
  try{if(r.chapterId&&typeof loadThemeBook==='function'){const cs=await loadThemeBook(r.id),c=cs.find(x=>x.id===r.chapterId);if(c){if(c.quiz?.q===r.p)return{kind:'quiz',data:{q:c.quiz.q,choices:c.quiz.choices,answer:c.quiz.answer,exp:c.quiz.exp||'',context:c.form||c.summary||'',chapterTitle:c.title}};if(c.write?.ja===r.p)return{kind:'writing',data:{ja:c.write.ja,en:c.write.en,answers:[c.write.en],context:c.form||c.summary||'',chapterTitle:c.title}}}}}catch{}
  const t=topic(r.id);if(t?.quiz===r.p)return{kind:'quiz',data:{q:t.quiz,choices:t.choices,answer:t.answer,exp:t.quizExp||'',context:t.rule||''}};if(t?.writeJa===r.p)return{kind:'writing',data:{ja:t.writeJa,en:t.writeEn,answers:[t.writeEn],context:t.rule||''}};
  return{kind:'flash',data:null};
}
function dashboard(){
  const d=due(),u=(typeof tbUpcoming==='function'?tbUpcoming():S.rev.filter(r=>r.n>Date.now()).sort((a,b)=>a.n-b.n)),next=u[0];
  M.innerHTML=header('間隔復習','予定を確認し、4択・英作文はAIの別問題で思い出す')+
  `<div class="card review-guide"><span class="eyebrow">復習ロードマップ</span><h2>20分 → 1日 → 3日 → 7日 → 14日 → 30日 → 60日</h2>${typeof tbRoadmap==='function'?tbRoadmap():''}<p class="muted">不正解・答えを見た → 20分後へ戻る ／ 正解 → 次の間隔へ進む</p></div>`+
  `<div class="grid g3"><div class="card stat"><small>今すぐ復習</small><b>${d.length}</b></div><div class="card stat"><small>次の復習</small><b style="font-size:20px">${d.length?'今すぐ':next?(typeof tbWhen==='function'?tbWhen(next.n):'予定あり'):'なし'}</b></div><div class="card stat"><small>AI別問題ストック</small><b>${Object.values(S.aiPracticeBank).reduce((n,a)=>n+(a?.length||0),0)}</b></div></div>`+
  `<div class="card" style="margin-top:13px;text-align:center;padding:30px"><div style="font-size:46px">🧠</div><h2>${d.length?`${d.length}件を復習できます`:'今すぐの復習はありません'}</h2><p class="muted">4択と英作文は同じ文法ポイントのAI別問題を優先。短文読解は元の本文形式で復習します。</p>${d.length?'<button class="btn primary" data-aiv-start>今すぐ復習する</button>':'<button class="btn ghost" data-v="home">ホームへ戻る</button>'}</div>`;
}
review=dashboard;
function head(r,label){const t=topic(r.id);return header(`復習 ${pos+1} / ${q.length}`,`${label} ・ ${t?.icon||'📚'} ${t?.name||'英文法'}${r.chapterTitle?' / '+r.chapterTitle:''}`)}
function start(){q=due().map(r=>r.k);pos=0;if(!q.length)return dashboard();render()}
async function render(){
  while(pos<q.length&&!byKey(q[pos]))pos++;
  if(pos>=q.length){M.innerHTML=header('復習完了','今回の復習をすべて終えました')+`<div class="card" style="text-align:center;padding:34px"><div style="font-size:54px">✅</div><h2>復習完了！</h2><p class="muted">次回も同じ知識を別の問題で取り出します。</p><button class="btn primary" data-v="review">復習予定を見る</button></div>`;return}
  cur=byKey(q[pos]);mode='';source=null;variant=null;busy=false;
  M.innerHTML=head(cur,'準備中')+`<div class="card"><span class="spinner"></span> 復習問題を準備しています…</div>`;
  const rec=await recover(cur);if(cur!==byKey(q[pos]))return;source=rec;mode=rec.kind;
  if(mode==='quiz'||mode==='writing'){variant=await getVariant(cur,rec).catch(()=>null);if(cur!==byKey(q[pos]))return;renderPractice(cur,rec,variant)}
  else if(mode==='reading'&&rec.data)renderReading(cur,rec.data);else renderFlash(cur);
}
async function chapterContext(r,rec){
  let title=r.chapterTitle||rec.data?.chapterTitle||'',ctx=rec.data?.context||'';
  try{if(r.chapterId&&typeof loadThemeBook==='function'){const cs=await loadThemeBook(r.id),c=cs.find(x=>x.id===r.chapterId);if(c){title=c.title||title;ctx=[c.summary,c.form].filter(Boolean).join(' / ')||ctx}}}catch{}
  return{title,ctx};
}
async function getVariant(r,rec,force=false){
  const sk=scopeKey(r),kind=rec.kind,seenK=seenKey(r,kind),seen=new Set(S.aiPracticeSeen[seenK]||[]),bank=S.aiPracticeBank[sk]||[];
  let unused=bank.filter(x=>x?.id&&!seen.has(x.id));
  if(force&&unused.length)unused=unused.slice(1);
  let item=unused[0];
  if(!item){
    const cc=await chapterContext(r,rec),avoid=bank.slice(-9).flatMap(x=>[x.quiz?.q,x.writing?.ja]).filter(Boolean);
    const oq=kind==='quiz'?rec.data.q:(r.payload?.q||''),oa=kind==='quiz'?(rec.data.choices?.[rec.data.answer]||''):(r.a||''),wj=kind==='writing'?rec.data.ja:(r.payload?.ja||''),we=kind==='writing'?(rec.data.en||rec.data.answers?.[0]||''):(r.payload?.en||'');
    const res=await fetch('/api/generate-practice',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({grammarId:r.id,chapterTitle:cc.title,context:cc.ctx,originalQuiz:oq,originalAnswer:oa,originalWritingJa:wj,originalWritingEn:we,avoid})});
    let data={};try{data=await res.json()}catch{}if(!res.ok)throw new Error(data.error||'AI別問題の生成に失敗しました');
    const add=Array.isArray(data.items)?data.items:[];S.aiPracticeBank[sk]=[...bank,...add].slice(-9);save();item=add[0];
  }
  if(item?.id){S.aiPracticeSeen[seenK]=[...(S.aiPracticeSeen[seenK]||[]),item.id].slice(-30);save()}
  return item||null;
}
function practiceData(rec,item){
  if(!item)return rec.data;
  if(rec.kind==='quiz')return{q:item.quiz.q,choices:item.quiz.choices,answer:item.quiz.answer,exp:item.quiz.explanation,ai:true,id:item.id};
  return{ja:item.writing.ja,answers:item.writing.answers,en:item.writing.answers?.[0]||'',exp:item.writing.explanation,ai:true,id:item.id};
}
function aiBadge(v){return v?.ai?'<span class="badge ai">✨ AI別問題</span>':'<span class="badge">📚 元問題（AI利用不可）</span>'}
function renderPractice(r,rec,item){const d=practiceData(rec,item);variant=d;if(rec.kind==='quiz')renderQuiz(r,d);else renderWriting(r,d)}
function renderQuiz(r,d){M.innerHTML=head(r,'4択の復習')+`<div class="card"><div class="row" style="justify-content:space-between"><span class="eyebrow">同じ文法ポイントを別問で確認</span>${aiBadge(d)}</div><div class="q">${esc(d.q)}</div><div class="opts">${d.choices.map((o,i)=>`<button class="opt" data-aiv-q="${i}">${esc(o)}</button>`).join('')}</div><div id="aiv-feed"></div>${d.ai?'<button class="btn ghost" style="margin-top:12px" data-aiv-swap>✨ 別の問題に変える</button>':''}</div>`}
function renderWriting(r,d){M.innerHTML=head(r,'英作文の復習')+`<div class="card"><div class="row" style="justify-content:space-between"><span class="eyebrow">同じ文法ポイントを別文で英作文</span>${aiBadge(d)}</div><h3>日本語から英文を作る</h3><div class="q">${esc(d.ja)}</div><input id="aiv-write" class="input" autocomplete="off" placeholder="英文を入力"><div class="row" style="margin-top:9px"><button class="btn primary" data-aiv-write>答え合わせ</button><button class="btn ghost" data-aiv-show>答えを見る</button>${d.ai?'<button class="btn ghost" data-aiv-swap>✨ 別の問題に変える</button>':''}</div><div id="aiv-feed"></div></div>`}
function renderReading(r,p){const src=p.source==='ai'?'<span class="badge ai">✨ AI生成・保存済み</span>':'<span class="badge">📚 固定短文</span>';M.innerHTML=head(r,'短文読解の復習')+`<div class="card"><div class="row" style="justify-content:space-between"><div><span class="eyebrow">短文読解</span><h2 style="margin:4px 0">${esc(p.title||'Reading')}</h2></div>${src}</div><div class="pass">${esc(p.passage)}</div><div class="q">${esc(p.question)}</div><div class="opts">${p.choices.map((o,i)=>`<button class="opt" data-aiv-read="${i}">${esc(o)}</button>`).join('')}</div><div id="aiv-feed"></div></div>`}
function renderFlash(r){M.innerHTML=head(r,'教科書の核')+`<div class="card"><span class="eyebrow">思い出す復習</span><div class="q">${esc(r.p)}</div><button class="btn primary" data-aiv-flash-show>答えを見る</button><div id="aiv-answer" class="hidden"><div class="rule" style="margin-top:14px">${esc(r.a)}</div><div class="row" style="margin-top:10px"><button class="btn ghost" data-aiv-grade="bad">難しい</button><button class="btn primary" data-aiv-grade="good">思い出せた</button></div></div></div>`}
function reschedule(ok){const old={...cur},t=topic(cur.id),u=addReview(t,cur.p,cur.a,ok?'good':'bad',{chapterId:cur.chapterId||'',chapterTitle:cur.chapterTitle||''});preserve(u,old);return u}
function nextButton(){return'<button class="btn primary" data-aiv-next>次の復習へ →</button>'}
function result(ok,ex=''){const u=reschedule(ok),stage=u?reviewStage(u):0;document.getElementById('aiv-feed').innerHTML=`<div class="feed ${ok?'ok':'ng'}"><b>${ok?'正解！':'不正解'}</b>${ex?'<br>'+esc(ex):''}</div><p class="muted">${ok?`次は ${esc(scheduleLabel(stage))} の段階へ進みます。`:'20分後からもう一度復習します。'}</p>${nextButton()}`}
function answerQuiz(i){if(busy)return;busy=true;document.querySelectorAll('[data-aiv-q],[data-aiv-swap]').forEach(b=>b.disabled=true);const d=variant,ok=i===d.answer,bs=[...document.querySelectorAll('[data-aiv-q]')];bs[d.answer]?.classList.add('ok');if(!ok)bs[i]?.classList.add('ng');result(ok,d.exp||'')}
function answerWriting(show){if(busy)return;busy=true;document.querySelectorAll('[data-aiv-write],[data-aiv-show],[data-aiv-swap]').forEach(b=>b.disabled=true);const d=variant,answers=(d.answers?.length?d.answers:[d.en]).filter(Boolean),val=normalize(document.getElementById('aiv-write')?.value||''),ok=!show&&answers.some(a=>normalize(a)===val);const u=reschedule(ok),shown=answers.join(' / ');document.getElementById('aiv-feed').innerHTML=`<div class="feed ${ok?'ok':'ng'}"><b>${ok?'正解！':'模範解答'}</b><br>${esc(shown)}${d.exp?'<br>'+esc(d.exp):''}</div><p class="muted">${ok?`次は ${esc(scheduleLabel(reviewStage(u)))} の段階へ進みます。`:'答えを見た・不正解なので20分後からもう一度復習します。'}</p>${nextButton()}`}
function answerReading(i){if(busy)return;busy=true;const p=source.data,bs=[...document.querySelectorAll('[data-aiv-read]')];bs.forEach(b=>b.disabled=true);const ok=i===p.answer;bs[p.answer]?.classList.add('ok');if(!ok)bs[i]?.classList.add('ng');result(ok,p.explanation||'')}
async function swap(){if(busy||!(mode==='quiz'||mode==='writing'))return;busy=true;M.innerHTML=head(cur,'AI別問題を生成中')+`<div class="card"><span class="spinner"></span> 同じ文法ポイントの別問題を準備しています…</div>`;try{const item=await getVariant(cur,source,true);variant=practiceData(source,item);busy=false;if(mode==='quiz')renderQuiz(cur,variant);else renderWriting(cur,variant)}catch(e){busy=false;variant=source.data;if(mode==='quiz')renderQuiz(cur,variant);else renderWriting(cur,variant);toast(e.message||'AI別問題を生成できませんでした')}
document.addEventListener('click',e=>{const el=e.target.closest('[data-aiv-start],[data-aiv-q],[data-aiv-write],[data-aiv-show],[data-aiv-read],[data-aiv-swap],[data-aiv-flash-show],[data-aiv-grade],[data-aiv-next]');if(!el)return;e.preventDefault();e.stopImmediatePropagation();if(el.hasAttribute('data-aiv-start'))start();else if(el.hasAttribute('data-aiv-q'))answerQuiz(Number(el.dataset.aivQ));else if(el.hasAttribute('data-aiv-write'))answerWriting(false);else if(el.hasAttribute('data-aiv-show'))answerWriting(true);else if(el.hasAttribute('data-aiv-read'))answerReading(Number(el.dataset.aivRead));else if(el.hasAttribute('data-aiv-swap'))swap();else if(el.hasAttribute('data-aiv-flash-show'))document.getElementById('aiv-answer')?.classList.remove('hidden');else if(el.hasAttribute('data-aiv-grade')){reschedule(el.dataset.aivGrade==='good');pos++;render()}else if(el.hasAttribute('data-aiv-next')){pos++;render()}},true);
})();
