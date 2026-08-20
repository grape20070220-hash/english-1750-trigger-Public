(()=>{
S.aiPracticeBank=S.aiPracticeBank||{};
S.lessonAiSeen=S.lessonAiSeen||{};
save();

function lessonMeta(){return ses?.book64?{chapterId:ses.c?.id||'',chapterTitle:ses.c?.title||''}:{}}
function lessonScope(){return `${ses?.t?.id||'x'}::${ses?.book64?(ses.c?.id||'base'):'base'}`}
function qSource(){
  if(ses?.book64){const q=ses.c.quiz;return {q:q.q,choices:q.choices,answer:q.answer,exp:q.exp||'',chapterTitle:ses.c.title,context:[ses.c.summary,ses.c.form].filter(Boolean).join(' / ')}}
  const t=ses?.t;return {q:t?.quiz||'',choices:t?.choices||[],answer:t?.answer||0,exp:t?.quizExp||'',chapterTitle:'',context:t?.rule||''}
}
function wSource(){
  if(ses?.book64){const w=ses.c.write;return {ja:w.ja,en:w.en,answers:[w.en],chapterTitle:ses.c.title,context:[ses.c.summary,ses.c.form].filter(Boolean).join(' / ')}}
  const t=ses?.t;return {ja:t?.writeJa||'',en:t?.writeEn||'',answers:[t?.writeEn||''],chapterTitle:'',context:t?.rule||''}
}
function seenKey(kind){return `${lessonScope()}|lesson|${kind}`}
function markLessonSeen(kind,id){if(!id)return;const k=seenKey(kind);S.lessonAiSeen[k]=[...(S.lessonAiSeen[k]||[]),id].slice(-30);save()}
function apiMessage(data,fallback){return [data?.error||fallback,data?.detail].filter(Boolean).join('：')}
async function fetchPracticeSet(){
  const q=qSource(),w=wSource(),scope=lessonScope(),bank=S.aiPracticeBank[scope]||[];
  const avoid=bank.slice(-10).flatMap(x=>[x?.quiz?.q,x?.writing?.ja]).filter(Boolean);
  const r=await fetch('/api/generate-practice',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
    grammarId:ses.t.id,
    chapterTitle:q.chapterTitle||w.chapterTitle||'',
    context:q.context||w.context||'',
    originalQuiz:q.q,
    originalAnswer:q.choices?.[q.answer]||'',
    originalWritingJa:w.ja,
    originalWritingEn:w.en,
    avoid
  })});
  let data={};try{data=await r.json()}catch{}
  if(!r.ok)throw new Error(apiMessage(data,'AI問題の生成に失敗しました'));
  const add=Array.isArray(data.items)?data.items:[];
  if(!add.length)throw new Error('AI問題の生成結果が空でした');
  S.aiPracticeBank[scope]=[...bank,...add].slice(-12);save();
  return add;
}
async function lessonVariant(kind,force=false){
  const scope=lessonScope(),bank=S.aiPracticeBank[scope]||[],seen=new Set(S.lessonAiSeen[seenKey(kind)]||[]);
  let candidates=bank.filter(x=>x?.id&&!seen.has(x.id));
  if(force&&candidates.length>1)candidates=candidates.slice(1);
  let item=candidates[0];
  if(!item){const add=await fetchPracticeSet();item=add[0]}
  markLessonSeen(kind,item?.id);
  return item;
}
function aiHelp(){return '<div class="muted" style="font-size:12px;margin-top:8px">同じ文法ポイントの別問題をAIで作成。1回の生成で3セット保存して使い回します。</div>'}
function fixedQuiz(){
  if(!ses)return;
  ses.answered=false;ses.lessonAi=null;
  const q=qSource(),b=document.getElementById('b');if(!b)return;
  b.innerHTML=`<div class="card"><div class="row" style="justify-content:space-between;align-items:flex-start"><span class="${ses.book64?'tb-eye':'eyebrow'}">確認問題</span><span class="badge">📚 教科書問題</span></div><div class="q">${esc(q.q)}</div><div class="opts">${q.choices.map((o,i)=>`<button class="opt" data-q="${i}">${esc(o)}</button>`).join('')}</div><div id="f"></div><div class="row" style="margin-top:14px"><button class="btn ghost" data-lai-generate="quiz">✨ AIで別の4択を作る</button></div>${aiHelp()}</div>`;
}
function fixedWrite(){
  if(!ses)return;
  ses.answered=false;ses.lessonAi=null;
  const w=wSource(),b=document.getElementById('b');if(!b)return;
  b.innerHTML=`<div class="card"><div class="row" style="justify-content:space-between;align-items:flex-start"><span class="${ses.book64?'tb-eye':'eyebrow'}">英作文</span><span class="badge">📚 教科書問題</span></div><h3>日本語から英文を作る</h3><div class="q">${esc(w.ja)}</div><input id="a" class="input" autocomplete="off" placeholder="英文を入力"><div class="row" style="margin-top:9px"><button class="btn primary" data-check>答え合わせ</button><button class="btn ghost" data-show>答えを見る</button><button class="btn ghost" data-lai-generate="writing">✨ AIで別の英作文を作る</button></div><div id="f"></div>${aiHelp()}</div>`;
}
const priorQuiz=quiz,priorWrite=write;
quiz=function(){if(!ses)return priorQuiz();fixedQuiz()};
write=function(){if(!ses)return priorWrite();fixedWrite()};

