import {useWindowContext} from '@ksf/sdk/window-context';
import {useEffect,useId,useRef,type RefObject} from 'react';
import type {CatalogItem} from './catalog';import {componentGroups} from './catalog';
import {ComponentLivePreview,hasLiveExample} from './component-live-preview';
import type {ColorTheme} from '@ksf/sdk/theme';
import {componentReferences} from '@ksf/sdk/component-catalog';
import {Breadcrumb} from '@ksf/sdk/breadcrumb';import {Tabs} from '@ksf/sdk/tabs';import {Anchor} from '@ksf/sdk/anchor';import {Select} from '@ksf/sdk/select';import {Button} from '@ksf/sdk/button';import {Tag} from '@ksf/sdk/tag';import {InlineAlert} from '@ksf/sdk/inline-alert';import {EmptyState} from '@ksf/sdk/empty-state';import {Heading,Text,InlineCode} from '@ksf/sdk/typography';
import {componentContracts} from './component-contracts';
import {detailTabs,type DetailTab} from './library-model';export {detailTabs};export type {DetailTab};
import {CodeView,ApiTable,ContractPanel,ReferencePanel,AgentGuide} from './library-documentation';
import {ViewThemePreview} from './view-page';import {ThemePreview,ThemeColorTable,themeReactUsage} from './theme-page';
/** Re-align an explicit example jump when lazy examples change the heights above it. */
function alignExampleDuringLoad(node:HTMLElement,host:HTMLElement,initial=true){
 const view=node.ownerDocument.defaultView,grid=node.parentElement;if(!view||!grid)return()=>{};
 let frame=0,stopped=false,deadline=0,lastHeight=grid.getBoundingClientRect().height;
 const finish=()=>{if(stopped)return;stopped=true;observer.disconnect();view.cancelAnimationFrame(frame);view.clearTimeout(deadline);for(const event of ['wheel','pointerdown','keydown'])host?.removeEventListener(event,finish,true);};
 const observer=new view.ResizeObserver(()=>{const height=grid.getBoundingClientRect().height;if(height===lastHeight||stopped)return;lastHeight=height;view.cancelAnimationFrame(frame);frame=view.requestAnimationFrame(()=>{if(!stopped&&node.isConnected)host.scrollTo({top:host.scrollTop+node.getBoundingClientRect().top-host.getBoundingClientRect().top-8,behavior:'instant'});});});
 observer.observe(grid);for(const event of ['wheel','pointerdown','keydown'])host?.addEventListener(event,finish,{capture:true,passive:true});deadline=view.setTimeout(finish,3000);
 if(initial)host.scrollTo({top:host.scrollTop+node.getBoundingClientRect().top-host.getBoundingClientRect().top-8,behavior:view.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});return finish;
}

