/** A slow cleanup blocks replacement; its deadline reports failure without releasing the old lease. */
export async function waitForSurfaceCleanup(previous:Promise<unknown>|undefined,timeoutMs=10000){
 if(!previous)return;let timer:ReturnType<typeof setTimeout>|undefined;
 try{await Promise.race([previous,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Object.assign(Error('旧界面仍在清理，请稍后重试；持续失败可重新载入工作台。'),{code:'APP_CLEANUP_TIMEOUT'})),timeoutMs);})]);}finally{clearTimeout(timer);}
}
