import {ScrollArea} from '@ksf/sdk/scroll-area';import '@ksf/sdk/component-examples/catalog-examples.css';
export function ScrollAreaBothExample(){return <ScrollArea label="双向资料表" orientation="both" style={{height:200}} className="ksf-demo-frame"><div className="ksf-demo-article" style={{width:640}}>{Array.from({length:14},(_,i)=><p key={i}>第 {i+1} 行　项目方案　访谈纪要　交付资料　现场核对</p>)}</div></ScrollArea>;}
