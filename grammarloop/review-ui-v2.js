(()=>{
let reviewQueue=[],reviewPos=0,currentReview=null;
function findReviewByKey(k){return S.rev.find(r=>r.k===k)}
function recoverReading(r){
  if(r?.reading?.passage)return r.reading;
  const all=[...(BUILTIN?.[r.id]||[]),...(S.aiBank?.[r.id]||[])];
  return all.find(p=>p.question===r.p)||null;
}
function reviewDashboard(){
  const d=due(),u=(typeof tbUpcoming==='function'?tbUpcoming():S.rev.filter(r=>r.n>Date.now()).sort((a,b)=>a.n-b.n));
  const next=u[0];
  M.innerHTML=header('間隔復習','予定を確認して、復習は専用画面で1問ずつ')+
  `<div class="card tb-review-guide"><span class="tb-eye">復習ロードマップ</span><h2>20分 → 1日 → 3日 → 7日 → 14日 → 30日 → 60日</h2>${typeof tbRoadmap==='function'?tbRoadmap():''}<p class="muted">「難しい」または不正解なら20分後へ戻る。「思い出せた」または正解なら次の間隔へ進みます。</p></div>`+
  `<div class="grid g3" style="margin-top:13px"><div class="card stat"><small>今すぐ復習</small><b>${d.length}</b></div><div class="card stat"><small>次の復習</small><b style="font-size:20px">${d.length?'今すぐ':next?(typeof tbWhen==='function'?tbWhen(next.n):'予定あり'):'なし'}</b></div><div class="card stat"><small>復習総数</small><b>${S.rev.length}</b></div></div>`+
  `<div class="card" style="margin-top:13px;text-align:center;padding:28px"><div style="font-size:42px">🔁</div><h2>${d.length?`${d.length}件の復習があります`:'今すぐの復習はありません'}</h2><p class="muted">問題内容はここには表示せず、専用の復習画面で1問ずつ進めます。</p>${d.length?'<button class="btn primary" data-review-start>今すぐ復習する</button>':'<button class="btn ghost" data-v="home">ホームへ戻る</button>'}</div>`;
}
review=reviewDashboard;
function startReviewSession(){
  reviewQueue=due().map(r=>r.k);reviewPos=0;
  if(!reviewQueue.length){reviewDashboard();return}
  renderReviewItem();
}
function renderReviewItem(){
  while(reviewPos<reviewQueue.length && !findReviewByKey(reviewQueue[reviewPos])) reviewPos++;
  if(reviewPos>=reviewQueue.length){
    M.innerHTML=header('復習完了','今日の復習をすべて終えました')+`<div class="card" style="text-align:center;padding:32px"><div style="font-size:52px">✅</div><h2>復習完了！</h2><p class="muted">次の復習時刻は復習タブで確認できます。</p><button class="btn primary" data-v="review">復習予定を見る</button></div>`;return;
  }
  currentReview=findReviewByKey(reviewQueue[reviewPos]);
  const p=recoverReading(currentReview);
  if(p){currentReview.kind='reading';currentReview.reading=currentReview.reading||p;save();renderReadingReview(currentReview,p);}
  else renderFlashReview(currentReview);
}
function reviewHead(r){const t=topic(r.id);return header(`復習 ${reviewPos+1} / ${reviewQueue.length}`,`${t?.icon||'📚'} ${t?.name||'英文法'}${r.chapterTitle?' / '+r.chapterTitle:''}`)}
function renderFlashReview(r){
  M.innerHTML=reviewHead(r)+`<div class="card"><span class="tb-eye">間隔復習</span><div class="q">${esc(r.p)}</div><button class="btn primary" data-review-show>答えを見る</button><div id="review-answer" class="hidden"><div class="rule" style="margin-top:14px">${esc(r.a)}</div><p class="muted">自力で思い出せたかで判定してください。</p><div class="row"><button class="btn ghost" data-review-grade="bad">難しい</button><button class="btn primary" data-review-grade="good">思い出せた</button></div></div></div>`;
}
function renderReadingReview(r,p){
  const source=p.source==='ai'?'<span class="badge ai">✨ AI生成・保存済み</span>':'<span class="badge">📚 固定短文</span>';
  M.innerHTML=reviewHead(r)+`<div class="card"><div class="row" style="justify-content:space-between"><div><span class="tb-eye">短文読解の復習</span><h2 style="margin:4px 0">${esc(p.title||'Reading')}</h2></div>${source}</div><p class="muted">元の短文をもう一度読み、内容を思い出して答えてください。</p><div class="pass">${esc(p.passage)}</div><div class="q">${esc(p.question)}</div><div class="opts">${p.choices.map((o,i)=>`<button class="opt" data-review-choice="${i}">${esc(o)}</button>`).join('')}</div><div id="review-feedback"></div></div>`;
}
function showReviewAnswer(){document.getElementById('review-answer')?.classList.remove('hidden')}
function gradeCurrent(g){
  const r=currentReview;if(!r)return;
  const t=topic(r.id);addReview(t,r.p,r.a,g,{chapterId:r.chapterId||'',chapterTitle:r.chapterTitle||''});
  const updated=findReviewByKey(r.k);if(updated&&r.kind){updated.kind=r.kind;updated.reading=r.reading||updated.reading;save()}
  reviewPos++;renderReviewItem();
}
function answerReadingReview(i){
  const r=currentReview,p=r?.reading||recoverReading(r);if(!p)return;
  const buttons=[...document.querySelectorAll('[data-review-choice]')];buttons.forEach(b=>b.disabled=true);
  const ok=i===p.answer;buttons[p.answer]?.classList.add('ok');if(!ok)buttons[i]?.classList.add('ng');
  const t=topic(r.id);addReview(t,r.p,r.a,ok?'good':'bad',{chapterId:r.chapterId||'',chapterTitle:r.chapterTitle||''});
  const updated=findReviewByKey(r.k);if(updated){updated.kind='reading';updated.reading=p;save()}
  const stage=updated?reviewStage(updated):0;
  document.getElementById('review-feedback').innerHTML=`<div class="feed ${ok?'ok':'ng'}"><b>${ok?'正解！':'不正解'}</b><br>${esc(p.explanation||'')}</div><p class="muted">${ok?`次は ${esc(scheduleLabel(stage))} 後の段階へ進みます。`:'20分後からもう一度復習します。'}</p><button class="btn primary" data-review-next>次の復習へ →</button>`;
}
const oldAnswerRead=answerRead;
answerRead=function(i){
  if(!ses?.reading)return oldAnswerRead(i);
  if(ses.answered)return;ses.answered=true;
  const p=ses.reading,bs=[...document.querySelectorAll('[data-r]')],ok=i===p.answer;
  bs[p.answer]?.classList.add('ok');if(!ok)bs[i]?.classList.add('ng');
  if(ok)addXp(7);else{
    const meta=ses?.book64?{chapterId:ses.c?.id||'',chapterTitle:ses.c?.title||''}:{};
    const r=addReview(ses.t,p.question,p.choices[p.answer],'bad',meta);r.kind='reading';r.reading=p;save();
  }
  document.getElementById('f').innerHTML=`<div class="feed ${ok?'ok':'ng'}"><b>${ok?'正解！':'短文ごと復習に追加'}</b><br>${esc(p.explanation||'')}</div><button class="btn primary" data-finish>完了</button>`;
};
document.addEventListener('click',e=>{
  const el=e.target.closest('[data-review-start],[data-review-show],[data-review-grade],[data-review-choice],[data-review-next]');if(!el)return;
  e.preventDefault();e.stopImmediatePropagation();
  if(el.hasAttribute('data-review-start'))startReviewSession();
  else if(el.hasAttribute('data-review-show'))showReviewAnswer();
  else if(el.hasAttribute('data-review-grade'))gradeCurrent(el.dataset.reviewGrade);
  else if(el.hasAttribute('data-review-choice'))answerReadingReview(Number(el.dataset.reviewChoice));
  else if(el.hasAttribute('data-review-next')){reviewPos++;renderReviewItem()}
},true);
})();