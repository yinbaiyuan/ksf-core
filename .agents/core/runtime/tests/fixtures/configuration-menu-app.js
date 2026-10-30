// Fictional browser acceptance app. Installed only in the isolated T03 fixture.
export function mount(container,sdk){
 let count=0,checked=false,blocked=false,settings=true,disabled=false;
 const heading=document.createElement('h2');heading.textContent='菜单 SDK 验收';const status=document.createElement('p');status.setAttribute('role','status');status.textContent='等待菜单点击';
 const controls=document.createElement('div');container.append(heading,status,controls);
 const hit=(label,event)=>{count++;status.textContent=label+' · '+event.id+' · '+count;};
 const items=()=>[
  {id:'file',label:'文件',children:[{id:'file.increment',label:'增加计数',disabled,onAction:event=>hit('点击成功',event)},{id:'file.disabled',label:'禁用操作',disabled:true,onAction:()=>{throw Error('Disabled command ran');}},{id:'file.tools',label:'工具',children:[{id:'tools.nested',label:'更多工具',children:[{id:'tools.deep',label:'深层动作',onAction:event=>hit('级联点击成功',event)}]}]}]},
  {id:'view',label:'显示',children:[{id:'view.checked',label:'显示勾选',checked,onAction:event=>{checked=event.checked;status.textContent='勾选状态 '+checked;registration.update(items());}},{id:'view.error',label:'显示应用错误',onAction:async()=>{throw Error('隔离验收错误');}}]},
  ...Array.from({length:6},(_,index)=>({id:'extra'+index,label:'扩展菜单'+(index+1),children:[{id:'extra'+index+'.action',label:'扩展动作'+(index+1),onAction:event=>hit('扩展点击成功',event)}]})),
  {id:'advanced',label:'高级配置…',placement:'application',onAction:event=>hit('应用菜单扩展',event)},
 ];
 const registration=sdk.menu.register(items());let unregister=sdk.onSettings(()=>{status.textContent='设置入口已触发 · '+sdk.surfaceId;});
 for(const [label,run] of [
  ['切换设置入口',()=>{settings=!settings;if(settings)unregister=sdk.onSettings(()=>{status.textContent='设置入口已触发 · '+sdk.surfaceId;});else unregister();status.textContent='设置入口 '+settings;}],
  ['切换菜单禁用',()=>{disabled=!disabled;registration.update(items());status.textContent='增加计数禁用 '+disabled;}],
  ['启用退出保护',()=>{blocked=true;status.textContent='退出保护已启用';}],
 ]){const button=document.createElement('button');button.textContent=label;button.onclick=run;controls.append(button);}
 const unguard=sdk.onBeforeClose(()=>{if(!blocked)return true;return new Promise(resolve=>{const dialog=document.createElement('div');dialog.setAttribute('role','alertdialog');const text=document.createElement('p');text.textContent='保留验收草稿？';dialog.append(text);for(const [label,accept] of [['取消退出',false],['放弃并退出',true]]){const button=document.createElement('button');button.textContent=label;button.onclick=()=>{dialog.remove();resolve(accept);};dialog.append(button);}container.append(dialog);});});
 return {dispose(){registration.dispose();unregister();unguard();container.replaceChildren();}};
}
