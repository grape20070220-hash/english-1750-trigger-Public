document.addEventListener('DOMContentLoaded',()=>{
  const finish=()=>requestAnimationFrame(()=>{try{const active=document.querySelector('[data-v="home"].on');if(active&&typeof home==='function')home();}catch(e){console.error('GrammarLoop boot64',e)}});
  if(document.querySelector('script[data-review-ui]')){finish();return}
  const s=document.createElement('script');
  s.src='/review-ui-v3.js';
  s.defer=true;
  s.dataset.reviewUi='1';
  s.onload=finish;
  s.onerror=finish;
  document.head.appendChild(s);
});