function renderAiQuiz(item){
  const d={q:item.quiz.q,choices:item.quiz.choices,answer:item.quiz.answer,exp:item.quiz.explanation||'',id:item.id};
  ses.answered=false;ses.lessonAi={kind:'quiz',data:d};
  document.getElementById('b').innerHTML=`<div class="card"><div class="row" style="justify-content:space-between;align-items:flex-start"><span class="${ses.book64?'tb-eye':'eyebrow'}">確認問題</span><span class="badge ai">✨ AI別問題</span></div><div class="q">${esc(d.q)}</div><div class="opts">${d.choices.map((o,i)=>`<button class="opt" data-lai-q="${i}">${esc(o)}</button>`).join('')}</div><div id="f"></div><div class="row" style="margin-top:14px"><button class="btn ghost" data-lai-generate="quiz" data-force="1">✨ さらに別の問題</button><button class="btn ghost" data-lai-original="quiz">教科書問題に戻す</button></div>${aiHelp()}</div>`;
}
function renderAiWriting(item){
  const answers=(item.writing.answers||[]).filter(Boolean),d={ja:item.writing.ja,answers,en:answers[0]||'',exp:item.writing.explanation||'',id:item.id};
  ses.answered=false;ses.lessonAi={kind:'writing',data:d};
  document.getElementById('b').innerHTML=`<div class="card"><div class="row" style="justify-content:space-between;align-items:flex-start"><span class="${ses.book64?'tb-eye':'eyebrow'}">英作文</span><span class="badge ai">✨ AI別問題</span></div><h3>日本語から英文を作る</h3><div class="q">${esc(d.ja)}</div><input id="lai-write" class="input" autocomplete="off" placeholder="英文を入力"><div class="row" style="margin-top:9px"><button class="btn primary" data-lai-check>答え合わせ</button><button class="btn ghost" data-lai-show>答えを見る</button><button class="btn ghost" data-lai-generate="writing" data-force="1">✨ さらに別の問題</button><button class="btn ghost" data-lai-original="writing">教科書問題に戻す</button></div><div id="f"></div>${aiHelp()}</div>`;
}
async function generateLesson(kind,force){
  if(!ses||ses.loading)return;
  ses.loading=true;const b=document.getElementById('b');if(b)b.innerHTML=`<div class="card"><span class="spinner"></span> AIで${kind==='quiz'?'4択':'英作文'}の別問題を作成中…</div>`;
  try{const item=await lessonVariant(kind,force);ses.loading=false;if(kind==='quiz')renderAiQuiz(item);else renderAiWriting(item)}
  catch(e){ses.loading=false;if(kind==='quiz')fixedQuiz();else fixedWrite();toast(e.message||'AI問題の生成に失敗しました')}
}
function answerAiQuiz(i){
  if(!ses?.lessonAi||ses.lessonAi.kind!=='quiz'||ses.answered)return;
  ses.answered=true;const d=ses.lessonAi.data,bs=[...document.querySelectorAll('[data-lai-q]')];bs.forEach(x=>x.disabled=true);const ok=i===d.answer;
  bs[d.answer]?.classList.add('ok');if(!ok)bs[i]?.classList.add('ng');
  if(ok)addXp(5);else{const r=addReview(ses.t,d.q,(d.choices[d.answer]||'')+(d.exp?' — '+d.exp:''),'bad',lessonMeta());r.kind='quiz';r.payload={q:d.q,choices:d.choices,answer:d.answer,exp:d.exp};save()}
  document.getElementById('f').innerHTML=`<div class="feed ${ok?'ok':'ng'}"><b>${ok?'正解！':'AI問題を復習に追加'}</b><br>${esc(d.exp||'')}</div><button class="btn primary" data-towrite>英作文へ →</button>`;
}
function answerAiWriting(show){
  if(!ses?.lessonAi||ses.lessonAi.kind!=='writing'||ses.answered)return;
  ses.answered=true;const d=ses.lessonAi.data,answers=(d.answers?.length?d.answers:[d.en]).filter(Boolean),val=normalize(document.getElementById('lai-write')?.value||''),ok=!show&&answers.some(a=>normalize(a)===val);
  document.querySelectorAll('[data-lai-check],[data-lai-show],[data-lai-generate],[data-lai-original]').forEach(x=>x.disabled=true);
  if(ok)addXp(8);else{const r=addReview(ses.t,d.ja,answers[0]||'','bad',lessonMeta());r.kind='writing';r.payload={ja:d.ja,en:answers[0]||'',answers,exp:d.exp};save()}
  document.getElementById('f').innerHTML=`<div class="feed ${ok?'ok':'ng'}"><b>${ok?'正解！':'模範解答'}</b><br>${esc(answers.join(' / '))}${d.exp?'<br>'+esc(d.exp):''}</div><button class="btn primary" data-toread>読解へ →</button>`;
}