export function ComponentDetail({item, tab, onTab, exampleId, onExample, onShowUsage, theme,scrollContainer,onOverview,onGroup}: {
  item: CatalogItem; tab: DetailTab; onTab: (tab: DetailTab) => void;
  exampleId?: string; onExample: (id: string) => void;
  onShowUsage: (id: string) => void;
  theme?: ColorTheme; scrollContainer:RefObject<HTMLDivElement|null>;onOverview:()=>void;onGroup:(id:string|null)=>void;
}) {
  const id = useId(), selectedAnchor=useRef<string|undefined>(undefined),scrollCleanup=useRef<(()=>void)|null>(null),windowContext=useWindowContext();
  useEffect(()=>{if(tab!=='preview')selectedAnchor.current=undefined;return()=>{scrollCleanup.current?.();scrollCleanup.current=null;};},[item.id,tab,windowContext.active,windowContext.enabled]);
  const group = componentGroups.find(value => value.items.includes(item));
  const contract = componentContracts.find(value => value.id === item.id);
  const example = contract?.examples.find(value => value.id === exampleId) ?? contract?.examples[0];
  const availablePreview = example && hasLiveExample(example.id);
  const isButton = item.id === 'ACT-01';
  const isView = item.id === 'LAY-01';
  const isTheme = item.id === 'FND-01';
  const isTextField = item.id === 'INP-01';
  const apiCaption = isButton ? 'ButtonProps · 继承原生 button 属性'
    : isView ? 'ViewProps · 继承原生 div 属性并支持 ref' : isTheme ? '主题颜色 · 公共导出与绑定接口' : `${item.name} · 公共接口与原生属性`;
  const exampleSelector=contract&&contract.examples.length>1&&<Select label="示例" value={example?.id} options={contract.examples.map(e=>({value:e.id,label:e.title}))} onValueChange={onExample}/>;
  const liveExamples=contract?.examples.filter(e=>hasLiveExample(e.id))??[];
  const anchors=liveExamples.map((e,index)=>({id:`${id}-example-${index}`,label:e.title}));
  useEffect(()=>{if(tab!=='preview'||!exampleId||selectedAnchor.current===exampleId||!scrollContainer.current)return;const index=liveExamples.findIndex(e=>e.id===exampleId),node=scrollContainer.current.ownerDocument.getElementById(`${id}-example-${index}`);if(node&&scrollContainer.current.contains(node)){scrollCleanup.current?.();scrollCleanup.current=alignExampleDuringLoad(node,scrollContainer.current);}},[tab,exampleId,item.id]);
  return <article className="component-detail" data-component-id={item.id}>
    <header className="detail-heading">
     <Breadcrumb items={[{label:'组件总览',onClick:onOverview},{label:group?.label??'组件',onClick:()=>onGroup(group?.id??null)},{label:item.id}]}/>
     <div className="detail-title"><Heading level={1}>{item.name} <Text tone="muted">{item.label}</Text></Heading><Tag tone={item.available?'success':'warning'}>{item.available?'已具备':'待实现'}</Tag></div>
     <Text as="p" tone="muted">{contract?.purpose??item.purpose}</Text><div className="detail-entry">{item.available?<InlineCode>{item.available.entry}</InlineCode>:<Text size="small">尚无 SDK 导入入口</Text>}</div>
    </header>
    <Tabs className="detail-tabs" label={`${item.name} 详情`} items={detailTabs.map(t=>({id:t.id,label:t.label,tabId:`${id}-${t.id}`,panelId:`${id}-panel`}))} value={tab} onValueChange={v=>onTab(v as DetailTab)}/>
    <div className="detail-panel" role="tabpanel" id={`${id}-panel`} aria-labelledby={`${id}-${tab}`} tabIndex={0}>
      {!item.available && <InlineAlert tone="warning" heading="待实现 · 设计讨论稿">这里说明用途与候选边界，不表示组件已经交付。</InlineAlert>}
      {tab === 'preview' && (item.available && example && availablePreview ? <>
        {isTheme && <ThemePreview/>}
        <div className="detail-demo-index"><Text strong>{liveExamples.length} 个示例</Text><Anchor label="示例目录" items={anchors} container={scrollContainer} orientation="horizontal" onSelect={target=>{const index=anchors.findIndex(a=>a.id===target),value=liveExamples[index],node=scrollContainer.current?.ownerDocument.getElementById(target);if(value&&node&&scrollContainer.current){selectedAnchor.current=value.id;scrollCleanup.current?.();scrollCleanup.current=alignExampleDuringLoad(node,scrollContainer.current,false);onExample(value.id);}}}/></div>
        <div className="detail-example-grid">{liveExamples.map((value,index) => <section id={`${id}-example-${index}`} key={value.id} className="detail-example" data-demo-id={value.id} data-example-layout={value.layout}>
          <ComponentLivePreview exampleId={value.id} theme={theme}/>
          <div className="detail-example-description"><Heading level={3}>{value.title}</Heading><small>{value.referenceIds?.some(id => id.startsWith('kokonut:')) ? 'Kokonut UI · 免费MIT' : 'KSF / Ant 基础'}</small><p>{value.effects}</p><Button variant="text" className="detail-text-link" onClick={()=>onShowUsage(value.id)}>查看用法与代码 →</Button></div>
        </section>)}</div>
        {isView && <ViewThemePreview/>}
      </> : <>
        <EmptyState heading="尚无真实 SDK 预览" description="组件交付后，这里呈现与用法、API 对应的可操作示例。"/>
        <section className="detail-notes"><Heading level={3}>{isTextField ? '计划核对的场景' : '组件职责'}</Heading>{isTextField ? <ol><li>基础文本输入，保留中文输入法组合过程。</li><li>外部标签、帮助说明与错误信息关联。</li><li>受控 / 非受控用法，以及原生表单接入。</li></ol> : <p>{item.purpose}</p>}</section>
        {!contract && item.note && <p>{item.note}</p>}
      </>)}
      {tab === 'usage' && <>
        {item.available && example ? <>
          <section><div className="detail-section-heading"><Heading level={3}>示例用法</Heading>{exampleSelector}</div><p className="detail-lead">{isTheme ? '代码就是普通 DOM 标准预览的源文件，包含导入、容器绑定与清理函数。' : '代码就是当前预览的源文件，包含 KSF 导入与完整组件定义；在应用的 View 中渲染以继承主题。'}</p><CodeView source={example.source}/><div className="detail-example-caption"><code>{example.id}</code><span>{isTheme ? '在应用 mount 中传入自己的容器与 sdk，dispose 时释放' : '复制后仍需在应用入口渲染'}</span></div></section>
          {isTheme && <section><Heading level={3}>React / CSS 中消费颜色</Heading><p className="detail-lead">普通 DOM 接入使用上面的标准示例；View 自动建立主题边界，下方展示相同变量在 React 和应用样式中的写法。</p><CodeView source={themeReactUsage} label="颜色变量用法"/></section>}
          <section className="detail-notes"><Heading level={3}>接入要点</Heading><ul>{(isButton ? ['type默认button，提交表单显式使用submit。', 'loading由应用控制，表达执行状态并防止重复点击；请求与错误处理仍由应用承担。', '导航使用链接，纯图标按钮提供可访问名称。'] : isView ? ['省略theme时继承最近父View，再跟随宿主。', '间距、尺寸和响应式使用原生style/className。', '支持原生div属性及HTMLDivElement ref。'] : isTheme ? ['普通DOM引入theme.css，卸载时释放bindTheme订阅。', 'themeVars跟随范围，themeColors是固定原始色值。', '局部覆盖只作用于应用自己的容器。'] : contract?.prerequisites ?? []).map(note => <li key={note}>{note}</li>)}</ul></section>
        </> : <>
          <section className="detail-notes"><Heading level={3}>什么时候使用</Heading><p>{isTextField ? '名称、标题、邮箱等短文本输入；多行内容、日期、数值编辑分别留给对应组件讨论。' : item.purpose}</p></section>
          <section className="detail-notes"><Heading level={3}>如何组合</Heading><p>{isTextField ? '输入本体与外部 label 组合。帮助、错误和校验由应用处理，未来是否用 Field 统一组合另行确认；placeholder 不替代标签。' : item.note ?? '由应用组合具体业务，接口在实现前逐项确认。'}</p></section>
          <div className="detail-unavailable-code"><strong>暂无可复制的 {item.name} SDK 示例</strong><p>当前应用可使用原生 HTML 或自行选择其他组件库。</p></div>
        </>}
        {contract && <AgentGuide contract={contract} exampleId={example?.id}/>}
      </>}
      {tab === 'api' && <>
        {contract?.bindings.length ? <section className="detail-notes"><Heading level={3}>{item.composition ? '组合依赖' : '公共导出'}</Heading><dl className="detail-exports">{contract.bindings.map(binding => <div key={binding.module}><dt><code>{binding.module}</code></dt><dd>{binding.exports.length ? binding.exports.map(name => <code key={name}>{name}</code>) : '样式入口，按需引入'}</dd></div>)}</dl></section> : null}
        {item.composition ? <section className="detail-notes"><Heading level={3}>组合接入</Heading><p>本条目提供可复制的组合示例，不声明独立业务组件或业务API。上方列出实际依赖，下方记录来源；状态与业务动作在示例应用中组织。</p><ul>{contract?.responsibilities.application.map(note => <li key={note}>{note}</li>)}</ul></section> : contract?.releasedApi ? <><ApiTable rows={contract.releasedApi} name={item.name} caption={apiCaption}/>{isTheme && <ThemeColorTable/>}<section className="detail-notes"><Heading level={3}>{isTheme ? '主题范围与生命周期' : '主题与原生行为'}</Heading><p>{isButton ? '主题从 View / bindTheme 边界继承，Button 没有独立 theme 属性。支持原生 button 属性与真实 HTMLButtonElement ref。' : isView ? 'theme 可选 light / dark；省略时继承最近父 View，再跟随宿主，宿主外回退系统主题。支持原生 div 属性及真实 HTMLDivElement ref，不额外提供 spacing、size 或业务状态接口。' : isTheme ? 'bindTheme(element, sdk, {theme?}) 返回清理函数；局部覆盖只影响本容器，卸载时释放。旧 --ksf-view-* 名称继续兼容。' : item.id === 'FND-02' ? 'Text默认继承文字色，muted使用公共语义色。Heading输出原生标题并提供预设字号与标题间距，p默认底部1em；InlineCode输出原生code。应用可通过CSS调整组合布局。' : item.id === 'FND-03' ? '图标继承currentColor与父级主题；label为空时作为装饰，非空时只暴露一个有名称的图像。ref指向外层span，不绑定图标库。' : item.id === 'FND-04' ? 'Kbd继承文字颜色和公共浅深表面色，输出原生kbd；符号名称使用aria-label。不会注册或拦截任何按键。' : contract.prerequisites.join(' ')}</p>{contract.unsupported?.filter(value => !componentReferences.components[item.id]?.notCovered.includes(value)).length ? <ul>{contract.unsupported.filter(value => !componentReferences.components[item.id]?.notCovered.includes(value)).map(value => <li key={value}>{value}</li>)}</ul> : null}</section></> : <>
          <section className="detail-notes"><Heading level={3}>正式接口</Heading><p>正式导入：无。正式 API：无。下面的候选规格仍待讨论。</p></section>
          {contract?.proposedApi ? <ApiTable rows={contract.proposedApi} name={item.name} proposed/> : <p>{item.note ?? '后续根据实际场景细化。'}</p>}
        </>}
        <ReferencePanel id={item.id}/>
        {contract && <><section className="detail-notes"><Heading level={3}>兼容与可用性</Heading><p>当前资料来自 SDK {contract.sdkEvidence.observedVersion}。最早支持版本尚未核定，Agent 必须检查目标工程的实际公共导出。{contract.delivery === 'planned' ? '本条目不可用于生成 SDK 导入代码。' : isTheme ? '配色与绑定代码随应用打包，可供 React、普通 DOM 或其他组件库使用。' : '应用仍自行打包所选组件与 React，不依赖统一 renderer。'}</p></section><ContractPanel contract={contract}/></>}
      </>}
    </div>
  </article>;
}
