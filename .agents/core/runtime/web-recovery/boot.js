/* Core-owned startup guard. No dependency on the selected UI, React, or application modules. */
(()=>{
  'use strict';
  const element=document.getElementById('ksf-frontend-client');if(!element)return;
  let binding;try{binding=JSON.parse(element.textContent);}catch{location.replace('/ui-recovery');return;}
  const resources=new Set(binding.resources??[]);let ready=false,failed=false,interacted=false,authPromise,preparing;
  const auth=()=>authPromise??=(fetch('/api/workbench/session',{cache:'no-store'}).then(async response=>{const body=await response.json();if(!response.ok||!body.data?.token)throw Error('Host session unavailable');return body.data;}));
  const key=value=>'ksf.ui.startup-fallback.v1:'+value.instanceId;
  const resource=value=>{try{const url=new URL(value,location.href);return url.origin===location.origin&&resources.has(url.pathname)&&/\.(?:js|css)$/.test(url.pathname)?url.pathname:null;}catch{return null;}};
  const recover=()=>location.replace('/ui-recovery');
  async function post(value,input){const response=await fetch('/api/ui-runtime/boot',{method:'POST',headers:{'Content-Type':'application/json','X-KSF-Token':value.token},body:JSON.stringify(input)}),body=await response.json();if(!response.ok||body.ok===false)throw Error(body.error?.code??'Startup recovery unavailable');return body.data;}
  function fail(reason,path){
    if(ready||failed)return;failed=true;
    void (async()=>{
      try{
        const value=await auth(),storageKey=key(value);
        // A surviving marker prevents a second fallback in the next document, including after a lost reply.
        if(interacted||!path||sessionStorage.getItem(storageKey)){recover();return;}
        sessionStorage.setItem(storageKey,JSON.stringify({bootAttempt:binding.clientId,releaseId:binding.releaseId}));
        if(!sessionStorage.getItem(storageKey))throw Error('Startup marker unavailable');
        await post(value,{action:'failed',clientId:binding.clientId,releaseId:binding.releaseId,operationId:binding.clientId,ifMatch:binding.selectionEtag,reason,resource:path});
        location.replace('/');
      }catch{recover();}
    })();
  }
  const input=()=>{if(!ready)interacted=true;};
  const error=event=>{
    if(event.target instanceof HTMLScriptElement||event.target instanceof HTMLLinkElement){const path=resource(event.target.src??event.target.href);if(path)fail('asset-error',path);}
    else {const path=resource(event.filename);if(path)fail('module-error',path);}
  };
  const csp=event=>{const path=resource(event.blockedURI);if(path)fail('csp',path);};
  window.addEventListener('pointerdown',input,true);window.addEventListener('keydown',input,true);window.addEventListener('error',error,true);window.addEventListener('securitypolicyviolation',csp,true);
  function prepare(){
    if(preparing)return preparing;
    preparing=(async()=>{
      await auth();
      if(failed)throw Error('Frontend startup already failed');
      await Promise.all((binding.styles??[]).map(path=>new Promise((resolve,reject)=>{
        const link=[...document.querySelectorAll('link[rel="stylesheet"]')].find(link=>new URL(link.href,location.href).pathname===path);
        if(!link){fail('asset-error',path);reject(Error('Frontend stylesheet missing'));return;}
        if(link.sheet){resolve();return;}
        const cleanup=()=>{link.removeEventListener('load',loaded);link.removeEventListener('error',broken);};
        const loaded=()=>{cleanup();resolve();},broken=()=>{cleanup();fail('asset-error',path);reject(Error('Frontend stylesheet failed'));};
        link.addEventListener('load',loaded,{once:true});link.addEventListener('error',broken,{once:true});
        // Cover a sheet settling between the initial check and event registration.
        if(link.sheet)loaded();
      })));
      if(failed)throw Error('Frontend startup already failed');
    })();return preparing;
  }
  Object.defineProperty(window,'__ksfFrontendBoot',{value:Object.freeze({prepare}),writable:false,configurable:false});
  window.addEventListener('ksf:frontend-ready',()=>{
    if(failed)return;ready=true;
    window.removeEventListener('pointerdown',input,true);window.removeEventListener('keydown',input,true);window.removeEventListener('error',error,true);window.removeEventListener('securitypolicyviolation',csp,true);
    void auth().then(async value=>{await post(value,{action:'ready',clientId:binding.clientId,releaseId:binding.releaseId});sessionStorage.removeItem(key(value));}).catch(()=>{});
  },{once:true});
})();
