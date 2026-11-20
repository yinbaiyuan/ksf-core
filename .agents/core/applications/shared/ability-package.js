const names={cooperation:'协同',partner:'搭档',competency:'基本功','data-package':'数据包'};
const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
const button=(text,click,cls='')=>{const b=el('button','ka-button '+cls,text);b.type='button';b.addEventListener('click',click);return b;};

export async function mountAbilityPackage(main,sdk,onBack,initial){
  let alive=true,busy=false,rows=[],plan=null;
  const selected=new Map();if(initial)selected.set(initial.source+':'+initial.id,initial);
  const panel=el('section','ka-package'),heading=el('header','ka-heading'),title=el('div');
  title.append(el('p','ka-eyebrow','Package abilities'),el('h1','','打包能力'));
  const back=button('返回能力',onBack);heading.append(title,back);panel.append(heading,el('p','ka-muted','选择多项能力生成一个 .ksfabi 文件。个人能力可直接打包，依赖和必要资源自动随包保存。打包使用已保存的原件。'));
  const form=el('div','ka-package-filters'),nameLabel=el('label','','包名称'),name=el('input');name.value='我的能力包';name.maxLength=80;name.setAttribute('aria-label','包名称');nameLabel.append(name);
  const search=el('input');search.type='search';search.placeholder='搜索名称、ID或说明';search.setAttribute('aria-label','搜索待打包能力');
  const type=el('select');type.setAttribute('aria-label','筛选打包能力类型');for(const [value,text] of [['','全部类型'],...Object.entries(names)]){const o=el('option','',text);o.value=value;type.append(o);}
  const source=el('select');source.setAttribute('aria-label','筛选打包能力来源');for(const [value,text] of [['','全部来源'],['user','个人能力'],['system','系统能力'],['installed','能力源']]){const o=el('option','',text);o.value=value;source.append(o);}
  form.append(nameLabel,search,type,source);panel.append(form);
  const tools=el('div','ka-actions'),count=el('span','ka-muted'),list=el('div','ka-package-list'),status=el('p','ka-banner'),review=el('div','ka-package-review'),actions=el('div','ka-actions');status.setAttribute('role','status');
  const visible=()=>rows.filter(r=>(!source.value||(source.value==='installed'?!['user','system'].includes(r.source):r.source===source.value))&&(!type.value||r.id.startsWith(type.value+'.'))&&[r.name,r.id,r.description].join(' ').toLocaleLowerCase().includes(search.value.toLocaleLowerCase()));
  const reset=()=>{plan=null;review.replaceChildren();download.disabled=true;status.hidden=true;};
  function renderList(){
    list.replaceChildren();
    for(const row of visible()){
      const key=row.source+':'+row.id,label=el('label','ka-package-row'),check=el('input');check.type='checkbox';check.checked=selected.has(key);check.disabled=busy;check.setAttribute('aria-label','选择 '+row.name);
      check.addEventListener('change',()=>{if(check.checked)selected.set(key,row);else selected.delete(key);reset();update();});
      const text=el('span');text.append(el('strong','',row.name),el('small','ka-muted',`${names[row.id.split('.')[0]]} · ${row.source==='user'?'个人能力':row.source} · ${row.version}`),el('small','ka-muted',row.id));label.append(check,text);list.append(label);
    }
    if(!visible().length)list.append(el('p','ka-muted','没有匹配的能力。'));
    update();
  }
  function update(){count.textContent=`已选择 ${selected.size} 项`;preview.disabled=busy||!selected.size;clear.disabled=busy||!selected.size;selectAll.disabled=busy||!visible().length;}
  const selectAll=button('全选筛选结果',()=>{visible().forEach(r=>selected.set(r.source+':'+r.id,r));reset();renderList();});
  const clear=button('清空选择',()=>{selected.clear();reset();renderList();});tools.append(selectAll,clear,count);panel.append(tools,list,status,review,actions);
  const input=()=>({name:name.value,items:[...selected.values()].map(r=>({id:r.id,source:r.source,version:r.version}))});
  const run=async action=>{if(busy)return;busy=true;status.hidden=true;panel.setAttribute('aria-busy','true');for(const n of panel.querySelectorAll('button,input,select'))n.disabled=true;try{await action();}catch(e){plan=null;review.replaceChildren();status.textContent=e.message;status.classList.add('ka-error');status.hidden=false;status.setAttribute('role','alert');}finally{busy=false;if(alive){panel.removeAttribute('aria-busy');for(const n of panel.querySelectorAll('button,input,select'))n.disabled=false;download.disabled=!plan;update();}}};
  const preview=button('预览能力包',()=>void run(async()=>{
    const result=await sdk.call('previewAbilityPackage',input());if(!alive)return;plan=result;review.replaceChildren(el('h2','','包内能力'),el('p','ka-muted',`${result.roots.length} 项已选能力，${result.objects.length-result.roots.length} 项自动依赖 · ${(result.size/1024).toFixed(1)} KiB`));
    for(const o of result.objects)review.append(el('p','',`${o.name} · ${o.version}${o.dependency?' · 自动依赖':''}`));
    if(result.coreDependencies.length){review.append(el('h2','','所需 Core 能力'));for(const d of result.coreDependencies)review.append(el('p','ka-muted',d.id+'@'+d.version));}
    review.append(el('p','ka-muted','个人修订基线和设置不会进入包；个人原件保持不变。'));download.disabled=false;review.scrollIntoView({block:'nearest'});
  }));
  const download=button('下载能力包',()=>void run(async()=>{
    const result=await sdk.call('downloadAbilityPackage',{...input(),planDigest:plan.planDigest});if(!alive)return;
    const bytes=Uint8Array.from(atob(result.content),c=>c.charCodeAt(0)),url=URL.createObjectURL(new Blob([bytes],{type:'application/octet-stream'})),a=el('a');a.href=url;a.download=result.name;panel.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
    status.classList.remove('ka-error');status.setAttribute('role','status');status.textContent='已生成 '+result.name+'，可在能力商店中导入。';status.hidden=false;
  }),'ka-primary');download.disabled=true;actions.append(preview,download);
  search.addEventListener('input',renderList);type.addEventListener('change',renderList);source.addEventListener('change',renderList);name.addEventListener('input',reset);
  main.replaceChildren(panel);status.hidden=true;
  await run(async()=>{
    const results=await Promise.all(Object.keys(names).map(type=>sdk.call('listObjects',{type,source:'effective'})));if(!alive)return;
    rows=results.flatMap(r=>r.data.objects).filter(r=>!r.protected&&r.status!=='archived');
    const errors=results.flatMap(r=>r.errors??[]);renderList();if(errors.length){status.textContent='部分目录读取失败：'+errors.map(e=>e.message).join('；');status.hidden=false;}
  });
  return {dispose(){alive=false;panel.remove();}};
}
