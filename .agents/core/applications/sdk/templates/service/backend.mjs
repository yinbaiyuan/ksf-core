export function activate(context) {
  let timer, ticks=0;
  return {
    startBackground(){
      timer=setInterval(()=>void context.tasks.run(async()=>{ticks++;}),60000);
      timer.unref();
    },
    call(method){if(method==='status')return {ticks};throw Error('未知方法。');},
    dispose(){clearInterval(timer);}
  };
}
