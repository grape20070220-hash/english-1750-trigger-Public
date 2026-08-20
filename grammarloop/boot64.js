document.addEventListener('DOMContentLoaded',()=>{
  const finish=()=>requestAnimationFrame(()=>{try{const active=document.querySelector('[data-v="home"].on');if(active&&typeof home==='function')home();}catch(e){console.error('GrammarLoop boot64',e)}});
  const load=(src,attr,next)=>{if(document.querySelector(`script[${attr}]`)){next();return}const s=document.createElement('script');s.src=src;s.defer=true;s.setAttribute(attr,'1');s.onload=next;s.onerror=next;document.head.appendChild(s)};
  load('/review-ui-v3.js','data-review-ui',()=>load('/review-ai-v4.js','data-review-ai',finish));
});
