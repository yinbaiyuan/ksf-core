import type { ApplicationSDK } from '@ksf/sdk/react';
import './style.css';
export function mount(root:HTMLElement,sdk:ApplicationSDK){
  root.classList.add('card-fixture');
  const label=document.createElement('strong'),value=document.createElement('span'),button=document.createElement('button'),runtime=document.createElement('small'),crash=document.createElement('button');
  label.textContent=sdk.cardId==='summary'?'摘要卡片':'明细卡片';button.textContent='增加数值';crash.textContent='模拟后端故障';
  const count=()=>Number((sdk.configuration.get() as {count?:number})?.count??0);
  button.onclick=()=>sdk.configuration.set({count:count()+1});
  crash.onclick=()=>{void sdk.call('crash').catch(()=>{});};
  const sync=()=>{value.textContent='数值 '+count();};const off=sdk.subscribe(sync);sync();
  void sdk.call<{pid:number}>('read').then(result=>{runtime.textContent='后端 '+result.pid;}).catch(error=>sdk.reportError(error));
  root.append(label,value,button,runtime,crash);
  return {dispose(){off();root.replaceChildren();}};
}
