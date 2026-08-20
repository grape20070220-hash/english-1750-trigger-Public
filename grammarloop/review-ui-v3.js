(()=>{
let reviewQueue=[],reviewPos=0,currentReview=null,currentMode='';
function byKey(k){return S.rev.find(r=>r.k===k)}
function preserveMeta(updated,source){
  if(!updated||!source)return;
  for(const k of ['kind','payload','reading']) if(source[k]) updated[k]=source[k];
  save();
}
function recoverReading(r){
  if(r?.reading?.passage)return r.reading;
  if(r?.payload?.passage)return r.payload;
  const all=[...(BUILTIN?.[r.id]||[]),...(S.aiBank?.[r.id]||[])];
  return all.find(p=>p.question===r.p)||null;
}
async function recoverStructured(r){
  if(r?.kind==='reading') return {kind:'reading',data:recoverReading(r)};
  if(r?.kind==='quiz'&&r.payload) return {kind:'quiz',data:r.payload};
  if(r?.kind==='writing'&&r.payload) return {kind:'writing',data:r.payload};
  const read=recoverReading(r);if(read)return {kind:'reading',data:read};
  try{
    if(r.chapterId&&typeof loadThemeBook==='function'){
      const cs=await loadThemeBook(r.id),c=cs.find(x=>x.id===r.chapterId);
      if(c){
        if(c.quiz?.q===r.p)return {kind:'quiz',data:{q:c.quiz.q,choices:c.quiz.choices,answer:c.quiz.answer,exp:c.quiz.exp}};
        if(c.write?.ja===r.p)return {kind:'writing',data:{ja:c.write.ja,en:c.write.en}};
      }
    }
  }catch{}
  const t=topic(r.id);
  if(t?.quiz===r.p)return {kind:'quiz',data:{q:t.quiz,choices:t.choices,answer:t.answer,exp:t.quizExp||''}};
  if(t?.writeJa===r.p)return {kind:'writing',data:{ja:t.writeJa,en:t.writeEn}};
  return {kind:'flash',data:null};
}
function reviewDashboard(){
  const d=due(),u=(typeof tbUpcoming==='function'?tbUpcoming():S.rev.filter(r=>r.n>Date.now()).sort((a,b)=>a.n-b.n)),next=u[0];
  M.innerHTML=header('間隔復習','予定だけ確認して、問題は専用画面で1問ずつ復習')+
  `<div class="card review-guide"><span class="eyebrow">復習ロードマップ</span><h2>20分 → 1日 → 3日 → 7日 → 14日 → 30日 → 60日</h2>${typeof tbRoadmap==='function'?tbRoadmap():''}<p class="muted">不正解・答えを見た → 20分後へ戻る ／ 正解・思い出せた → 次の間隔へ進む</p></div>`+
  `<div class="grid g3"><div class="card stat"><small>今すぐ復習</small><b>${d.length}</b></div><div class="card stat"><small>次の復習</small><b style="font-size:20px">${d.length?'今すぐ':next?(typeof tbWhen==='function'?tbWhen(next.n):'予定あり'):'なし'}</b></div><div class="card stat"><small>登録済み</small><b>${S.rev.length}</b></div></div>`+
  `<div class="card" style="margin-top:13px;text-align:center;padding:30px"><div style="font-size:46px">🧠</div><h2>${d.length?`${d.length}件を元の問題形式で復習`:'今すぐの復習はありません'}</h2><p class="muted">4択は4択、英作文は入力、短文読解は本文＋選択肢で出します。</p>${d.length?'<button class="btn primary" data-rv-start>今すぐ復習する</button>':'<button class="btn ghost" data-v="home">ホームへ戻る</button>'}</div>`;
}
review=reviewDashboard;
function reviewHead(r,label){const t=topic(r.id);return header(`復習 ${reviewPos+1} / ${reviewQueue.length}`,`${label} ・ ${t?.icon||'📚'} ${t?.name||'英文法'}${r.chapterTitle?' / '+r.chapterTitle:''}`)}
function startReviewSession(){reviewQueue=due().map(r=>r.k);reviewPos=0;if(!reviewQueue.length)return reviewDashboard();renderReviewItem()}
async function renderReviewItem(){
  while(reviewPos<reviewQueue.length&&!byKey(reviewQueue[reviewPos]))reviewPos++;
  if(reviewPos>=reviewQueue.length){M.innerHTML=header('復習完了','今回の復習をすべて終えました')+`<div class="card" style="text-align:center;padding:34px"><div style="font-size:54px">✅</div><h2>復習完了！</h2><p class="muted">次の予定は復習タブで確認できます。</p><button class="btn primary" data-v="review">復習予定を見る</button></div>`;return}
  currentReview=byKey(reviewQueue[reviewPos]);
  M.innerHTML=reviewHead(currentReview,'準備中')+`<div class="card"><span class="spinner"></span> 元の問題形式を準備しています…</div>`;
  const rec=await recoverStructured(currentReview);if(currentReview!==byKey(reviewQueue[reviewPos]))return;
  currentMode=rec.kind;
  if(rec.kind==='quiz'&&rec.data)renderQuizReview(currentReview,rec.data);
  else if(rec.kind==='writing'&&rec.data)renderWritingReview(currentReview,rec.data);
  else if(rec.kind==='reading'&&rec.data)renderReadingReview(currentReview,rec.data);
  else renderFlashReview(currentReview);
}
function renderQuizReview(r,q){
  M.innerHTML=reviewHead(r,'4択の復習')+`<div class="card"><span class="eyebrow">元の4択問題</span><div class="q">${esc(q.q)}</div><div class="opts">${q.choices.map((o,i)=>`<button class="opt" data-rv-quiz="${i}">${esc(o)}</button>`).join('')}</div><div id="rv-feedback"></div></div>`;
}
function renderWritingReview(r,w){
  M.innerHTML=reviewHead(r,'英作文の復習')+`<div class="card"><span class="eyebrow">元の英作文</span><h3>日本語から英文を作る</h3><div class="q">${esc(w.ja)}</div><input id="rv-write" class="input" autocomplete="off" placeholder="英文を入力"><div class="row" style="margin-top:9px"><button class="btn primary" data-rv-write-check>答え合わせ</button><button class="btn ghost" data-rv-write-show>答えを見る</button></div><div id="rv-feedback"></div></div>`;
}
function renderReadingReview(r,p){
  const source=p.source==='ai'?'<span class="badge ai">✨ AI生成・保存済み</span>':'<span class="badge">📚 固定短文</span>';
  M.innerHTML=reviewHead(r,'短文読解の復習')+`<div class="card"><div class="row" style="justify-content:space-between"><div><span class="eyebrow">元の短文読解</span><h2 style="margin:4px 0">${esc(p.title||'Reading')}</h2></div>${source}</div><p class="muted">本文をもう一度読んでから答えてください。</p><div class="pass">${esc(p.passage)}</div><div class="q">${esc(p.question)}</div><div class="opts">${p.choices.map((o,i)=>`<button class="opt" data-rv-reading="${i}">${esc(o)}</button>`).join('')}</div><div id="rv-feedback"></div></div>`;
}
function renderFlashReview(r){
  M.innerHTML=reviewHead(r,'教科書の核')+`<div class="card"><span class="eyebrow">思い出す復習</span><div class="q">${esc(r.p)}</div><button class="btn primary" data-rv-show>答えを見る</button><div id="rv-answer" class="hidden"><div class="rule" style="margin-top:14px">${esc(r.a)}</div><p class="muted">自力で思い出せたかで判定してください。</p><div class="row"><button class="btn ghost" data-rv-grade="bad">難しい</button><button class="btn primary" data-rv-grade="good">思い出せた</button></div></div></div>`;
}
function reschedule(ok){
  const r=currentReview,t=topic(r.id),source={...r};
  const updated=addReview(t,r.p,r.a,ok?'good':'bad',{chapterId:r.chapterId||'',chapterTitle:r.chapterTitle||''});preserveMeta(updated,source);return updated;
}
function feedback(ok,html=''){
  const updated=byKey(currentReview.k),stage=updated?reviewStage(updated):0;
  document.getElementById('rv-feedback').innerHTML=`<div class="feed ${ok?'ok':'ng'}"><b>${ok?'正解！':'不正解'}</b>${html?'<br>'+html:''}</div><p class="muted">${ok?`次は ${esc(scheduleLabel(stage))} 後の段階へ進みます。`:'20分後からもう一度復習します。'}</p><button class="btn primary" data-rv-next>次の復習へ →</button>`;
}
function answerQuizReview(i){
  recoverStructured(currentReview).then(rec=>{
    const data=rec.data;if(!data)return;const bs=[...document.querySelectorAll('[data-rv-quiz]')];bs.forEach(b=>b.disabled=true);const ok=i===data.answer;bs[data.answer]?.classList.add('ok');if(!ok)bs[i]?.classList.add('ng');currentReview.kind='quiz';currentReview.payload=data;save();reschedule(ok);feedback(ok,esc(data.exp||''));
  });
}
function answerWritingReview(show){
  recoverStructured(currentReview).then(rec=>{const w=rec.data;if(!w)return;const input=document.getElementById('rv-write');const ok=!show&&normalize(input?.value||'')===normalize(w.en);if(input)input.disabled=true;document.querySelectorAll('[data-rv-write-check],[data-rv-write-show]').forEach(b=>b.disabled=true);currentReview.kind='writing';currentReview.payload=w;save();reschedule(ok);document.getElementById('rv-feedback').innerHTML=`<div class="feed ${ok?'ok':'ng'}"><b>${ok?'正解！':'模範解答'}</b><br>${esc(w.en)}</div><p class="muted">${ok?'次の長い間隔へ進みます。':'答えを見た・不正解なので20分後からもう一度復習します。'}</p><button class="btn primary" data-rv-next>次の復習へ →</button>`;});
}
function answerReadingReview(i){
  recoverStructured(currentReview).then(rec=>{const p=rec.data;if(!p)return;const bs=[...document.querySelectorAll('[data-rv-reading]')];bs.forEach(b=>b.disabled=true);const ok=i===p.answer;bs[p.answer]?.classList.add('ok');if(!ok)bs[i]?.classList.add('ng');currentReview.kind='reading';currentReview.reading=p;currentReview.payload=p;save();reschedule(ok);feedback(ok,esc(p.explanation||''));});
}
function gradeFlash(g){reschedule(g==='good');reviewPos++;renderReviewItem()}

const baseAnswerQuiz=answerQuiz;
answerQuiz=function(i){
  if(!ses)return baseAnswerQuiz(i);
  if(ses.book64){
    if(ses.answered)return;ses.answered=true;const q=ses.c.quiz,bs=[...document.querySelectorAll('[data-q]')],ok=i===q.answer;bs[q.answer]?.classList.add('ok');if(!ok)bs[i]?.classList.add('ng');
    if(ok)addXp(5);else{const r=addReview(ses.t,q.q,q.choices[q.answer]+' — '+q.exp,'bad',{chapterId:ses.c.id,chapterTitle:ses.c.title});r.kind='quiz';r.payload={q:q.q,choices:q.choices,answer:q.answer,exp:q.exp};save()}
    document.getElementById('f').innerHTML=`<div class="feed ${ok?'ok':'ng'}"><b>${ok?'正解！':'4択のまま復習に追加'}</b><br>${esc(q.exp)}</div><button class="btn primary" data-towrite>英作文へ →</button>`;return;
  }
  if(ses.answered)return;ses.answered=true;const t=ses.t,bs=[...document.querySelectorAll('[data-q]')],ok=i===t.answer;bs[t.answer]?.classList.add('ok');if(!ok)bs[i]?.classList.add('ng');if(ok)addXp(5);else{const r=addReview(t,t.quiz,t.choices[t.answer]+' — '+t.quizExp,'bad');r.kind='quiz';r.payload={q:t.quiz,choices:t.choices,answer:t.answer,exp:t.quizExp};save()}document.getElementById('f').innerHTML=`<div class="feed ${ok?'ok':'ng'}"><b>${ok?'正解！':'4択のまま復習に追加'}</b><br>${esc(t.quizExp)}</div><button class="btn primary" data-towrite>英作文へ →</button>`;
};
const baseCheckWrite=checkWrite;
checkWrite=function(show){
  if(!ses)return baseCheckWrite(show);
  const w=ses.book64?ses.c.write:{ja:ses.t.writeJa,en:ses.t.writeEn};const ok=!show&&normalize(document.getElementById('a').value)===normalize(w.en);
  if(ok)addXp(8);else{const meta=ses.book64?{chapterId:ses.c.id,chapterTitle:ses.c.title}:{};const r=addReview(ses.t,w.ja,w.en,'bad',meta);r.kind='writing';r.payload={ja:w.ja,en:w.en};save()}
  document.getElementById('f').innerHTML=`<div class="feed ${ok?'ok':'ng'}"><b>${ok?'正解！':'英作文のまま復習に追加'}</b><br>${ok?'自力で作れています。':esc(w.en)}</div><button class="btn primary" data-toread>読解へ →</button>`;
};
const baseAnswerRead=answerRead;
answerRead=function(i){
  if(!ses?.reading)return baseAnswerRead(i);if(ses.answered)return;ses.answered=true;const p=ses.reading,bs=[...document.querySelectorAll('[data-r]')],ok=i===p.answer;bs[p.answer]?.classList.add('ok');if(!ok)bs[i]?.classList.add('ng');
  if(ok)addXp(7);else{const meta=ses.book64?{chapterId:ses.c?.id||'',chapterTitle:ses.c?.title||''}:{};const r=addReview(ses.t,p.question,p.choices[p.answer],'bad',meta);r.kind='reading';r.reading=p;r.payload=p;save()}
  document.getElementById('f').innerHTML=`<div class="feed ${ok?'ok':'ng'}"><b>${ok?'正解！':'短文ごと復習に追加'}</b><br>${esc(p.explanation||'')}</div><button class="btn primary" data-finish>完了</button>`;
};

document.addEventListener('click',e=>{
  const el=e.target.closest('[data-rv-start],[data-rv-quiz],[data-rv-write-check],[data-rv-write-show],[data-rv-reading],[data-rv-show],[data-rv-grade],[data-rv-next]');if(!el)return;e.preventDefault();e.stopImmediatePropagation();
  if(el.hasAttribute('data-rv-start'))startReviewSession();
  else if(el.hasAttribute('data-rv-quiz'))answerQuizReview(Number(el.dataset.rvQuiz));
  else if(el.hasAttribute('data-rv-write-check'))answerWritingReview(false);
  else if(el.hasAttribute('data-rv-write-show'))answerWritingReview(true);
  else if(el.hasAttribute('data-rv-reading'))answerReadingReview(Number(el.dataset.rvReading));
  else if(el.hasAttribute('data-rv-show'))document.getElementById('rv-answer')?.classList.remove('hidden');
  else if(el.hasAttribute('data-rv-grade'))gradeFlash(el.dataset.rvGrade);
  else if(el.hasAttribute('data-rv-next')){reviewPos++;renderReviewItem()}
},true);
})();
