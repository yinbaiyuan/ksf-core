import {useEffect,useId,useRef,useState} from 'react';
import {Button} from '@ksf/sdk/button';
import {ScrollArea} from '@ksf/sdk/scroll-area';
import {InlineAlert} from '@ksf/sdk/inline-alert';
import {Table,type TableColumn} from '@ksf/sdk/table';
import {DescriptionList} from '@ksf/sdk/description-list';
import {Accordion} from '@ksf/sdk/accordion';
import {Tag} from '@ksf/sdk/tag';
import {Link} from '@ksf/sdk/link';
import {Heading,Text,InlineCode} from '@ksf/sdk/typography';
import {readComponentRecord,catalogIdentity,componentReferences} from '@ksf/sdk/component-catalog';
import type {ApiRow,ComponentContract} from './component-contracts';
export function CodeView({source,label='完整示例'}:{source:string;label?:string}){
 const [feedback,setFeedback]=useState(''),root=useRef<HTMLDivElement>(null),sequence=useRef(0);
 useEffect(()=>{setFeedback('');sequence.current++;return()=>{sequence.current++;};},[source]);
 const copy=async()=>{const id=++sequence.current;try{const clipboard=root.current?.ownerDocument.defaultView?.navigator.clipboard;if(!clipboard)throw Error('Clipboard unavailable');await clipboard.writeText(source);if(sequence.current===id)setFeedback('已复制');}catch{if(sequence.current===id)setFeedback('复制不可用，请选择下方文本复制');}};
 return <div ref={root} className="detail-code"><div className="library-code-heading"><Text size="small">{label}</Text><Button variant="text" size="small" onClick={()=>void copy()}>复制{label==='完整示例'?'示例':label}</Button></div>
  {feedback==='已复制'&&<Text size="caption" tone="success" role="status">已复制</Text>}{feedback&&feedback!=='已复制'&&<InlineAlert tone="warning" heading="复制不可用">请直接选择下方完整文本复制。</InlineAlert>}
  <ScrollArea label={`${label}代码`} orientation="both" tabIndex={-1} className="library-code-scroll library-scroll-area"><pre tabIndex={0}><code>{source}</code></pre></ScrollArea>
 </div>;
}
export function ApiTable({rows,name,caption,proposed=false}:{rows:ApiRow[];name:string;caption?:string;proposed?:boolean}){
 const data=rows.map((row,index)=>({...row,rowId:`${index}-${row.name}`}));
 const columns:TableColumn<typeof data[number]>[]=[{id:'name',header:'属性',width:150,cell:r=><InlineCode>{r.name}</InlineCode>},{id:'type',header:'类型 / 取值',width:190,cell:r=><InlineCode>{r.type}</InlineCode>},{id:'default',header:'默认值',width:100,cell:r=>r.defaultValue},{id:'description',header:'说明',width:260,cell:r=>r.description}];
 return <section className="library-api-table">{(caption||proposed)&&<Text as="p" size="small" tone="muted">{proposed?'候选 API · 非已发布接口，默认值尚未确定':caption}</Text>}<Table label={`${name} ${proposed?'候选 ':''}API 表格`} rows={data} columns={columns} getId={r=>r.rowId} size="small" pagination={false}/></section>;
}
export function ContractPanel({contract}:{contract:ComponentContract}){
 return <Accordion className="detail-disclosure" data-component-contract={contract.id} appearance="plain" items={[{id:'contract',title:'组件契约 · 供 Agent 读取 / JSON',content:<><Text as="p">来自 SDK 正式组件数据。此处未指定目标应用，SDK 支持情况尚未核对；请通过下方 CLI 在目标工程查询。</Text><DescriptionList columns={3} size="small" items={[{id:'delivery',label:'组件状态',content:contract.delivery==='available'?'已具备':'待实现'},{id:'sdk',label:'资料 SDK',content:contract.sdkEvidence.observedVersion},{id:'target',label:'目标支持',content:'未指定目标应用，尚未核对'}]}/><CodeView source={JSON.stringify(readComponentRecord(contract.id),null,2)} label="组件契约 JSON"/></>} ]}/>;
}
export function ReferencePanel({id}:{id:string}){
 const record=componentReferences.components[id];if(!record)return null;
 const render=(values:typeof record.target)=><div className="library-reference-items">{values.map(source=><div key={source.library+source.component}><Text strong>{source.library} · {source.component}</Text><InlineCode>{source.package}@{source.versionType==='commit'?source.version.slice(0,12):source.version}</InlineCode>{source.license&&<Tag>{source.license}</Tag>}<div><Link href={source.sourceUrl} target="_blank">固定版本源码 ↗</Link>{source.documentationUrl&&<Link href={source.documentationUrl} target="_blank">固定版本文档 ↗</Link>}</div></div>)}</div>;
 return <section className="detail-reference"><Heading level={3}>实现参考</Heading><Text as="p" tone="muted">{record.adopted.length?'当前实现已核对以下参考版本。':record.target.length?'以下是目标参考版本，当前实现尚未按此基线完成核对。':'KSF 原生能力或其他参考候选。'}</Text>
 <DescriptionList columns={1} size="small" items={[...(record.adopted.length?[{id:'adopted',label:'已采用',content:render(record.adopted)}]:[]),...(record.target.length?[{id:'target',label:'目标',content:render(record.target)}]:[])]}/>
 {record.differences.length>0&&<><Heading level={4}>KSF 适配</Heading><ul>{record.differences.map(v=><li key={v}>{v}</li>)}</ul></>}{record.notCovered.length>0&&<><Heading level={4}>尚未覆盖</Heading><ul>{record.notCovered.map(v=><li key={v}>{v}</li>)}</ul></>}
 </section>;
}
export function AgentGuide({contract, exampleId}: {contract: ComponentContract; exampleId?: string}) {
  const headingId=useId();
  const example = contract.examples.find(value => value.id === exampleId) ?? contract.examples[0];
  const commands = `ksf-app components search "${contract.name}" --app-dir ./my-app${contract.delivery === 'planned' ? ' --include-planned' : ''} --json
ksf-app components read ${contract.id} --app-dir ./my-app --json
ksf-app components example ${example?.id ?? contract.id} --app-dir ./my-app --json`;
  return <section className="detail-agent" aria-labelledby={headingId}>
    <Heading level={3} id={headingId}>Agent 查询</Heading>
    <ol className="detail-steps"><li><strong>查找组件</strong><span>按编号、名称、别名和用途查找，区分已具备与待实现。</span></li><li><strong>核对目标 SDK</strong><span>读取真实依赖与构建来源，核对公共导出、契约摘要和示例类型。</span></li><li><strong>获取同一示例</strong><span>支持核对通过才返回源码；待实现、未知或不支持时明确说明原因。</span></li></ol>
    <p>将 ./my-app 替换为目标应用源码目录。工具随 SDK 提供，离线只读，不执行应用代码或安装依赖。已有且适合的组件可直接使用，应用仍可自行选择其他组件库。</p>
    <CodeView source={commands} label="SDK 查询命令"/>
    {contract.delivery === 'planned' && <p>{contract.name} 尚未实现；示例获取会返回 COMPONENT_NOT_IMPLEMENTED，不产生导入代码。候选规格可通过 read 的 --include-proposal 显式读取。</p>}
    <Accordion appearance="plain" className="detail-disclosure" items={[{id:"read",title:"当前目录读取结果 · 未指定目标应用",content:<CodeView source={JSON.stringify(readComponentRecord(contract.id),null,2)} label="返回 JSON"/>}]}/>
    <p>当前资料：SDK {catalogIdentity.sdkVersion} · 内容摘要 {catalogIdentity.fingerprint.slice(0, 12)}。组件交付状态与目标支持情况分别判断；版本号相同也不能省略核对。</p>
  </section>;
}