const priorGenerateAI=generateAI;
generateAI=async function(id){
  const avoids=(S.aiBank[id]||[]).slice(-6).map(x=>x.title);
  const r=await fetch('/api/generate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({grammarId:id,avoidTitles:avoids})});
  let data={};try{data=await r.json()}catch{}
  if(!r.ok){if(r.status===503)throw new Error('AI生成にはVercel側のOPENAI_API_KEY設定が必要です。');throw new Error(apiMessage(data,'AI短文の生成に失敗しました'))}
  const p=data.passage;if(!p||!p.id)throw new Error('AI短文の形式が正しくありません。');
  S.aiBank[id]=[...(S.aiBank[id]||[]),p].slice(-8);S.aiCount=(S.aiCount||0)+1;save();return p;
};

document.addEventListener('click',e=>{
  const el=e.target.closest('[data-lai-generate],[data-lai-original],[data-lai-q],[data-lai-check],[data-lai-show]');if(!el)return;
  e.preventDefault();e.stopImmediatePropagation();
  if(el.hasAttribute('data-lai-generate'))generateLesson(el.dataset.laiGenerate,el.dataset.force==='1');
  else if(el.hasAttribute('data-lai-original')){if(el.dataset.laiOriginal==='quiz')fixedQuiz();else fixedWrite()}
  else if(el.hasAttribute('data-lai-q'))answerAiQuiz(Number(el.dataset.laiQ));
  else if(el.hasAttribute('data-lai-check'))answerAiWriting(false);
  else if(el.hasAttribute('data-lai-show'))answerAiWriting(true);
},true);
})();
