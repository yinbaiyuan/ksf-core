/** Let controlled application overlays commit before running their selected action. */
export function afterOverlayCommit():Promise<void>{
 if(typeof window==='undefined')return Promise.resolve();
 return new Promise(resolve=>{let frame=0,done=false;const finish=()=>{if(done)return;done=true;clearTimeout(timer);if(frame)cancelAnimationFrame(frame);resolve();};const timer=setTimeout(finish,50);frame=requestAnimationFrame(finish);});
}
