const GRAMMARS={perfect:'present perfect and related perfect forms',inf:'to-infinitives',gerund:'gerunds',passive:'passive voice',relative:'relative clauses and relative pronouns',compare:'comparatives and superlatives',if:'conditionals and subjunctive/hypothetical forms',part:'participles and participle clauses'};
const buckets=globalThis.__grammarLoopPracticeBuckets||(globalThis.__grammarLoopPracticeBuckets=new Map());
function limited(ip){const now=Date.now(),span=10*60*1000,max=8;let x=buckets.get(ip)||[];x=x.filter(t=>now-t<span);if(x.length>=max){buckets.set(ip,x);return true}x.push(now);buckets.set(ip,x);return false}
function textOut(data){for(const item of data.output||[])for(const c of item.content||[])if(c.type==='output_text'&&c.text)return c.text;return''}
function clean(s,n=500){return String(s||'').slice(0,n)}
function valid(x){return x&&Array.isArray(x.items)&&x.items.length===3&&x.items.every(v=>v&&v.quiz&&typeof v.quiz.q==='string'&&Array.isArray(v.quiz.choices)&&v.quiz.choices.length===3&&Number.isInteger(v.quiz.answer)&&v.quiz.answer>=0&&v.quiz.answer<3&&typeof v.quiz.explanation==='string'&&v.writing&&typeof v.writing.ja==='string'&&Array.isArray(v.writing.answers)&&v.writing.answers.length>=1&&v.writing.answers.length<=4&&v.writing.answers.every(a=>typeof a==='string')&&typeof v.writing.explanation==='string')}
async function callOpenAI(body,maxOutputTokens){
  let r;
  try{
    r=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${process.env.OPENAI_API_KEY}`},body:JSON.stringify({...body,max_output_tokens:maxOutputTokens})});
  }catch{return {ok:false,status:502,error:'Could not reach OpenAI API'}}
  const data=await r.json().catch(()=>({}));
  if(!r.ok)return {ok:false,status:502,error:'OpenAI API request failed',detail:data.error?.message||'Unknown error'};
  return {ok:true,data};
}
module.exports=async function handler(req,res){
  if(req.method==='GET')return res.status(200).json({configured:Boolean(process.env.OPENAI_API_KEY),model:'gpt-5-mini',feature:'practice-variants-v2'});
  if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});
  if(!process.env.OPENAI_API_KEY)return res.status(503).json({error:'OPENAI_API_KEY is not configured'});
  const ip=(req.headers['x-forwarded-for']||req.headers['x-real-ip']||'unknown').split(',')[0].trim();if(limited(ip))return res.status(429).json({error:'AI practice generation rate limit reached. Try again later.'});
  const origin=req.headers.origin,host=req.headers.host;if(origin){try{if(new URL(origin).host!==host)return res.status(403).json({error:'Cross-origin generation is not allowed'})}catch{return res.status(400).json({error:'Invalid origin'})}}
  let b;try{b=typeof req.body==='string'?JSON.parse(req.body||'{}'):(req.body||{})}catch{return res.status(400).json({error:'Invalid JSON'})}
  const grammar=GRAMMARS[b.grammarId];if(!grammar)return res.status(400).json({error:'Unknown grammar theme'});
  const chapter=clean(b.chapterTitle,120),context=clean(b.context,700),oq=clean(b.originalQuiz,350),oa=clean(b.originalAnswer,350),wj=clean(b.originalWritingJa,350),we=clean(b.originalWritingEn,350),avoid=Array.isArray(b.avoid)?b.avoid.slice(0,10).map(x=>clean(x,180)):[];
  const prompt=`Create exactly 3 NEW English grammar practice variants for a Japanese learner.\nTarget grammar theme: ${grammar}.\nChapter/topic: ${chapter||'general review'}.\nChapter context/form: ${context||'not provided'}.\nOriginal multiple-choice item: ${oq||'not provided'}\nOriginal correct answer/explanation: ${oa||'not provided'}\nOriginal Japanese-to-English item: ${wj||'not provided'} -> ${we||'not provided'}\n\nRequirements:\n- Test the SAME grammar point and approximately the SAME difficulty, but change the situation, vocabulary, subject, numbers, and wording.\n- Do not simply paraphrase or copy the original.\n- Each quiz has exactly 3 plausible choices and one unambiguous correct answer.\n- quiz.explanation is a concise Japanese explanation.\n- Each writing item gives a natural Japanese sentence to translate into English.\n- writing.answers contains 1 to 4 natural acceptable English answers that express the requested meaning and target grammar.\n- writing.explanation is a concise Japanese note about the grammar point.\n- Keep vocabulary suitable for a Japanese high-school learner unless the chapter itself is advanced.\n- Avoid generating items too similar to these previous prompts: ${avoid.join(' | ')||'none'}.\n- Keep explanations concise so all 3 variants fit comfortably.\n- Do not use markdown.`;
  const schema={type:'object',additionalProperties:false,required:['items'],properties:{items:{type:'array',minItems:3,maxItems:3,items:{type:'object',additionalProperties:false,required:['quiz','writing'],properties:{quiz:{type:'object',additionalProperties:false,required:['q','choices','answer','explanation'],properties:{q:{type:'string'},choices:{type:'array',minItems:3,maxItems:3,items:{type:'string'}},answer:{type:'integer',minimum:0,maximum:2},explanation:{type:'string'}}},writing:{type:'object',additionalProperties:false,required:['ja','answers','explanation'],properties:{ja:{type:'string'},answers:{type:'array',minItems:1,maxItems:4,items:{type:'string'}},explanation:{type:'string'}}}}}}}};
  const requestBody={model:'gpt-5-mini',store:false,reasoning:{effort:'minimal'},input:prompt,text:{format:{type:'json_schema',name:'grammar_practice_variants',schema,strict:true}}};
  let result=await callOpenAI(requestBody,3000);
  if(!result.ok)return res.status(result.status||502).json({error:result.error,detail:result.detail||''});
  let data=result.data;
  if(data.status==='incomplete'&&data.incomplete_details?.reason==='max_output_tokens'){
    result=await callOpenAI(requestBody,4000);
    if(!result.ok)return res.status(result.status||502).json({error:result.error,detail:result.detail||''});
    data=result.data;
  }
  if(data.status&&data.status!=='completed')return res.status(502).json({error:'AI response did not complete',detail:data.incomplete_details?.reason||data.error?.message||data.status});
  const txt=textOut(data);let out;try{out=JSON.parse(txt)}catch{return res.status(502).json({error:'AI returned invalid structured output',detail:data.incomplete_details?.reason||`status=${data.status||'unknown'}, output=${txt.length} chars`})}
  if(!valid(out))return res.status(502).json({error:'AI practice validation failed'});
  const stamp=Date.now();out.items=out.items.map((v,i)=>({...v,id:`pv-${b.grammarId}-${stamp}-${i}-${Math.random().toString(36).slice(2,6)}`}));
  return res.status(200).json(out);
};
