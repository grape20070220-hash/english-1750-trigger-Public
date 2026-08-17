(()=>{
  const cfg=window.ENGLISH1750_CONFIG||{};
  const api=String(cfg.dataApiUrl||'').replace(/\/$/,'');
  const token=String(cfg.dataApiToken||'');
  if(api&&token&&typeof neonRpc==='function'){
    neonRpc=async function(name,args={}){
      const r=await fetch(`${api}/rpc/${name}`,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify(args)});
      const text=await r.text();
      if(!r.ok)throw new Error(`Neon RPC ${name} failed: ${r.status} ${text.slice(0,240)}`);
      try{return text?JSON.parse(text):{ok:true}}catch{return{ok:true}}
    };
  }
  setTimeout(async()=>{
    try{
      if(typeof Notification==='undefined'||Notification.permission!=='granted'||!('serviceWorker'in navigator))return;
      const reg=await navigator.serviceWorker.ready;
      const sub=await reg.pushManager?.getSubscription();
      if(!sub)return;
      settings.notifications.enabled=true;
      localStorage.setItem(SETTINGS_KEY,JSON.stringify(settings));
      updatePushBell();
      await syncPushState(true);
    }catch(e){console.warn('Push state recovery failed',e)}
  },500);
})();
