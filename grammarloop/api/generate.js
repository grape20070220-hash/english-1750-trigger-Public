const GRAMMARS = {
  perfect: { name: 'present perfect', rule: 'have/has + past participle, linking past and present', examples: ['has lived', 'have studied', 'has already finished'] },
  inf: { name: 'to-infinitive', rule: 'to + base verb for purpose, intention, or noun/adjective use', examples: ['to study', 'to save', 'to learn'] },
  gerund: { name: 'gerund', rule: 'verb-ing used as a noun or after verbs such as enjoy/avoid/finish', examples: ['enjoy reading', 'avoid checking', 'learning English'] },
  passive: { name: 'passive voice', rule: 'be + past participle', examples: ['is used', 'was opened', 'are collected'] },
  relative: { name: 'relative clauses', rule: 'who/which/that connecting a noun to extra information', examples: ['a person who...', 'a book that...', 'a tool which...'] },
  compare: { name: 'comparatives and superlatives', rule: 'comparative + than, the + superlative, as...as', examples: ['faster than', 'more useful than', 'the best'] },
  if: { name: 'second conditional / subjunctive-style hypothetical', rule: 'If + past, would + base verb for unreal or unlikely situations', examples: ['If I had..., I would...', 'If I were..., I would...'] },
  part: { name: 'participles and participle clauses', rule: '-ing and past participles used to describe nouns/states or shorten clauses', examples: ['walking home', 'a broken window', 'feeling tired'] }
};
const buckets = globalThis.__grammarLoopBuckets || (globalThis.__grammarLoopBuckets = new Map());
function limited(ip){
  const now=Date.now(), span=10*60*1000, max=5;
  let x=buckets.get(ip)||[]; x=x.filter(t=>now-t<span); if(x.length>=max){buckets.set(ip,x);return true} x.push(now);buckets.set(ip,x);return false;
}
function extractText(data){
  for(const item of data.output||[]) for(const c of item.content||[]) if(c.type==='output_text'&&c.text) return c.text;
  return '';
}
function valid(p){return p&&typeof p.title==='string'&&typeof p.passage==='string'&&p.passage.length>=250&&p.passage.length<=1400&&typeof p.question==='string'&&Array.isArray(p.choices)&&p.choices.length===3&&Number.isInteger(p.answer)&&p.answer>=0&&p.answer<3&&typeof p.explanation==='string'}
module.exports = async function handler(req,res){
  if(req.method==='GET') return res.status(200).json({configured:Boolean(process.env.OPENAI_API_KEY),model:'gpt-5-mini'});
  if(req.method!=='POST') return res.status(405).json({error:'Method not allowed'});
  if(!process.env.OPENAI_API_KEY) return res.status(503).json({error:'OPENAI_API_KEY is not configured'});
  const ip=(req.headers['x-forwarded-for']||req.headers['x-real-ip']||'unknown').split(',')[0].trim();
  if(limited(ip)) return res.status(429).json({error:'AI generation rate limit reached. Try again later.'});
  const origin=req.headers.origin; const host=req.headers.host;
  if(origin){try{if(new URL(origin).host!==host)return res.status(403).json({error:'Cross-origin generation is not allowed'})}catch{return res.status(400).json({error:'Invalid origin'})}}
  let body; try{body=typeof req.body==='string'?JSON.parse(req.body||'{}'):(req.body||{})}catch{return res.status(400).json({error:'Invalid JSON'})}
  const g=GRAMMARS[body.grammarId]; if(!g) return res.status(400).json({error:'Unknown grammar theme'});
  const avoid=Array.isArray(body.avoidTitles)?body.avoidTitles.slice(0,8).map(String):[];
  const prompt=`Create one short English reading passage for a Japanese learner.\nTarget grammar: ${g.name}.\nRule: ${g.rule}.\nNatural examples: ${g.examples.join(', ')}.\nRequirements:\n- CEFR A2-B1.\n- 90-140 English words.\n- Use the target grammar naturally at least 3 times where reasonable.\n- Everyday topic, clear story or situation, easy vocabulary.\n- One comprehension multiple-choice question with exactly 3 choices and one unambiguous correct answer.\n- explanation must be a short Japanese explanation identifying the evidence in the passage.\n- Do not use markdown.\n- Avoid titles/topics too similar to: ${avoid.join(' | ') || 'none'}.`;
  const schema={type:'object',additionalProperties:false,required:['title','passage','question','choices','answer','explanation'],properties:{title:{type:'string'},passage:{type:'string'},question:{type:'string'},choices:{type:'array',minItems:3,maxItems:3,items:{type:'string'}},answer:{type:'integer',minimum:0,maximum:2},explanation:{type:'string'}}};
  let r;
  try{
    r=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${process.env.OPENAI_API_KEY}`},body:JSON.stringify({model:'gpt-5-mini',store:false,max_output_tokens:700,input:prompt,text:{format:{type:'json_schema',name:'grammar_reading',schema,strict:true}}})});
  }catch(e){return res.status(502).json({error:'Could not reach OpenAI API'})}
  const data=await r.json().catch(()=>({}));
  if(!r.ok) return res.status(502).json({error:'OpenAI API request failed',detail:data.error?.message||'Unknown error'});
  const text=extractText(data); let p; try{p=JSON.parse(text)}catch{return res.status(502).json({error:'AI returned invalid structured output'})}
  if(!valid(p)) return res.status(502).json({error:'AI passage validation failed'});
  p.id=`ai-${body.grammarId}-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;p.source='ai';
  return res.status(200).json({passage:p});
};
